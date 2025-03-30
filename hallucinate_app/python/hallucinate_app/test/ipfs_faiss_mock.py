"""
Mock implementation of the IPFS FAISS module for testing

Provides a mock interface that mimics the behavior of the actual ipfs_faiss module
without requiring actual FAISS or IPFS dependencies.
"""

import os
import json
import logging
import time
from datetime import datetime
from typing import Dict, List, Any, Optional, Union
import random
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ipfs_faiss_mock")

class IPFSFaissMock:
    """
    Mock implementation of the IPFS FAISS module
    
    This class provides a testing interface that mimics the behavior of IPFSFaiss
    without requiring the actual FAISS library or IPFS dependencies.
    """
    
    # Required dependencies for the real implementation
    DEPENDENCIES = ["faiss", "ipfs_kit_py", "numpy"]
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the mock IPFS FAISS module
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Keep track of "created" indexes in memory
        self.indexes = {}
        self.index_info = {}
        
        # Mock IPFS CIDs for indexes
        self.index_cids = {}
        
        # Track initialization state
        self.initialized = False
        
        logger.info("Mock IPFS FAISS module initialized")
    
    async def init(self) -> bool:
        """
        Initialize the mock IPFS FAISS module
        
        Returns:
            bool: True if initialization successful
        """
        self.initialized = True
        logger.info("Mock IPFS FAISS module initialization complete")
        return True
    
    async def create_index(self, dimensions: int, index_type: str = "Flat", options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Create a mock FAISS index
        
        Args:
            dimensions: Vector dimensions
            index_type: Type of FAISS index to create
            options: Additional options
            
        Returns:
            Dict: Result with index ID
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        try:
            # Generate a mock index ID
            index_id = f"mock-index-{uuid.uuid4()}"
            
            # Store index info
            self.index_info[index_id] = {
                "dimensions": dimensions,
                "index_type": index_type,
                "created_at": datetime.now().isoformat(),
                "vectors_count": 0,
                "vectors": []  # Will store mock vectors
            }
            
            logger.info(f"Created mock FAISS index: {index_id} with {dimensions} dimensions")
            
            return {
                "success": True,
                "index_id": index_id,
                "dimensions": dimensions,
                "index_type": index_type
            }
        except Exception as e:
            logger.error(f"Error creating mock FAISS index: {e}")
            return {"error": str(e)}
    
    async def add_vectors(self, index_id: str, vectors: List[List[float]], ids: List[int] = None) -> Dict[str, Any]:
        """
        Add vectors to mock FAISS index
        
        Args:
            index_id: Index ID
            vectors: List of vectors to add
            ids: Optional vector IDs
            
        Returns:
            Dict: Result with added count
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        if index_id not in self.index_info:
            return {"error": f"Index {index_id} not found"}
        
        try:
            # If no IDs provided, generate sequential IDs starting from current count
            if ids is None:
                current_count = self.index_info[index_id]["vectors_count"]
                ids = list(range(current_count, current_count + len(vectors)))
            
            # Store vectors with IDs
            for i, vector in enumerate(vectors):
                vector_id = ids[i] if i < len(ids) else None
                self.index_info[index_id]["vectors"].append({
                    "id": vector_id,
                    "vector": vector
                })
            
            # Update vector count
            self.index_info[index_id]["vectors_count"] += len(vectors)
            
            logger.info(f"Added {len(vectors)} vectors to mock index {index_id}")
            
            return {
                "success": True,
                "index_id": index_id,
                "vectors_added": len(vectors),
                "total_vectors": self.index_info[index_id]["vectors_count"]
            }
        except Exception as e:
            logger.error(f"Error adding vectors to mock FAISS index: {e}")
            return {"error": str(e)}
    
    async def search(self, index_id: str, query_vector: List[float], k: int = 5, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Perform mock search in FAISS index
        
        Args:
            index_id: Index ID
            query_vector: Query vector
            k: Number of results to return
            options: Search options
            
        Returns:
            Dict: Mock search results
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        if index_id not in self.index_info:
            return {"error": f"Index {index_id} not found"}
        
        try:
            # For mock, just return k random results with decreasing similarity
            results = []
            
            # Get vector dimension from index info
            dim = self.index_info[index_id]["dimensions"]
            
            # Generate mock results - if we have vectors in the index, use them
            if self.index_info[index_id]["vectors_count"] > 0:
                # Select random vectors from the stored ones
                vectors = self.index_info[index_id]["vectors"]
                num_results = min(k, len(vectors))
                
                # Create results with decreasing similarity scores
                for i in range(num_results):
                    vector_data = vectors[i % len(vectors)]
                    results.append({
                        "id": vector_data["id"] or i,
                        "score": 1.0 - (i * 0.1),  # Decreasing similarity
                        "vector": vector_data["vector"]  # Return the actual vector
                    })
            else:
                # No vectors in index, generate completely random results
                for i in range(min(k, 5)):
                    results.append({
                        "id": i,
                        "score": 1.0 - (i * 0.1),  # Decreasing similarity
                        "vector": [random.random() for _ in range(dim)]  # Random vector
                    })
            
            logger.info(f"Performed mock search in index {index_id}, returned {len(results)} results")
            
            return {
                "success": True,
                "index_id": index_id,
                "query": query_vector[:5] + (["..."] if len(query_vector) > 5 else []),  # Truncate for logging
                "k": k,
                "results": results
            }
        except Exception as e:
            logger.error(f"Error performing mock search in FAISS index: {e}")
            return {"error": str(e)}
    
    async def save_to_ipfs(self, index_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Mock saving FAISS index to IPFS
        
        Args:
            index_id: Index ID
            options: Save options
            
        Returns:
            Dict: Mock result with CID
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        if index_id not in self.index_info:
            return {"error": f"Index {index_id} not found"}
        
        try:
            # Generate a deterministic mock CID based on index ID
            mock_cid = f"Qm{''.join([c if c.isalnum() else '' for c in index_id])[:44].ljust(44, '0')}"
            self.index_cids[index_id] = mock_cid
            
            logger.info(f"Saved mock index {index_id} to IPFS with CID {mock_cid}")
            
            return {
                "success": True,
                "index_id": index_id,
                "cid": mock_cid
            }
        except Exception as e:
            logger.error(f"Error saving mock FAISS index to IPFS: {e}")
            return {"error": str(e)}
    
    async def load_from_ipfs(self, cid: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Mock loading FAISS index from IPFS
        
        Args:
            cid: IPFS CID
            options: Load options
            
        Returns:
            Dict: Mock result with loaded index ID
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        try:
            # Check if this CID is in our known CIDs
            index_id = None
            for idx, c in self.index_cids.items():
                if c == cid:
                    index_id = idx
                    break
            
            # If not found, create a new mock index
            if not index_id:
                index_id = f"mock-index-{uuid.uuid4()}"
                dimensions = options.get("dimensions", 128) if options else 128
                
                # Create new index info
                self.index_info[index_id] = {
                    "dimensions": dimensions,
                    "index_type": "Flat",
                    "created_at": datetime.now().isoformat(),
                    "vectors_count": 0,
                    "vectors": [],
                    "loaded_from": cid
                }
                
                # Add mock vectors
                mock_vectors = []
                for i in range(10):  # Add 10 mock vectors
                    mock_vectors.append([random.random() for _ in range(dimensions)])
                
                # Add them to the index
                await self.add_vectors(index_id, mock_vectors)
            
            logger.info(f"Loaded mock FAISS index from IPFS CID {cid}: {index_id}")
            
            return {
                "success": True,
                "cid": cid,
                "index_id": index_id,
                "dimensions": self.index_info[index_id]["dimensions"],
                "index_type": self.index_info[index_id]["index_type"],
                "vectors_count": self.index_info[index_id]["vectors_count"]
            }
        except Exception as e:
            logger.error(f"Error loading mock FAISS index from IPFS: {e}")
            return {"error": str(e)}
    
    async def get_index_info(self, index_id: str) -> Dict[str, Any]:
        """
        Get information about a mock FAISS index
        
        Args:
            index_id: Index ID
            
        Returns:
            Dict: Index information
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        if index_id not in self.index_info:
            return {"error": f"Index {index_id} not found"}
        
        try:
            info = self.index_info[index_id].copy()
            
            # Don't include the full vectors list in the info
            if "vectors" in info:
                del info["vectors"]
            
            # Add CID if available
            if index_id in self.index_cids:
                info["ipfs_cid"] = self.index_cids[index_id]
            
            logger.info(f"Retrieved info for mock index {index_id}")
            
            return {
                "success": True,
                "index_id": index_id,
                **info
            }
        except Exception as e:
            logger.error(f"Error getting mock FAISS index info: {e}")
            return {"error": str(e)}
    
    async def list_indexes(self) -> Dict[str, Any]:
        """
        List all mock FAISS indexes
        
        Returns:
            Dict: List of indexes
        """
        if not self.initialized:
            return {"error": "Module not initialized, call init() first"}
        
        try:
            indexes = {}
            
            for index_id, info in self.index_info.items():
                index_data = info.copy()
                
                # Don't include the full vectors list
                if "vectors" in index_data:
                    del index_data["vectors"]
                
                # Add CID if available
                if index_id in self.index_cids:
                    index_data["ipfs_cid"] = self.index_cids[index_id]
                
                indexes[index_id] = {
                    "index_id": index_id,
                    **index_data
                }
            
            logger.info(f"Listed {len(indexes)} mock FAISS indexes")
            
            return {
                "success": True,
                "indexes": indexes,
                "count": len(indexes)
            }
        except Exception as e:
            logger.error(f"Error listing mock FAISS indexes: {e}")
            return {"error": str(e)}
    
    def test(self, verbose=False) -> Dict[str, Any]:
        """
        Test the mock IPFS FAISS module
        
        Args:
            verbose: Whether to include detailed logs
            
        Returns:
            Dict: Test results
        """
        # Create test tracker
        from datetime import datetime
        import platform
        import sys
        
        # Initialize result data structure
        test_results = {
            "success": True,
            "module": "ipfs_faiss_mock",
            "timestamp": datetime.now().isoformat(),
            "steps": {},
            "diagnostics": {
                "environment": {
                    "python_version": sys.version,
                    "platform": platform.platform(),
                    "dependencies": self._check_dependencies()
                }
            }
        }
        
        logs = []
        
        def log(message):
            """Add log message if verbose"""
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_message = f"[{timestamp}] {message}"
            logs.append(log_message)
            if verbose:
                print(log_message)
        
        # Test functions
        async def test_init():
            log("Testing initialization")
            result = await self.init()
            success = result == True
            test_results["steps"]["initialization"] = {
                "success": success,
                "message": "Initialization successful" if success else "Initialization failed"
            }
            return success
        
        async def test_create_index():
            log("Testing index creation")
            result = await self.create_index(128, "Flat")
            success = "index_id" in result and "error" not in result
            index_id = result.get("index_id") if success else None
            test_results["steps"]["create_index"] = {
                "success": success,
                "message": f"Created index {index_id}" if success else "Failed to create index",
                "data": {"index_id": index_id} if success else {"error": result.get("error")}
            }
            return index_id if success else None
        
        async def test_add_vectors(index_id):
            log(f"Testing vector addition to index {index_id}")
            # Create mock vectors
            test_vectors = [[random.random() for _ in range(128)] for _ in range(10)]
            result = await self.add_vectors(index_id, test_vectors)
            success = "vectors_added" in result and result.get("vectors_added") == 10
            test_results["steps"]["add_vectors"] = {
                "success": success,
                "message": f"Added {result.get('vectors_added')} vectors" if success else "Failed to add vectors",
                "data": {"vectors_added": result.get("vectors_added")} if success else {"error": result.get("error")}
            }
            return success
        
        async def test_search(index_id):
            log(f"Testing vector search in index {index_id}")
            # Create mock query vector
            query_vector = [random.random() for _ in range(128)]
            result = await self.search(index_id, query_vector, 5)
            success = "results" in result and len(result.get("results", [])) > 0
            test_results["steps"]["search"] = {
                "success": success,
                "message": f"Found {len(result.get('results', []))} results" if success else "Failed to search",
                "data": {"result_count": len(result.get("results", []))} if success else {"error": result.get("error")}
            }
            return success
        
        async def test_save_to_ipfs(index_id):
            log(f"Testing saving index {index_id} to IPFS")
            result = await self.save_to_ipfs(index_id)
            success = "cid" in result and "error" not in result
            cid = result.get("cid") if success else None
            test_results["steps"]["save_to_ipfs"] = {
                "success": success,
                "message": f"Saved index to IPFS with CID {cid}" if success else "Failed to save index",
                "data": {"cid": cid} if success else {"error": result.get("error")}
            }
            return cid if success else None
        
        async def test_load_from_ipfs(cid):
            log(f"Testing loading index from IPFS CID {cid}")
            result = await self.load_from_ipfs(cid)
            success = "index_id" in result and "error" not in result
            loaded_index_id = result.get("index_id") if success else None
            test_results["steps"]["load_from_ipfs"] = {
                "success": success,
                "message": f"Loaded index {loaded_index_id} from IPFS" if success else "Failed to load index",
                "data": {"index_id": loaded_index_id} if success else {"error": result.get("error")}
            }
            return success
        
        async def test_list_indexes():
            log("Testing listing indexes")
            result = await self.list_indexes()
            success = "indexes" in result and "error" not in result
            index_count = len(result.get("indexes", {}))
            test_results["steps"]["list_indexes"] = {
                "success": success,
                "message": f"Listed {index_count} indexes" if success else "Failed to list indexes",
                "data": {"count": index_count} if success else {"error": result.get("error")}
            }
            return success
        
        # Create event loop
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Run tests in sequence
            init_success = loop.run_until_complete(test_init())
            
            if init_success:
                index_id = loop.run_until_complete(test_create_index())
                
                if index_id:
                    add_success = loop.run_until_complete(test_add_vectors(index_id))
                    search_success = loop.run_until_complete(test_search(index_id))
                    
                    cid = loop.run_until_complete(test_save_to_ipfs(index_id))
                    
                    if cid:
                        load_success = loop.run_until_complete(test_load_from_ipfs(cid))
                    
                    list_success = loop.run_until_complete(test_list_indexes())
                
                # Overall success is based on all steps succeeding
                test_results["success"] = all(
                    step.get("success", False) 
                    for step in test_results["steps"].values()
                )
            
        except Exception as e:
            import traceback
            error_traceback = traceback.format_exc()
            test_results["success"] = False
            test_results["error"] = str(e)
            test_results["traceback"] = error_traceback
            log(f"Test error: {e}")
            log(error_traceback)
        finally:
            # Clean up
            loop.close()
        
        # Add logs if verbose
        if verbose:
            test_results["logs"] = logs
        
        return test_results
    
    def _check_dependencies(self) -> Dict[str, Dict[str, Any]]:
        """
        Check availability of dependencies
        
        Returns:
            Dict: Dependency status information
        """
        results = {}
        
        for module_name in self.DEPENDENCIES:
            try:
                module = __import__(module_name)
                results[module_name] = {
                    "available": True,
                    "version": getattr(module, "__version__", "unknown")
                }
            except ImportError as e:
                results[module_name] = {
                    "available": False,
                    "error": str(e)
                }
        
        return results


# Create a default instance
ipfs_faiss_mock = IPFSFaissMock()


if __name__ == "__main__":
    """
    Run tests when module is executed directly
    """
    import argparse
    import json
    import sys
    
    parser = argparse.ArgumentParser(description="Test IPFS FAISS Mock module")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
    args = parser.parse_args()
    
    # Initialize module
    module = ipfs_faiss_mock
    
    # Run test with requested verbosity
    result = module.test(verbose=args.verbose)
    
    # Print results in JSON format
    print(json.dumps(result, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if result.get("success", False) else 1)