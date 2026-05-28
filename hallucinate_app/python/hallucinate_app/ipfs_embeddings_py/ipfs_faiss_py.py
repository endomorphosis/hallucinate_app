"""
IPFS FAISS Python Implementation

This module provides functionality for efficient vector similarity search using Facebook AI Similarity Search (FAISS)
with IPFS integration for distributed storage and retrieval of indexes.

Main components:
1. Index creation - Create and configure FAISS indexes with different index types
2. Vector management - Add vectors to indexes and manage them efficiently
3. Similarity search - Fast approximate nearest neighbor search in vector space
4. IPFS integration - Save and load indexes to/from IPFS

This module is designed to work with ipfs_kit_py for IPFS operations and can easily
integrate with ipfs_embeddings_py for a complete vector embedding and search system.
"""

import os
import json
import logging
import asyncio
import numpy as np
import tempfile
import time
import uuid
from pathlib import Path
import pickle

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_faiss_py")

# Optional dependency imports with fallbacks
try:
    import faiss
    has_faiss = True
    logger.info("FAISS library available")
    
    # Check GPU support
    try:
        # Try importing GPU resources
        import faiss.contrib.gpu
        gpu_count = faiss.get_num_gpus()
        has_gpu = gpu_count > 0
        logger.info(f"FAISS GPU support available: {gpu_count} GPU(s)")
    except (ImportError, AttributeError):
        has_gpu = False
        logger.info("FAISS GPU support not available")
        
except ImportError:
    has_faiss = False
    has_gpu = False
    logger.warning("FAISS not available. Vector search functionality will be limited.")

