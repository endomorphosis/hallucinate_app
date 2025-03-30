# GraphRAG Integration Documentation

This document describes the integration of Graph-based Retrieval Augmented Generation (GraphRAG) in the Hallucinate App, which leverages the `ipfs_datasets_py` package for implementation.

## Overview

GraphRAG combines the power of vector embeddings with graph databases to create a more robust knowledge retrieval system. Unlike traditional RAG systems that rely solely on vector similarity, GraphRAG maintains relationships between knowledge chunks, allowing for both semantic search and contextual graph traversal.

## Integration Architecture

The GraphRAG integration in Hallucinate App follows the application's modular pattern:

1. **Integration Layer**: The `graphrag.py` module provides a standardized interface to GraphRAG functionality
2. **Implementation**: Core functionality is delegated to the `ipfs_datasets_py` package
3. **Resource Pool**: GraphRAG integrates with the application's shared resources (IPFS, FAISS, etc.)
4. **Testing**: Comprehensive test suite in `test_graphrag.py` validates integration

## Core Components

### GraphRAG Class

The `GraphRAG` class in `graphrag.py` serves as the primary integration point:

```python
# Create a GraphRAG instance
from hallucinate_app.graphrag import GraphRAG, graphrag

# Using default instance
result = await graphrag.add_document("doc_id", "Document text content")

# Or create a custom instance with specific resources
custom_graphrag = GraphRAG(
    resources={'ipfsKit': my_ipfs_kit, 'ipfsFaiss': my_faiss}, 
    metadata={'storage_dir': '/custom/path'}
)
await custom_graphrag.init()
```

### Key Methods

The GraphRAG integration provides these primary operations:

- **Document Operations**:
  - `add_document(document_id, text, metadata)`: Add a document to the knowledge graph
  
- **Node & Edge Operations**:
  - `add_node(node_id, data, metadata, generate_embedding)`: Add a node to the graph
  - `add_edge(source_id, target_id, weight, bidirectional)`: Create a relationship between nodes
  
- **Search Operations**:
  - `vector_search(query, k)`: Semantic search using vector similarity
  - `hybrid_search(query, k, alpha)`: Combined search using vectors and graph structure
  - `query(query_text, k, search_type)`: General query interface
  
- **Persistence**:
  - `save_to_disk(path)`: Save the knowledge graph to a local file
  - `load_from_disk(path)`: Load a knowledge graph from a local file
  - `save_to_ipfs()`: Save the knowledge graph to IPFS
  - `load_from_ipfs(cid)`: Load a knowledge graph from IPFS

## Workflow Examples

### Document Processing & Search

```python
import asyncio
from hallucinate_app.graphrag import graphrag

async def process_documents():
    # Initialize GraphRAG
    await graphrag.init()
    
    # Add documents
    await graphrag.add_document(
        "doc1", 
        "The IPFS protocol enables a content-addressable web.",
        {"source": "ipfs_docs", "date": "2023-01-15"}
    )
    
    await graphrag.add_document(
        "doc2",
        "Decentralized systems provide resilience against failures.",
        {"source": "system_design", "date": "2023-02-20"}
    )
    
    # Search for relevant content
    results = await graphrag.hybrid_search("content-addressable systems", k=2)
    
    # Save knowledge graph to IPFS
    cid = await graphrag.save_to_ipfs()
    print(f"Knowledge graph saved to IPFS with CID: {cid}")
    
    return results

# Run the example
asyncio.run(process_documents())
```

### Custom Knowledge Graph with Direct Node/Edge Management

```python
import asyncio
from hallucinate_app.graphrag import GraphRAG

async def build_knowledge_graph():
    # Create custom GraphRAG instance
    graph = GraphRAG(metadata={'storage_dir': '/tmp/test_graph'})
    await graph.init()
    
    # Add concept nodes
    await graph.add_node("ipfs", "InterPlanetary File System", {"type": "technology"})
    await graph.add_node("p2p", "Peer-to-peer communication", {"type": "concept"})
    await graph.add_node("content_addressing", "Content addressing via hashes", {"type": "concept"})
    
    # Create relationships
    await graph.add_edge("ipfs", "p2p", weight=0.9, bidirectional=True)
    await graph.add_edge("ipfs", "content_addressing", weight=0.8)
    
    # Query the graph
    results = await graph.query("peer-to-peer file system", k=3, search_type="hybrid")
    
    # Save to disk
    await graph.save_to_disk("/tmp/my_knowledge_graph.json")
    
    return results

# Run the example
asyncio.run(build_knowledge_graph())
```

## Testing

The GraphRAG integration includes a comprehensive test suite in `test_graphrag.py` that validates:

1. Initialization and resource access
2. Document operations
3. Node and edge operations
4. Vector and hybrid search
5. Persistence to disk and IPFS
6. Integration with the resource pool

Run the tests with:

```bash
python -m unittest hallucinate_app.python.test.test_graphrag
```

## Requirements

The GraphRAG integration has the following dependencies:

- `ipfs_datasets_py` package (provides GraphRAG implementation)
- FAISS integration for vector search (via `ipfs_faiss.py`)
- IPFS integration for persistence (via `ipfs_kit.py`)

## Error Handling

GraphRAG operations follow the application's error handling pattern:

1. Methods return proper results when successful
2. Methods return error dictionaries (`{"error": "error message"}`) when operations fail
3. Errors propagate to the application's error monitoring system

## Future Enhancements

Planned enhancements for the GraphRAG integration:

1. Advanced entity extraction support
2. Multi-modal knowledge graph support (text, images, audio)
3. Reasoning capabilities for knowledge graph traversal
4. Integration with LLMs for enhanced question answering
5. Real-time knowledge graph visualization in the dashboard