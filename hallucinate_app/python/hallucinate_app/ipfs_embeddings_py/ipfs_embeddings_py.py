"""
IPFS Embeddings Python Implementation

This module provides functionality for generating embeddings from text data and storing them using IPFS.
It implements vector embedding generation, similarity comparison, and search capabilities with IPFS integration.

Main components:
1. Embedding generation - Create vector embeddings from text using ML models
2. Similarity comparison - Compare vector embeddings for similarity
3. Embedding search - Find similar vector embeddings
4. IPFS integration - Store and retrieve embeddings from IPFS

This module is designed to work with ipfs_kit_py for IPFS operations and can optionally
integrate with ipfs_faiss_py for efficient similarity search on large vector collections.
"""

import os
import json
import logging
import asyncio
import numpy as np
from pathlib import Path
import tempfile
import time
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_embeddings_py")

# Optional dependency imports with fallbacks
try:
    from sentence_transformers import SentenceTransformer
    has_sentence_transformers = True
    logger.info("SentenceTransformer library available")
except ImportError:
    has_sentence_transformers = False
    logger.warning("SentenceTransformer not available. Some embedding functionality will be limited.")

# Vector operation utilities
class VectorUtils:
    """Utility functions for vector operations"""
    
    @staticmethod
    def cosine_similarity(vec1, vec2):
        """
        Calculate cosine similarity between two vectors
        
        Args:
            vec1 (numpy.ndarray): First vector
            vec2 (numpy.ndarray): Second vector
            
        Returns:
            float: Cosine similarity (-1 to 1, higher is more similar)
        """
        # Ensure vectors are numpy arrays
        if not isinstance(vec1, np.ndarray):
            vec1 = np.array(vec1)
        if not isinstance(vec2, np.ndarray):
            vec2 = np.array(vec2)
            
        # Calculate dot product and magnitudes
        dot_product = np.dot(vec1, vec2)
        norm_a = np.linalg.norm(vec1)
        norm_b = np.linalg.norm(vec2)
        
        # Avoid division by zero
        if norm_a == 0 or norm_b == 0:
            return 0
            
        return dot_product / (norm_a * norm_b)
    
    @staticmethod
    def euclidean_distance(vec1, vec2):
        """
        Calculate Euclidean distance between two vectors
        
        Args:
            vec1 (numpy.ndarray): First vector
            vec2 (numpy.ndarray): Second vector
            
        Returns:
            float: Euclidean distance (lower is more similar)
        """
        # Ensure vectors are numpy arrays
        if not isinstance(vec1, np.ndarray):
            vec1 = np.array(vec1)
        if not isinstance(vec2, np.ndarray):
            vec2 = np.array(vec2)
            
        return np.linalg.norm(vec1 - vec2)

    @staticmethod
    def dot_product(vec1, vec2):
        """
        Calculate dot product between two vectors
        
        Args:
            vec1 (numpy.ndarray): First vector
            vec2 (numpy.ndarray): Second vector
            
        Returns:
            float: Dot product (higher is more similar)
        """
        # Ensure vectors are numpy arrays
        if not isinstance(vec1, np.ndarray):
            vec1 = np.array(vec1)
        if not isinstance(vec2, np.ndarray):
            vec2 = np.array(vec2)
            
        return np.dot(vec1, vec2)

    @staticmethod
    def vector_to_bytes(vector):
        """
        Convert vector to bytes for storage
        
        Args:
            vector (numpy.ndarray): Vector to convert
            
        Returns:
            bytes: Serialized vector
        """
        return vector.tobytes()
    
    @staticmethod
    def bytes_to_vector(data, dtype=np.float32):
        """
        Convert bytes back to vector
        
        Args:
            data (bytes): Serialized vector
            dtype: Numpy data type (default: np.float32)
            
        Returns:
            numpy.ndarray: Vector
        """
        # Need to know the shape to properly reconstruct
        # This is a simplified version - real implementation would need to store shape info
        return np.frombuffer(data, dtype=dtype)