class IPFSFaissPy:
    """
    IPFS FAISS Python Implementation
    
    This class provides functionality for efficient vector similarity search using FAISS
    with IPFS integration.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the IPFS FAISS module
        
        Args:
            resources (dict): Resources required by the module (e.g., ipfs_kit)
            metadata (dict): Metadata for operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Set up configuration from metadata
        self.config = {
            # Default vector dimensions
            "dimensions": self.metadata.get("dimensions", 384),
            # Cache directory for FAISS indexes
            "cache_dir": self.metadata.get("cache_dir", os.path.join(
                os.path.expanduser('~'), '.cache', 'ipfs_faiss'
            )),
            # Use GPU if available
            "use_gpu": self.metadata.get("use_gpu", True),
            # GPU device ID (if multiple GPUs)
            "gpu_id": self.metadata.get("gpu_id", 0),
            # Maximum number of vectors to index (for memory management)
            "max_vectors": self.metadata.get("max_vectors", 1000000)
        }
        
        # Create cache directory if it doesn't exist
        os.makedirs(self.config["cache_dir"], exist_ok=True)
        
        # Get IPFS Kit from resources if available
        self.ipfs_kit = None
        if "ipfsKit" in self.resources:
            self.ipfs_kit = self.resources["ipfsKit"]
            logger.info("IPFS Kit resource found")
        else:
            logger.warning("IPFS Kit resource not available, some functionality will be limited")
        
        # Store active indexes
        self.indexes = {}
        
        # Check FAISS availability
        if not has_faiss:
            logger.warning("FAISS library not available. Install faiss-cpu or faiss-gpu.")
        else:
            logger.info(f"FAISS initialized with config: {self.config}")
    
    async def init(self):
        """
        Initialize the module
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Check FAISS availability
            if not has_faiss:
                logger.error("FAISS library not available. Install faiss-cpu or faiss-gpu.")
                return False
            
            # Check IPFS connectivity if we have ipfs_kit
            if self.ipfs_kit:
                # Assume ipfs_kit has an is_connected method
                if hasattr(self.ipfs_kit, "is_connected") and callable(self.ipfs_kit.is_connected):
                    ipfs_connected = await self.ipfs_kit.is_connected()
                    if not ipfs_connected:
                        logger.warning("IPFS is not connected")
            
            # Load existing indexes from cache if needed
            if self.metadata.get("load_from_cache", False):
                self._load_indexes_from_cache()
            
            return True
            
        except Exception as e:
            logger.error(f"Initialization error: {e}")
            return False
    
    async def create_index(self, dimensions, index_type='Flat', options=None):
        """
        Create a new FAISS index
        
        Args:
            dimensions (int): Vector dimensions
            index_type (str): Type of index to create (Flat, IVF, HNSW, etc.)
            options (dict): Index creation options
                - nlist: Number of clusters for IVF indices (default: 100)
                - nprobe: Number of clusters to search (default: 10)
                - m: Number of connections for HNSW (default: 32)
                - ef_construction: Construction time/accuracy tradeoff (default: 200)
                - metric: Distance metric (L2, InnerProduct, etc.)
                - use_gpu: Override GPU usage (default: from config)
        
        Returns:
            dict: Result with index ID or error
        """
        options = options or {}
        
        try:
            # Check FAISS availability
            if not has_faiss:
                return {"error": "FAISS library not available. Install faiss-cpu or faiss-gpu."}
            
            # Process index options
            metric = options.get("metric", "L2")
            metric_type = faiss.METRIC_L2 if metric == "L2" else faiss.METRIC_INNER_PRODUCT
            
            # Create index based on type
            index = None
            index_description = f"{index_type}(d={dimensions})"
            
            if index_type == 'Flat':
                index = faiss.IndexFlat(dimensions, metric_type)
            
            elif index_type == 'IVF':
                nlist = options.get("nlist", 100)
                quantizer = faiss.IndexFlat(dimensions, metric_type)
                index = faiss.IndexIVFFlat(quantizer, dimensions, nlist, metric_type)
                index.nprobe = options.get("nprobe", 10)
                index_description = f"IVF{nlist},Flat(d={dimensions})"
            
            elif index_type == 'HNSW':
                m = options.get("m", 32)
                index = faiss.IndexHNSWFlat(dimensions, m, metric_type)
                index.hnsw.efConstruction = options.get("ef_construction", 200)
                index.hnsw.efSearch = options.get("ef_search", 128)
                index_description = f"HNSW{m}(d={dimensions})"
            
            elif index_type == 'PQ':
                # Product Quantization
                m = options.get("m", 8)  # Number of subquantizers
                nbits = options.get("nbits", 8)  # Bits per subquantizer
                index = faiss.IndexPQ(dimensions, m, nbits, metric_type)
                index_description = f"PQ{m}x{nbits}(d={dimensions})"
            
            else:
                return {"error": f"Unsupported index type: {index_type}"}
            
            # Move to GPU if requested and available
            use_gpu = options.get("use_gpu", self.config["use_gpu"])
            gpu_id = options.get("gpu_id", self.config["gpu_id"])
            
            if use_gpu and has_gpu and not isinstance(index, faiss.IndexHNSWFlat):  # HNSW not supported on GPU
                res = faiss.StandardGpuResources()
                index = faiss.index_cpu_to_gpu(res, gpu_id, index)
                index_description += " (GPU)"
                logger.info(f"Index moved to GPU device {gpu_id}")
            
            # Generate unique ID for this index
            index_id = str(uuid.uuid4())
            
            # Store index
            self.indexes[index_id] = {
                "index": index,
                "type": index_type,
                "dimensions": dimensions,
                "description": index_description,
                "count": 0,
                "created_at": time.time(),
                "options": options,
                "is_trained": getattr(index, "is_trained", True)
            }
            
            return {
                "success": True,
                "index_id": index_id,
                "type": index_type,
                "description": index_description,
                "dimensions": dimensions
            }
            
        except Exception as e:
            logger.error(f"Error creating index: {e}")
            return {"error": f"Failed to create index: {str(e)}"}
    
    async def add_vectors(self, index_id, vectors, ids=None):
        """
        Add vectors to an index
        
        Args:
            index_id (str): ID of the index to add vectors to
            vectors (list): Vectors to add
            ids (list): Optional IDs for the vectors
        
        Returns:
            dict: Result with count or error
        """
        try:
            # Check if index exists
            if index_id not in self.indexes:
                return {"error": f"Index not found: {index_id}"}
            
            # Get index info
            index_info = self.indexes[index_id]
            index = index_info["index"]
            
            # Convert vectors to numpy array if not already
            if not isinstance(vectors, np.ndarray):
                vectors = np.array(vectors, dtype=np.float32)
            
            # Reshape if needed
            if len(vectors.shape) == 1:
                vectors = vectors.reshape(1, -1)
            
            # Check dimensions
            if vectors.shape[1] != index_info["dimensions"]:
                return {"error": f"Vector dimensions don't match index: {vectors.shape[1]} vs {index_info['dimensions']}"}
            
            # Prepare IDs
            if ids is None:
                # Auto-generate IDs starting from current count
                current_count = index_info["count"]
                ids = np.arange(current_count, current_count + vectors.shape[0], dtype=np.int64)
            else:
                # Convert to numpy array if needed
                if not isinstance(ids, np.ndarray):
                    ids = np.array(ids, dtype=np.int64)
            
            # Check if index needs training
            if not index_info["is_trained"] and hasattr(index, "train"):
                index.train(vectors)
                index_info["is_trained"] = True
                logger.info(f"Trained index {index_id}")
            
            # Add vectors to index
            index.add_with_ids(vectors, ids)
            
            # Update count
            index_info["count"] += vectors.shape[0]
            
            return {
                "success": True,
                "count": vectors.shape[0],
                "total_vectors": index_info["count"]
            }
            
        except Exception as e:
            logger.error(f"Error adding vectors: {e}")
            return {"error": f"Failed to add vectors: {str(e)}"}
    
    async def search(self, index_id, query_vector, k=5, options=None):
        """
        Search for similar vectors in an index
        
        Args:
            index_id (str): ID of the index to search
            query_vector (list or array): Vector to search for
            k (int): Number of results to return
            options (dict): Search options
                - nprobe: Number of clusters to search (for IVF)
                - ef_search: Search time/accuracy tradeoff (for HNSW)
        
        Returns:
            dict: Results with distances and IDs
        """
        options = options or {}
        
        try:
            # Check if index exists
            if index_id not in self.indexes:
                return {"error": f"Index not found: {index_id}"}
            
            # Get index info
            index_info = self.indexes[index_id]
            index = index_info["index"]
            
            # Convert query vector to numpy array if needed
            if not isinstance(query_vector, np.ndarray):
                query_vector = np.array(query_vector, dtype=np.float32)
            
            # Reshape if needed
            if len(query_vector.shape) == 1:
                query_vector = query_vector.reshape(1, -1)
            
            # Check dimensions
            if query_vector.shape[1] != index_info["dimensions"]:
                return {"error": f"Query vector dimensions don't match index: {query_vector.shape[1]} vs {index_info['dimensions']}"}
            
            # Set search parameters
            if options.get("nprobe") and hasattr(index, "nprobe"):
                index.nprobe = options["nprobe"]
            
            if options.get("ef_search") and hasattr(index, "hnsw") and hasattr(index.hnsw, "efSearch"):
                index.hnsw.efSearch = options["ef_search"]
            
            # Check if index is empty
            if index_info["count"] == 0:
                return {"error": "Index is empty, cannot search"}
            
            # Perform search
            distances, indices = index.search(query_vector, min(k, index_info["count"]))
            
            # Convert to Python native types for JSON serialization
            results = []
            for i in range(min(len(indices[0]), k)):
                results.append({
                    "id": int(indices[0][i]),
                    "distance": float(distances[0][i])
                })
            
            return {
                "success": True,
                "results": results,
                "count": len(results)
            }
            
        except Exception as e:
            logger.error(f"Error searching index: {e}")
            return {"error": f"Failed to search index: {str(e)}"}
    
    async def save_to_ipfs(self, index_id, options=None):
        """
        Save an index to IPFS
        
        Args:
            index_id (str): ID of the index to save
            options (dict): Save options
                - include_metadata: Also save metadata (default: True)
                - use_pickle: Whether to use pickle for serialization (default: True)
        
        Returns:
            dict: Result with IPFS CID or error
        """
        options = options or {}
        
        try:
            # Check if index exists
            if index_id not in self.indexes:
                return {"error": f"Index not found: {index_id}"}
            
            # Check if IPFS is available
            if not self.ipfs_kit:
                return {"error": "IPFS Kit not available"}
            
            # Get index info
            index_info = self.indexes[index_id]
            index = index_info["index"]
            
            # Create a temporary directory for the index files
            temp_dir = tempfile.mkdtemp()
            index_file = os.path.join(temp_dir, f"{index_id}.faiss")
            
            # Convert GPU index to CPU if needed
            if hasattr(index, "is_gpu") and index.is_gpu():
                index = faiss.index_gpu_to_cpu(index)
                logger.info(f"Converted GPU index to CPU for saving")
            
            try:
                # Save the index
                use_pickle = options.get("use_pickle", True)
                
                if use_pickle:
                    # Save using pickle (preserves more information but less portable)
                    with open(index_file, 'wb') as f:
                        pickle.dump(index, f)
                else:
                    # Save using faiss writer (more portable)
                    faiss.write_index(index, index_file)
                
                # Save metadata if requested
                include_metadata = options.get("include_metadata", True)
                metadata_file = None
                
                if include_metadata:
                    metadata = {
                        "index_id": index_id,
                        "type": index_info["type"],
                        "dimensions": index_info["dimensions"],
                        "description": index_info["description"],
                        "count": index_info["count"],
                        "created_at": index_info["created_at"],
                        "saved_at": time.time(),
                        "options": index_info["options"]
                    }
                    
                    metadata_file = os.path.join(temp_dir, f"{index_id}.meta.json")
                    with open(metadata_file, 'w') as f:
                        json.dump(metadata, f)
                
                # Add index file to IPFS
                add_result = await self.ipfs_kit.add_file(index_file)
                
                if "error" in add_result:
                    return add_result
                
                result = {
                    "success": True,
                    "index_cid": add_result["cid"],
                    "index_size": add_result["size"],
                    "index_id": index_id,
                    "serialization": "pickle" if use_pickle else "faiss"
                }
                
                # Add metadata file to IPFS if it exists
                if metadata_file:
                    meta_result = await self.ipfs_kit.add_file(metadata_file)
                    
                    if "error" not in meta_result:
                        result["metadata_cid"] = meta_result["cid"]
                        result["metadata_size"] = meta_result["size"]
                
                return result
                
            finally:
                # Clean up temporary files
                try:
                    if os.path.exists(index_file):
                        os.unlink(index_file)
                    
                    if metadata_file and os.path.exists(metadata_file):
                        os.unlink(metadata_file)
                    
                    os.rmdir(temp_dir)
                except Exception as e:
                    logger.warning(f"Error cleaning up temporary files: {e}")
                
        except Exception as e:
            logger.error(f"Error saving index to IPFS: {e}")
            return {"error": f"Failed to save index to IPFS: {str(e)}"}
    
    async def load_from_ipfs(self, cid, options=None):
        """
        Load an index from IPFS
        
        Args:
            cid (str): IPFS CID of the index
            options (dict): Load options
                - metadata_cid: CID of the metadata file (optional)
                - gpu: Load to GPU (default: False)
                - gpu_id: GPU device ID (default: 0)
                - index_id: Custom index ID (default: generate new)
                - use_pickle: Whether the index was saved with pickle (default: True)
        
        Returns:
            dict: Result with index ID or error
        """
        options = options or {}
        
        try:
            # Check if IPFS is available
            if not self.ipfs_kit:
                return {"error": "IPFS Kit not available"}
            
            # Create temporary files for the index
            with tempfile.NamedTemporaryFile(suffix=".faiss", delete=False) as temp_file:
                index_file = temp_file.name
            
            try:
                # Download the index from IPFS
                get_result = await self.ipfs_kit.get_file(cid, index_file)
                
                if "error" in get_result:
                    return get_result
                
                # Load the index
                use_pickle = options.get("use_pickle", True)
                
                if use_pickle:
                    # Load using pickle
                    with open(index_file, 'rb') as f:
                        index = pickle.load(f)
                else:
                    # Load using faiss reader
                    index = faiss.read_index(index_file)
                
                # Determine dimensions
                dimensions = index.d
                
                # Move to GPU if requested
                if options.get("gpu", False) and has_gpu:
                    gpu_id = options.get("gpu_id", self.config["gpu_id"])
                    res = faiss.StandardGpuResources()
                    index = faiss.index_cpu_to_gpu(res, gpu_id, index)
                    logger.info(f"Moved loaded index to GPU device {gpu_id}")
                
                # Generate or use provided index ID
                index_id = options.get("index_id", str(uuid.uuid4()))
                
                # Create index info structure
                index_info = {
                    "index": index,
                    "dimensions": dimensions,
                    "count": index.ntotal,
                    "created_at": time.time(),
                    "options": options,
                    "is_trained": getattr(index, "is_trained", True),
                    "loaded_from_ipfs": True,
                    "source_cid": cid
                }
                
                # Load metadata if available
                metadata_cid = options.get("metadata_cid")
                if metadata_cid:
                    try:
                        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as meta_file:
                            meta_file_path = meta_file.name
                        
                        # Download the metadata file
                        meta_result = await self.ipfs_kit.get_file(metadata_cid, meta_file_path)
                        
                        if "error" not in meta_result:
                            # Read the metadata
                            with open(meta_file_path, 'r') as f:
                                metadata = json.load(f)
                            
                            # Update index info with metadata
                            if "type" in metadata:
                                index_info["type"] = metadata["type"]
                            if "description" in metadata:
                                index_info["description"] = metadata["description"]
                            if "created_at" in metadata:
                                index_info["created_at"] = metadata["created_at"]
                            if "options" in metadata:
                                index_info["original_options"] = metadata["options"]
                            if "count" in metadata:
                                # Use the larger of the two counts
                                index_info["count"] = max(index_info["count"], metadata["count"])
                    except Exception as e:
                        logger.warning(f"Error loading metadata: {e}")
                    finally:
                        # Clean up metadata file
                        if metadata_cid:
                            try:
                                os.unlink(meta_file_path)
                            except OSError as e:
                                logger.debug(f"Could not remove temporary metadata file {meta_file_path}: {e}")
                
                # Infer type if not in metadata
                if "type" not in index_info:
                    if isinstance(index, faiss.IndexFlat):
                        index_info["type"] = "Flat"
                    elif isinstance(index, faiss.IndexIVFFlat):
                        index_info["type"] = "IVF"
                    elif isinstance(index, faiss.IndexHNSWFlat):
                        index_info["type"] = "HNSW"
                    elif isinstance(index, faiss.IndexPQ):
                        index_info["type"] = "PQ"
                    else:
                        index_info["type"] = "Unknown"
                
                # Add description if not in metadata
                if "description" not in index_info:
                    index_info["description"] = f"{index_info['type']}(d={dimensions})"
                
                # Store the index
                self.indexes[index_id] = index_info
                
                return {
                    "success": True,
                    "index_id": index_id,
                    "type": index_info["type"],
                    "description": index_info.get("description", ""),
                    "dimensions": dimensions,
                    "count": index_info["count"]
                }
                
            finally:
                # Clean up temporary files
                try:
                    os.unlink(index_file)
                except:
                    pass
                
        except Exception as e:
            logger.error(f"Error loading index from IPFS: {e}")
            return {"error": f"Failed to load index from IPFS: {str(e)}"}
    
    async def get_index_info(self, index_id):
        """
        Get information about an index
        
        Args:
            index_id (str): ID of the index
        
        Returns:
            dict: Index information or error
        """
        try:
            # Check if index exists
            if index_id not in self.indexes:
                return {"error": f"Index not found: {index_id}"}
            
            # Get index info
            index_info = self.indexes[index_id]
            
            # Return info (excluding the index object itself)
            return {
                "success": True,
                "index_id": index_id,
                "type": index_info.get("type", "Unknown"),
                "description": index_info.get("description", ""),
                "dimensions": index_info["dimensions"],
                "count": index_info["count"],
                "created_at": index_info["created_at"],
                "is_trained": index_info["is_trained"],
                "loaded_from_ipfs": index_info.get("loaded_from_ipfs", False),
                "source_cid": index_info.get("source_cid")
            }
            
        except Exception as e:
            logger.error(f"Error getting index info: {e}")
            return {"error": f"Failed to get index info: {str(e)}"}
    
    async def list_indexes(self):
        """
        List all available indexes
        
        Returns:
            dict: List of index IDs and basic info
        """
        try:
            result = {
                "success": True,
                "indexes": [],
                "count": len(self.indexes)
            }
            
            # Add info for each index
            for index_id, index_info in self.indexes.items():
                result["indexes"].append({
                    "index_id": index_id,
                    "type": index_info.get("type", "Unknown"),
                    "description": index_info.get("description", ""),
                    "dimensions": index_info["dimensions"],
                    "count": index_info["count"],
                    "loaded_from_ipfs": index_info.get("loaded_from_ipfs", False)
                })
            
            return result
            
        except Exception as e:
            logger.error(f"Error listing indexes: {e}")
            return {"error": f"Failed to list indexes: {str(e)}"}
    
    def _load_indexes_from_cache(self):
        """
        Load indexes from cache directory
        
        Returns:
            int: Number of indexes loaded
        """
        try:
            count = 0
            cache_dir = self.config["cache_dir"]
            
            # Check for index files in the cache directory
            for filename in os.listdir(cache_dir):
                if filename.endswith(".faiss"):
                    index_id = filename.split(".")[0]
                    
                    try:
                        # Load the index
                        index_path = os.path.join(cache_dir, filename)
                        
                        # Check if there's a metadata file
                        meta_path = os.path.join(cache_dir, f"{index_id}.meta.json")
                        metadata = {}
                        
                        if os.path.exists(meta_path):
                            with open(meta_path, 'r') as f:
                                metadata = json.load(f)
                        
                        # Load the index
                        index = None
                        try:
                            # Try loading with pickle first
                            with open(index_path, 'rb') as f:
                                index = pickle.load(f)
                        except:
                            # Fall back to faiss reader
                            index = faiss.read_index(index_path)
                        
                        if index:
                            # Create index info
                            index_info = {
                                "index": index,
                                "dimensions": index.d,
                                "count": index.ntotal,
                                "created_at": metadata.get("created_at", time.time()),
                                "type": metadata.get("type", "Unknown"),
                                "description": metadata.get("description", f"Unknown(d={index.d})"),
                                "options": metadata.get("options", {}),
                                "is_trained": getattr(index, "is_trained", True),
                                "loaded_from_cache": True
                            }
                            
                            # Store the index
                            self.indexes[index_id] = index_info
                            count += 1
                            logger.info(f"Loaded index {index_id} from cache")
                    
                    except Exception as e:
                        logger.warning(f"Error loading index {index_id} from cache: {e}")
            
            logger.info(f"Loaded {count} indexes from cache")
            return count
            
        except Exception as e:
            logger.error(f"Error loading indexes from cache: {e}")
            return 0
    
    async def _save_indexes_to_cache(self):
        """
        Save all indexes to cache directory
        
        Returns:
            int: Number of indexes saved
        """
        try:
            count = 0
            cache_dir = self.config["cache_dir"]
            
            # Ensure cache directory exists
            os.makedirs(cache_dir, exist_ok=True)
            
            # Save each index
            for index_id, index_info in self.indexes.items():
                try:
                    index = index_info["index"]
                    
                    # Convert GPU index to CPU if needed
                    if hasattr(index, "is_gpu") and index.is_gpu():
                        index = faiss.index_gpu_to_cpu(index)
                    
                    # Save the index
                    index_path = os.path.join(cache_dir, f"{index_id}.faiss")
                    with open(index_path, 'wb') as f:
                        pickle.dump(index, f)
                    
                    # Save metadata
                    metadata = {
                        "index_id": index_id,
                        "type": index_info.get("type", "Unknown"),
                        "dimensions": index_info["dimensions"],
                        "description": index_info.get("description", ""),
                        "count": index_info["count"],
                        "created_at": index_info["created_at"],
                        "saved_at": time.time(),
                        "options": index_info.get("options", {})
                    }
                    
                    meta_path = os.path.join(cache_dir, f"{index_id}.meta.json")
                    with open(meta_path, 'w') as f:
                        json.dump(metadata, f)
                    
                    count += 1
                    logger.info(f"Saved index {index_id} to cache")
                
                except Exception as e:
                    logger.warning(f"Error saving index {index_id} to cache: {e}")
            
            logger.info(f"Saved {count} indexes to cache")
            return count
            
        except Exception as e:
            logger.error(f"Error saving indexes to cache: {e}")
            return 0
    
    def test(self):
        """
        Run tests for the IPFS FAISS module
        
        Returns:
            dict: Test results
        """
        try:
            results = {
                "success": False,
                "module": "ipfs_faiss_py",
                "tests": {},
                "capabilities": {
                    "faiss": has_faiss,
                    "gpu": has_gpu,
                    "ipfs_available": self.ipfs_kit is not None
                }
            }
            
            # Skip tests if FAISS is not available
            if not has_faiss:
                results["tests"]["basic_functionality"] = {
                    "success": False,
                    "error": "FAISS library not available"
                }
                return results
            
            # Create event loop for async tests
            loop = asyncio.new_event_loop()
            
            # Test index creation
            dimensions = 128
            create_result = loop.run_until_complete(
                self.create_index(dimensions, index_type='Flat')
            )
            
            if "error" in create_result:
                results["tests"]["index_creation"] = {
                    "success": False,
                    "error": create_result["error"]
                }
                return results
            else:
                results["tests"]["index_creation"] = {
                    "success": True,
                    "index_id": create_result["index_id"],
                    "type": create_result["type"]
                }
                
                index_id = create_result["index_id"]
                
                # Test vector addition
                vectors = np.random.random((10, dimensions)).astype(np.float32)
                add_result = loop.run_until_complete(
                    self.add_vectors(index_id, vectors)
                )
                
                if "error" in add_result:
                    results["tests"]["vector_addition"] = {
                        "success": False,
                        "error": add_result["error"]
                    }
                else:
                    results["tests"]["vector_addition"] = {
                        "success": True,
                        "count": add_result["count"],
                        "total_vectors": add_result["total_vectors"]
                    }
                    
                    # Test search
                    query = np.random.random(dimensions).astype(np.float32)
                    search_result = loop.run_until_complete(
                        self.search(index_id, query, k=3)
                    )
                    
                    if "error" in search_result:
                        results["tests"]["vector_search"] = {
                            "success": False,
                            "error": search_result["error"]
                        }
                    else:
                        results["tests"]["vector_search"] = {
                            "success": True,
                            "results_count": search_result["count"]
                        }
            
            # Test IPFS integration if available (mocked)
            if self.ipfs_kit:
                results["tests"]["ipfs_integration"] = {
                    "success": None,
                    "note": "IPFS integration tests skipped in this test implementation"
                }
            
            # Close the event loop
            loop.close()
            
            # Overall success - true if index creation and vector addition work
            results["success"] = (
                results["tests"].get("index_creation", {}).get("success", False) and
                results["tests"].get("vector_addition", {}).get("success", False)
            )
            
            return results
            
        except Exception as e:
            logger.error(f"Error in IPFS FAISS test: {e}")
            return {
                "success": False,
                "module": "ipfs_faiss_py",
                "error": str(e)
            }

# Example usage
if __name__ == "__main__":
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Create FAISS instance
    faiss_module = IPFSFaissPy()
    
    # Initialize
    init_result = loop.run_until_complete(faiss_module.init())
    print(f"Initialization: {init_result}")
    
    if init_result and has_faiss:
        # Create a new index
        dimensions = 128
        create_result = loop.run_until_complete(
            faiss_module.create_index(dimensions, index_type='Flat')
        )
        print(f"Create index result: {create_result}")
        
        if "index_id" in create_result:
            index_id = create_result["index_id"]
            
            # Add some random vectors
            vectors = np.random.random((10, dimensions)).astype(np.float32)
            add_result = loop.run_until_complete(
                faiss_module.add_vectors(index_id, vectors)
            )
            print(f"Add vectors result: {add_result}")
            
            # Search for a random vector
            query = np.random.random(dimensions).astype(np.float32)
            search_result = loop.run_until_complete(
                faiss_module.search(index_id, query, k=3)
            )
            print(f"Search result: {search_result}")
    
    # Close loop
    loop.close()