# GraphRAG Integration Module

This module provides an integration layer for the GraphRAG (Graph-based Retrieval Augmented Generation) functionality in Hallucinate App. It combines vector embeddings with graph-based knowledge representation for more contextual and accurate information retrieval.

## Features

- Document ingestion with automatic node creation
- Manual node and edge creation for custom knowledge graphs
- Vector search based on embedding similarity
- Hybrid search combining vector similarity with graph importance
- Persistence to disk and IPFS for decentralized storage
- Graph statistics and analytics

## Usage

The GraphRAG module provides a simple interface for creating and querying knowledge graphs. Here's a basic example:

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

## API Reference

### Constructor

```javascript
new GraphRAG(resources, metadata)
```

- `resources` (Object, optional): Resources required by GraphRAG
  - `ipfsKit`: IPFS Kit instance
  - `ipfsFaiss`: IPFS FAISS instance
- `metadata` (Object, optional): Metadata for operations
  - `storageDir`: Directory for storing graph files
  - `dbName`: Name of the graph database

### Methods

#### `async init()`

Initializes GraphRAG and its dependencies.

#### `async addDocument(documentId, text, metadata)`

Adds a document to the graph database.

- `documentId` (String): Unique ID for the document
- `text` (String): Document text content
- `metadata` (Object, optional): Additional metadata for the document

#### `async addNode(nodeId, data, metadata, generateEmbedding)`

Adds a node to the graph.

- `nodeId` (String): Unique ID for the node
- `data` (String|Object): Node data (text or other content)
- `metadata` (Object, optional): Additional metadata for the node
- `generateEmbedding` (Boolean, default: true): Whether to generate an embedding

#### `async addEdge(sourceId, targetId, weight, bidirectional)`

Adds an edge between nodes.

- `sourceId` (String): Source node ID
- `targetId` (String): Target node ID
- `weight` (Number, default: 1.0): Edge weight
- `bidirectional` (Boolean, default: false): Whether to add edges in both directions

#### `async query(queryText, k, searchType)`

Queries the graph database.

- `queryText` (String): Query text
- `k` (Number, default: 5): Number of results to return
- `searchType` (String, default: "hybrid"): Search type ("vector", "hybrid")

#### `async vectorSearch(query, k)`

Performs vector similarity search.

- `query` (String|Array): Query text or embedding
- `k` (Number, default: 5): Number of results to return

#### `async hybridSearch(query, k, alpha)`

Performs hybrid search combining vector similarity and graph traversal.

- `query` (String): Query text
- `k` (Number, default: 5): Number of results to return
- `alpha` (Number, default: 0.5): Balance between vector similarity and graph importance

#### `async saveToDisk(path)`

Saves the graph database to disk.

- `path` (String, optional): Path to save to or null for default

#### `async loadFromDisk(path)`

Loads the graph database from disk.

- `path` (String): Path to load from

#### `async saveToIpfs()`

Saves the graph database to IPFS.

#### `async loadFromIpfs(cid)`

Loads the graph database from IPFS.

- `cid` (String): IPFS CID for the database

#### `async getStats()`

Gets statistics about the graph database.

#### `test()`

Runs tests for the GraphRAG integration layer.

## Integration with Other Modules

GraphRAG integrates with the following modules:

- **IPFS Kit**: For storing and retrieving graph data from IPFS
- **IPFS FAISS**: For vector similarity search functionality
- **IPFS Datasets**: As the source of the GraphRAG implementation

## Example

For a complete example, see `examples/graphrag_example.js` which demonstrates:

1. Building a knowledge graph about AI technologies
2. Adding documents, concepts, and relationships
3. Querying using different search methods
4. Persisting to disk and IPFS

## Testing

Run the GraphRAG tests with:

```bash
node test/test_graphrag.js
```

The tests verify:
- Basic initialization
- Document operations
- Node and edge operations
- Vector and hybrid search
- Persistence to disk and IPFS