class IPFSEmbeddingsPy:
    """
    IPFS Embeddings Python Implementation
    
    This class provides functionality for generating embeddings from text and integrating with IPFS.
    It handles embedding generation, similarity comparison, and search functionality.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the IPFS Embeddings module
        
        Args:
            resources (dict): Resources required by the module (e.g., ipfs_kit)
            metadata (dict): Metadata for operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Set up configuration from metadata
        self.config = {
            # Default embedding model
            "model_name": self.metadata.get("model_name", "all-MiniLM-L6-v2"),
            # Cache directory for embeddings
            "cache_dir": self.metadata.get("cache_dir", os.path.join(
                os.path.expanduser('~'), '.cache', 'ipfs_embeddings'
            )),
            # Default embedding dimensions
            "dimensions": self.metadata.get("dimensions", 384),
            # Max length for input text
            "max_length": self.metadata.get("max_length", 512),
            # Default batch size
            "batch_size": self.metadata.get("batch_size", 32),
            # Should we normalize vectors
            "normalize_embeddings": self.metadata.get("normalize_embeddings", True)
        }
        
        # Create cache directory if it doesn't exist
        os.makedirs(self.config["cache_dir"], exist_ok=True)
        
        # Initialize embedding model
        self.model = None
        if has_sentence_transformers:
            try:
                self.model = SentenceTransformer(self.config["model_name"])
                logger.info(f"Loaded embedding model: {self.config['model_name']}")
            except Exception as e:
                logger.error(f"Failed to load embedding model: {e}")
        
        # Get IPFS Kit from resources if available
        self.ipfs_kit = None
        if "ipfsKit" in self.resources:
            self.ipfs_kit = self.resources["ipfsKit"]
            logger.info("IPFS Kit resource found")
        else:
            logger.warning("IPFS Kit resource not available, some functionality will be limited")
        
        # Initialize embedding cache
        self.embedding_cache = {}
        
        logger.info(f"IPFS Embeddings initialized with config: {self.config}")
    
    async def init(self):
        """
        Initialize the module
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Verify embedding model
            if not self.model and has_sentence_transformers:
                try:
                    self.model = SentenceTransformer(self.config["model_name"])
                    logger.info(f"Initialized embedding model: {self.config['model_name']}")
                except Exception as e:
                    logger.error(f"Failed to initialize embedding model: {e}")
                    return False
            
            # Check IPFS connectivity if we have ipfs_kit
            if self.ipfs_kit:
                # Assume ipfs_kit has an is_connected method
                if hasattr(self.ipfs_kit, "is_connected") and callable(self.ipfs_kit.is_connected):
                    ipfs_connected = await self.ipfs_kit.is_connected()
                    if not ipfs_connected:
                        logger.warning("IPFS is not connected")
                
                # Load cache from IPFS if specified
                if self.metadata.get("load_cache_from_ipfs"):
                    cache_cid = self.metadata.get("cache_cid")
                    if cache_cid:
                        await self._load_cache_from_ipfs(cache_cid)
            
            return has_sentence_transformers or self.model is not None
            
        except Exception as e:
            logger.error(f"Initialization error: {e}")
            return False
    
    async def generate_embedding(self, text, options=None):
        """
        Generate embedding vector from text
        
        Args:
            text (str or list): Text or list of texts to generate embeddings for
            options (dict): Options for embedding generation
                - model_name: Override default model
                - normalize: Whether to normalize vectors (default: True)
                - batch_size: Batch size for processing
                - cache: Whether to cache embeddings (default: True)
        
        Returns:
            dict: Result containing embeddings or error
        """
        options = options or {}
        
        try:
            # Validate input
            if not text:
                return {"error": "Text is required"}
            
            # Handle different input types
            is_batch = isinstance(text, list)
            texts = text if is_batch else [text]
            
            # Check if we have a model
            if not self.model:
                if not has_sentence_transformers:
                    return {"error": "No embedding model available. Install sentence-transformers package."}
                try:
                    # Try one more time to load the model
                    model_name = options.get("model_name", self.config["model_name"])
                    self.model = SentenceTransformer(model_name)
                except Exception as e:
                    return {"error": f"Failed to load embedding model: {e}"}
            
            # Generate embeddings
            use_cache = options.get("cache", True)
            embeddings = []
            
            for t in texts:
                # Check cache first if enabled
                cache_key = self._get_cache_key(t)
                if use_cache and cache_key in self.embedding_cache:
                    embeddings.append(self.embedding_cache[cache_key])
                else:
                    # Generate new embedding
                    embedding = self.model.encode(
                        t, 
                        normalize_embeddings=options.get("normalize", self.config["normalize_embeddings"]),
                        show_progress_bar=False
                    )
                    
                    # Convert to Python list for serialization
                    embedding_list = embedding.tolist()
                    
                    # Store in cache if enabled
                    if use_cache:
                        self.embedding_cache[cache_key] = embedding_list
                    
                    embeddings.append(embedding_list)
            
            # Prepare response
            if is_batch:
                return {
                    "success": True,
                    "embeddings": embeddings,
                    "dimensions": len(embeddings[0]) if embeddings else 0,
                    "count": len(embeddings)
                }
            else:
                return {
                    "success": True,
                    "embedding": embeddings[0],
                    "dimensions": len(embeddings[0]) if embeddings else 0
                }
                
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return {"error": f"Failed to generate embedding: {str(e)}"}
    
    async def compare_similarity(self, embedding1, embedding2, metric='cosine'):
        """
        Compare similarity between two embeddings
        
        Args:
            embedding1 (list): First embedding vector
            embedding2 (list): Second embedding vector
            metric (str): Similarity metric (cosine, euclidean, dot)
        
        Returns:
            dict: Result containing similarity score or error
        """
        try:
            # Validate inputs
            if not embedding1 or not embedding2:
                return {"error": "Both embeddings are required"}
            
            # Convert to numpy arrays if needed
            if not isinstance(embedding1, np.ndarray):
                embedding1 = np.array(embedding1, dtype=np.float32)
            if not isinstance(embedding2, np.ndarray):
                embedding2 = np.array(embedding2, dtype=np.float32)
            
            # Verify dimensions match
            if embedding1.shape != embedding2.shape:
                return {"error": f"Embedding dimensions don't match: {embedding1.shape} vs {embedding2.shape}"}
            
            # Calculate similarity based on metric
            if metric.lower() == 'cosine':
                similarity = VectorUtils.cosine_similarity(embedding1, embedding2)
                # Convert to a similarity score (0-1 range)
                score = (similarity + 1) / 2
            elif metric.lower() == 'euclidean':
                distance = VectorUtils.euclidean_distance(embedding1, embedding2)
                # Convert distance to similarity (1 / (1 + distance))
                score = 1 / (1 + distance)
            elif metric.lower() == 'dot':
                score = VectorUtils.dot_product(embedding1, embedding2)
            else:
                return {"error": f"Unsupported similarity metric: {metric}"}
            
            return {
                "success": True,
                "similarity": float(score),
                "metric": metric
            }
            
        except Exception as e:
            logger.error(f"Error comparing embeddings: {e}")
            return {"error": f"Failed to compare embeddings: {str(e)}"}
    
    async def search_similar(self, query, embeddings, options=None):
        """
        Search for similar embeddings
        
        Args:
            query (str or list): Text query or embedding vector
            embeddings (list): List of embeddings to search in
                Each item should be a dict with at least an 'embedding' field
                May also include 'id', 'text', and other metadata
            options (dict): Search options
                - top_k: Number of results to return (default: 5)
                - threshold: Minimum similarity threshold (default: 0.0)
                - metric: Similarity metric (default: 'cosine')
        
        Returns:
            dict: Results with matches or error
        """
        options = options or {}
        
        try:
            # Validate inputs
            if not query:
                return {"error": "Query is required"}
            if not embeddings or not isinstance(embeddings, list):
                return {"error": "Embeddings list is required"}
            
            # Process options
            top_k = options.get("top_k", 5)
            threshold = options.get("threshold", 0.0)
            metric = options.get("metric", "cosine")
            
            # Get query embedding
            query_embedding = None
            
            # If query is already an embedding vector
            if isinstance(query, list) and all(isinstance(x, (int, float)) for x in query):
                query_embedding = query
            # If query is a string, generate embedding
            elif isinstance(query, str):
                result = await self.generate_embedding(query)
                if "error" in result:
                    return result
                query_embedding = result["embedding"]
            else:
                return {"error": "Query must be a text string or embedding vector"}
            
            # Calculate similarities for all embeddings
            similarities = []
            
            for idx, item in enumerate(embeddings):
                # Extract embedding from item
                if isinstance(item, dict) and "embedding" in item:
                    item_embedding = item["embedding"]
                elif isinstance(item, list) and all(isinstance(x, (int, float)) for x in item):
                    item_embedding = item
                    # Create a structured item for the result
                    item = {"embedding": item_embedding, "id": idx}
                else:
                    logger.warning(f"Skipping invalid embedding at index {idx}")
                    continue
                
                # Calculate similarity
                similarity_result = await self.compare_similarity(
                    query_embedding, item_embedding, metric=metric
                )
                
                if "error" in similarity_result:
                    logger.warning(f"Error calculating similarity for item {idx}: {similarity_result['error']}")
                    continue
                
                similarity = similarity_result["similarity"]
                
                # Add to results if above threshold
                if similarity >= threshold:
                    # Create a result entry with similarity and original item data
                    result_item = {**item, "similarity": similarity}
                    
                    # Remove embedding from result if requested
                    if options.get("include_embeddings", False) is False:
                        if "embedding" in result_item:
                            del result_item["embedding"]
                    
                    similarities.append(result_item)
            
            # Sort by similarity (descending)
            similarities.sort(key=lambda x: x["similarity"], reverse=True)
            
            # Limit to top_k results
            top_results = similarities[:top_k]
            
            return {
                "success": True,
                "results": top_results,
                "count": len(top_results),
                "metric": metric
            }
            
        except Exception as e:
            logger.error(f"Error searching similar embeddings: {e}")
            return {"error": f"Failed to search similar embeddings: {str(e)}"}
    
    async def save_embeddings_to_ipfs(self, embeddings, options=None):
        """
        Save embeddings to IPFS
        
        Args:
            embeddings (list): List of embeddings to save
            options (dict): Save options
                - metadata: Additional metadata to include
                - format: Output format (json, binary)
        
        Returns:
            dict: Result with IPFS CID or error
        """
        options = options or {}
        
        try:
            # Validate inputs
            if not embeddings:
                return {"error": "Embeddings are required"}
            
            # Check if IPFS is available
            if not self.ipfs_kit:
                return {"error": "IPFS Kit not available"}
            
            # Prepare data for saving
            format_type = options.get("format", "json")
            metadata = options.get("metadata", {})
            
            if format_type == "json":
                # Prepare JSON format
                data = {
                    "embeddings": embeddings,
                    "metadata": {
                        "timestamp": time.time(),
                        "model": self.config["model_name"],
                        "dimensions": self.config["dimensions"],
                        **metadata
                    }
                }
                
                # Save to a temporary file
                with tempfile.NamedTemporaryFile(mode="w+", suffix=".json", delete=False) as temp_file:
                    json.dump(data, temp_file)
                    temp_path = temp_file.name
                
                # Add to IPFS
                try:
                    result = await self.ipfs_kit.add_file(temp_path)
                    
                    # Clean up temp file
                    os.unlink(temp_path)
                    
                    if "error" in result:
                        return result
                    
                    return {
                        "success": True,
                        "cid": result["cid"],
                        "size": result["size"],
                        "format": format_type
                    }
                except Exception as e:
                    # Clean up temp file
                    os.unlink(temp_path)
                    raise e
                    
            elif format_type == "binary":
                # Not implemented in this example
                return {"error": "Binary format not implemented in this example"}
            else:
                return {"error": f"Unsupported format: {format_type}"}
                
        except Exception as e:
            logger.error(f"Error saving embeddings to IPFS: {e}")
            return {"error": f"Failed to save embeddings to IPFS: {str(e)}"}
    
    async def load_embeddings_from_ipfs(self, cid, options=None):
        """
        Load embeddings from IPFS
        
        Args:
            cid (str): IPFS CID to load embeddings from
            options (dict): Load options
        
        Returns:
            dict: Result with embeddings or error
        """
        options = options or {}
        
        try:
            # Validate inputs
            if not cid:
                return {"error": "CID is required"}
            
            # Check if IPFS is available
            if not self.ipfs_kit:
                return {"error": "IPFS Kit not available"}
            
            # Create a temporary file for downloading
            with tempfile.NamedTemporaryFile(mode="w+", suffix=".json", delete=False) as temp_file:
                temp_path = temp_file.name
            
            try:
                # Get file from IPFS
                result = await self.ipfs_kit.get_file(cid, temp_path)
                
                if "error" in result:
                    return result
                
                # Read the data
                with open(temp_path, "r") as f:
                    data = json.load(f)
                
                # Extract embeddings and metadata
                embeddings = data.get("embeddings", [])
                metadata = data.get("metadata", {})
                
                return {
                    "success": True,
                    "embeddings": embeddings,
                    "metadata": metadata,
                    "count": len(embeddings)
                }
            finally:
                try:
                    os.unlink(temp_path)
                except OSError as cleanup_error:
                    logger.debug(f"Could not remove temporary embeddings file {temp_path}: {cleanup_error}")
                
        except Exception as e:
            logger.error(f"Error loading embeddings from IPFS: {e}")
            return {"error": f"Failed to load embeddings from IPFS: {str(e)}"}
    
    def _get_cache_key(self, text):
        """
        Generate a cache key for a text string
        
        Args:
            text (str): Text to generate key for
            
        Returns:
            str: Cache key
        """
        # Create a hash of the text for the cache key
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    async def _load_cache_from_ipfs(self, cid):
        """
        Load embedding cache from IPFS
        
        Args:
            cid (str): IPFS CID of the cache
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            result = await self.load_embeddings_from_ipfs(cid)
            
            if "error" in result:
                logger.error(f"Failed to load cache from IPFS: {result['error']}")
                return False
            
            # Update cache with loaded embeddings
            embeddings = result.get("embeddings", [])
            
            for item in embeddings:
                if isinstance(item, dict) and "text" in item and "embedding" in item:
                    cache_key = self._get_cache_key(item["text"])
                    self.embedding_cache[cache_key] = item["embedding"]
            
            logger.info(f"Loaded {len(embeddings)} embeddings into cache from IPFS")
            return True
            
        except Exception as e:
            logger.error(f"Error loading cache from IPFS: {e}")
            return False
    
    def test(self):
        """
        Run tests for the IPFS Embeddings module
        
        Returns:
            dict: Test results
        """
        try:
            results = {
                "success": False,
                "module": "ipfs_embeddings_py",
                "tests": {},
                "capabilities": {
                    "sentence_transformers": has_sentence_transformers,
                    "model_loaded": self.model is not None,
                    "ipfs_available": self.ipfs_kit is not None
                }
            }
            
            # Test embedding generation
            if has_sentence_transformers and self.model:
                try:
                    # Create event loop for async tests
                    loop = asyncio.new_event_loop()
                    
                    # Test simple embedding generation
                    embed_result = loop.run_until_complete(
                        self.generate_embedding("This is a test sentence")
                    )
                    
                    if "error" in embed_result:
                        results["tests"]["embedding_generation"] = {
                            "success": False,
                            "error": embed_result["error"]
                        }
                    else:
                        embedding = embed_result.get("embedding", [])
                        results["tests"]["embedding_generation"] = {
                            "success": True,
                            "dimensions": len(embedding),
                            "sample": embedding[:3] if embedding else []  # First 3 dimensions for verification
                        }
                    
                    # Test similarity comparison
                    if "error" not in embed_result:
                        # Generate a second embedding
                        embed_result2 = loop.run_until_complete(
                            self.generate_embedding("This is another test sentence")
                        )
                        
                        if "error" not in embed_result2:
                            # Compare the two embeddings
                            similarity_result = loop.run_until_complete(
                                self.compare_similarity(
                                    embed_result["embedding"], 
                                    embed_result2["embedding"]
                                )
                            )
                            
                            if "error" in similarity_result:
                                results["tests"]["similarity_comparison"] = {
                                    "success": False,
                                    "error": similarity_result["error"]
                                }
                            else:
                                results["tests"]["similarity_comparison"] = {
                                    "success": True,
                                    "similarity": similarity_result["similarity"]
                                }
                    
                    # Close the event loop
                    loop.close()
                    
                except Exception as e:
                    results["tests"]["embedding_tests"] = {
                        "success": False,
                        "error": str(e)
                    }
            else:
                results["tests"]["embedding_generation"] = {
                    "success": False,
                    "error": "Sentence transformers not available or model not loaded"
                }
            
            # Test IPFS integration if available
            if self.ipfs_kit:
                # These tests would need an active IPFS node
                # We'll just mark as skipped for this example
                results["tests"]["ipfs_integration"] = {
                    "success": None,
                    "note": "IPFS integration tests skipped in this example implementation"
                }
            
            # Overall success - true if embedding generation works
            results["success"] = results["tests"].get("embedding_generation", {}).get("success", False)
            
            return results
            
        except Exception as e:
            logger.error(f"Error in IPFS Embeddings test: {e}")
            return {
                "success": False,
                "module": "ipfs_embeddings_py",
                "error": str(e)
            }

# Example usage
if __name__ == "__main__":
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Create embeddings instance
    embeddings = IPFSEmbeddingsPy()
    
    # Initialize
    init_result = loop.run_until_complete(embeddings.init())
    print(f"Initialization: {init_result}")
    
    # Generate embedding
    if init_result:
        embed_result = loop.run_until_complete(
            embeddings.generate_embedding("This is a test sentence")
        )
        print(f"Embedding result: {embed_result['success'] if 'success' in embed_result else embed_result}")
        
        # Print first few dimensions
        if "embedding" in embed_result:
            print(f"First 5 dimensions: {embed_result['embedding'][:5]}")
    
    # Close loop
    loop.close()
