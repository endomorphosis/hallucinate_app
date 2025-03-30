# IPFS Embeddings and FAISS Integration

This package provides a seamless integration between vector embeddings generation and efficient similarity search using IPFS for decentralized storage and retrieval.

## Overview

The package consists of two main modules:

1. **ipfs_embeddings_py**: Generates vector embeddings from text data and provides similarity comparison between vectors, with IPFS integration for storing and retrieving embeddings.

2. **ipfs_faiss_py**: Provides efficient vector similarity search using Facebook AI Similarity Search (FAISS), with IPFS integration for distributed storage and retrieval of indexes.

These modules are designed to work together to provide a complete solution for generating, storing, and searching vector embeddings in a decentralized environment.

## Features

### ipfs_embeddings_py

- **Text Embedding Generation**: Convert text to vector embeddings using state-of-the-art models.
- **Similarity Comparison**: Compare embeddings using various metrics (cosine, euclidean, dot product).
- **Similarity Search**: Search for similar embeddings within a collection.
- **IPFS Integration**: Store and retrieve embeddings using IPFS for decentralized access.
- **Embedding Cache**: Local caching of embeddings for improved performance.
- **Batch Processing**: Generate embeddings for multiple texts in a single call.

### ipfs_faiss_py

- **Efficient Vector Search**: Fast approximate nearest neighbor search using FAISS.
- **Multiple Index Types**: Support for various FAISS index types (Flat, IVF, HNSW, PQ).
- **GPU Acceleration**: Optional GPU acceleration for improved performance.
- **IPFS Integration**: Save and load FAISS indexes to/from IPFS.
- **Local Caching**: Cache indexes locally for quick access.
- **Metadata Management**: Store and retrieve index metadata.

## Installation

```bash
pip install ipfs_embeddings_py ipfs_faiss_py
```

### Dependencies

- **ipfs_embeddings_py**:
  - sentence_transformers
  - numpy
  - ipfs_kit_py (for IPFS integration)

- **ipfs_faiss_py**:
  - faiss-cpu or faiss-gpu
  - numpy
  - ipfs_kit_py (for IPFS integration)

## Quick Start

### Basic Usage

```python
import asyncio
from ipfs_embeddings_py import IPFSEmbeddingsPy
from ipfs_faiss_py import IPFSFaissPy

async def main():
    # Initialize modules
    embeddings = IPFSEmbeddingsPy()
    faiss = IPFSFaissPy()
    
    await embeddings.init()
    await faiss.init()
    
    # Generate embeddings
    texts = [
        "The quick brown fox jumps over the lazy dog",
        "A fast brown fox leaps over a sleeping dog",
        "Artificial intelligence is transforming technology"
    ]
    
    result = await embeddings.generate_embedding(texts)
    embeddings_list = result["embeddings"]
    dimensions = result["dimensions"]
    
    # Create FAISS index and add vectors
    index_result = await faiss.create_index(dimensions, index_type='Flat')
    index_id = index_result["index_id"]
    
    await faiss.add_vectors(index_id, embeddings_list)
    
    # Search for similar vectors
    query = "AI is changing the technological landscape"
    query_result = await embeddings.generate_embedding(query)
    query_embedding = query_result["embedding"]
    
    search_result = await faiss.search(index_id, query_embedding, k=2)
    
    # Print results
    for i, match in enumerate(search_result["results"]):
        idx = match["id"]
        dist = match["distance"]
        print(f"Match {i+1}: {texts[idx]} (distance: {dist:.4f})")

# Run the example
asyncio.run(main())
```

### With IPFS Integration

```python
import asyncio
from ipfs_embeddings_py import IPFSEmbeddingsPy
from ipfs_faiss_py import IPFSFaissPy
from ipfs_kit_py import IPFSKit  # Assume this exists

async def main():
    # Initialize IPFS Kit
    ipfs_kit = IPFSKit()
    await ipfs_kit.init()
    
    # Create resource pool
    resources = {"ipfsKit": ipfs_kit}
    
    # Initialize modules with resources
    embeddings = IPFSEmbeddingsPy(resources)
    faiss = IPFSFaissPy(resources)
    
    await embeddings.init()
    await faiss.init()
    
    # Generate and save embeddings to IPFS
    texts = ["Example text 1", "Example text 2"]
    result = await embeddings.generate_embedding(texts)
    
    save_result = await embeddings.save_embeddings_to_ipfs(result["embeddings"])
    embeddings_cid = save_result["cid"]
    print(f"Embeddings saved to IPFS with CID: {embeddings_cid}")
    
    # Create and save FAISS index to IPFS
    index_result = await faiss.create_index(result["dimensions"])
    index_id = index_result["index_id"]
    
    await faiss.add_vectors(index_id, result["embeddings"])
    
    save_index_result = await faiss.save_to_ipfs(index_id)
    index_cid = save_index_result["index_cid"]
    print(f"FAISS index saved to IPFS with CID: {index_cid}")

# Run the example
asyncio.run(main())
```

