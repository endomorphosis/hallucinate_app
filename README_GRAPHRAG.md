# GraphRAG Integration Module

This module provides an integration layer for Graph-based Retrieval Augmented Generation (GraphRAG) in the Hallucinate App ecosystem. GraphRAG extends traditional RAG by organizing retrieved information in a knowledge graph structure, enabling more contextual understanding and accurate retrieval.

## Overview

GraphRAG combines vector embeddings with graph traversal algorithms to deliver more accurate and relevant information retrieval. This module serves as a standardized interface to the GraphRAG implementation from the ipfs_datasets libraries.

## Implementation

This module is implemented in both JavaScript and Python to support the cross-language architecture of Hallucinate App:

- **JavaScript**: `hallucinate_app/node/graphrag.js`
- **Python**: `hallucinate_app/python/hallucinate_app/graphrag.py`

Both implementations provide identical functionality and follow the same patterns to ensure consistent behavior across the stack.

## Features

- Document ingestion with automatic node creation
- Manual node and edge creation for custom knowledge graphs
- Vector search based on embedding similarity
- Hybrid search combining vector similarity with graph importance
- Persistence to disk and IPFS for decentralized storage
- Graph statistics and analytics
- Dashboard visualization and management interface

## Usage

### JavaScript

```javascript
import { GraphRAG } from './graphrag.js';

// Initialize GraphRAG
const graph = new GraphRAG();
await graph.init();

// Add documents
await graph.addDocument('doc1', 'This is a sample document about AI.', { title: 'AI Overview' });

// Add nodes and edges directly
await graph.addNode('concept1', 'Artificial Intelligence', { type: 'concept' });
await graph.addNode('concept2', 'Machine Learning', { type: 'concept' });
await graph.addEdge('concept1', 'concept2', 0.9, true);

// Query the graph
const results = await graph.query('What is AI?', 5, 'hybrid');
console.log(results);

// Save to disk
await graph.saveToDisk('./my_knowledge_graph.json');

// Save to IPFS (if IPFS Kit is available)
const cid = await graph.saveToIpfs();
console.log(`Graph saved to IPFS with CID: ${cid}`);
```

### Python

```python
from hallucinate_app.graphrag import GraphRAG

# Initialize GraphRAG
graph = GraphRAG()
await graph.init()

# Add documents
await graph.add_document("doc1", "This is a sample document about AI.", {"title": "AI Overview"})

# Add nodes and edges directly
await graph.add_node("concept1", "Artificial Intelligence", {"type": "concept"})
await graph.add_node("concept2", "Machine Learning", {"type": "concept"})
await graph.add_edge("concept1", "concept2", 0.9, True)

# Query the graph
results = await graph.query("What is AI?", 5, "hybrid")
print(results)

# Save to disk
await graph.save_to_disk("./my_knowledge_graph.json")

# Save to IPFS (if IPFS Kit is available)
cid = await graph.save_to_ipfs()
print(f"Graph saved to IPFS with CID: {cid}")
```

## Dashboard Integration

The GraphRAG module includes a comprehensive dashboard interface for visualizing and interacting with knowledge graphs:

- View graph structure and relationships
- Add documents, nodes, and edges through a visual interface
- Run queries and view search results
- Save and load graphs from disk or IPFS
- Monitor graph statistics and performance

To integrate the dashboard in an Electron application:

```javascript
import { GraphRAGDashboard } from './dashboard/graphrag_dashboard.js';

// Create dashboard instance
const dashboard = new GraphRAGDashboard({
  container: document.getElementById('dashboard-container'),
  resources: resourcePool // Optional resource pool with dependencies
});

// Initialize dashboard
await dashboard.init();
```

## Dependencies

- **IPFS Kit**: For storing and retrieving graph data from IPFS
- **IPFS FAISS**: For vector similarity search functionality
- **ipfs_datasets_js/py**: As the source of the GraphRAG implementation

## Examples

Complete example implementations are provided in:

- JavaScript: `hallucinate_app/node/examples/graphrag_example.js`
- Python: `hallucinate_app/python/hallucinate_app/examples/graphrag_example.py`

These examples demonstrate building a knowledge graph about AI technologies, adding documents, concepts, and relationships, and querying using different search methods.

## Testing

Run the GraphRAG tests with:

- JavaScript: `node test/test_graphrag.js`
- Python: `python -m hallucinate_app.test.test_graphrag`

The tests verify basic initialization, document operations, node and edge operations, vector and hybrid search, and persistence to disk and IPFS.

## Resource Pool Integration

When used as part of the Hallucinate App ecosystem, the GraphRAG module can be initialized with the resource pool pattern:

```javascript
// JavaScript
const graphrag = new GraphRAG(resourcePool);

// Python
graphrag = GraphRAG(resources=resource_pool)
```

This allows it to access other modules like IPFS Kit and IPFS FAISS from the shared resource pool.