## API Reference

### IPFSEmbeddingsPy

```python
class IPFSEmbeddingsPy:
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the IPFS Embeddings module
        
        Args:
            resources (dict): Resources required by the module (e.g., ipfs_kit)
            metadata (dict): Metadata for operations
        """
        
    async def init():
        """
        Initialize the module
        
        Returns:
            bool: True if successful, False otherwise
        """
        
    async def generate_embedding(text, options=None):
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
        
    async def compare_similarity(embedding1, embedding2, metric='cosine'):
        """
        Compare similarity between two embeddings
        
        Args:
            embedding1 (list): First embedding vector
            embedding2 (list): Second embedding vector
            metric (str): Similarity metric (cosine, euclidean, dot)
        
        Returns:
            dict: Result containing similarity score or error
        """
        
    async def search_similar(query, embeddings, options=None):
        """
        Search for similar embeddings
        
        Args:
            query (str or list): Text query or embedding vector
            embeddings (list): List of embeddings to search in
            options (dict): Search options
                - top_k: Number of results to return (default: 5)
                - threshold: Minimum similarity threshold (default: 0.0)
                - metric: Similarity metric (default: 'cosine')
                - include_embeddings: Include embeddings in results (default: False)
        
        Returns:
            dict: Results with matches or error
        """
        
    async def save_embeddings_to_ipfs(embeddings, options=None):
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
        
    async def load_embeddings_from_ipfs(cid, options=None):
        """
        Load embeddings from IPFS
        
        Args:
            cid (str): IPFS CID to load embeddings from
            options (dict): Load options
        
        Returns:
            dict: Result with embeddings or error
        """
```

### IPFSFaissPy

```python
class IPFSFaissPy:
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the IPFS FAISS module
        
        Args:
            resources (dict): Resources required by the module (e.g., ipfs_kit)
            metadata (dict): Metadata for operations
        """
        
    async def init():
        """
        Initialize the module
        
        Returns:
            bool: True if successful, False otherwise
        """
        
    async def create_index(dimensions, index_type='Flat', options=None):
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
        
    async def add_vectors(index_id, vectors, ids=None):
        """
        Add vectors to an index
        
        Args:
            index_id (str): ID of the index to add vectors to
            vectors (list): Vectors to add
            ids (list): Optional IDs for the vectors
        
        Returns:
            dict: Result with count or error
        """
        
    async def search(index_id, query_vector, k=5, options=None):
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
        
    async def save_to_ipfs(index_id, options=None):
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
        
    async def load_from_ipfs(cid, options=None):
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
        
    async def get_index_info(index_id):
        """
        Get information about an index
        
        Args:
            index_id (str): ID of the index
        
        Returns:
            dict: Index information or error
        """
        
    async def list_indexes():
        """
        List all available indexes
        
        Returns:
            dict: List of index IDs and basic info
        """
```

## Integration with hallucinate_app

This package is designed to be easily integrated with the hallucinate_app project using its modular architecture:

1. The hallucinate_app provides integration layers in both JavaScript and Python that dynamically import these modules.
2. The modules are accessed through a resource pool, which provides shared access to components like IPFS Kit.
3. The modules follow the standard interface pattern required by hallucinate_app, including init() and test() methods.
4. Method calls are forwarded from the integration layer to these implementation modules.

### Integration Example

```python
# In hallucinate_app's integration layer
from ipfs_embeddings_py import IPFSEmbeddingsPy

class IPFSEmbeddings:
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Initialize ipfs_embeddings_py
        self.modules = {"ipfs_embeddings_py": None}
        
        try:
            self.modules["ipfs_embeddings_py"] = IPFSEmbeddingsPy(resources, metadata)
        except Exception as e:
            logger.error(f"Failed to initialize ipfs_embeddings_py: {e}")
    
    async def generate_embedding(self, text, options=None):
        # Forward call to implementation
        if self.modules["ipfs_embeddings_py"]:
            return await self.modules["ipfs_embeddings_py"].generate_embedding(text, options)
        return {"error": "No implementation available"}
```

## Testing

The package includes a comprehensive test suite for verifying functionality and integration:

```bash
python -m unittest discover -s ipfs_embeddings_py
```

Or run the integration test specifically:

```bash
python ipfs_embeddings_py/test_integration.py
```

## License

MIT

## Contributors

This package is maintained as part of the hallucinate_app project.