/**
 * GraphRAG Integration Example
 *
 * This script demonstrates how to use the GraphRAG integration
 * to build and query knowledge graphs in Hallucinate App.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Configure logging
const logger = {
  info: (message) => console.log(`[INFO] [graphrag_example] ${message}`),
  error: (message) => console.error(`[ERROR] [graphrag_example] ${message}`)
};

// Import the GraphRAG module
import { GraphRAG } from '../graphrag.js';

/**
 * Build a sample knowledge graph about AI technologies
 */
async function buildSampleKnowledgeGraph() {
  // Create a temporary directory for the graph
  const graphDir = path.join(os.homedir(), '.cache', 'graphrag_example');
  fs.mkdirSync(graphDir, { recursive: true });
  
  // Initialize GraphRAG with custom storage location
  const graph = new GraphRAG(null, { storageDir: graphDir, dbName: 'ai_knowledge_graph' });
  await graph.init();
  
  logger.info('Building sample knowledge graph...');
  
  // Add documents about AI technologies
  const documents = [
    {
      id: 'doc1',
      title: 'What is Retrieval Augmented Generation?',
      content: `
        Retrieval Augmented Generation (RAG) is an AI framework that enhances 
        large language models by retrieving external knowledge. This allows models 
        to access up-to-date information beyond their training data, reducing hallucination 
        and improving factual accuracy.
      `
    },
    {
      id: 'doc2',
      title: 'Graph-based RAG',
      content: `
        Graph-based RAG extends traditional RAG by organizing retrieved information in a 
        knowledge graph structure. This approach captures relationships between entities 
        and concepts, enabling more contextual understanding. By combining vector embeddings 
        with graph traversal algorithms, it delivers more accurate and relevant information.
      `
    },
    {
      id: 'doc3',
      title: 'IPFS Applications in AI',
      content: `
        The InterPlanetary File System (IPFS) offers decentralized storage for AI models 
        and datasets. Content addressing ensures data integrity, while peer-to-peer 
        distribution improves availability and reduces bandwidth costs. IPFS can store 
        both models and knowledge bases in a distributed manner, enabling decentralized AI systems.
      `
    }
  ];
  
  // Add documents to knowledge graph
  for (const doc of documents) {
    logger.info(`Adding document: ${doc.title}`);
    await graph.addDocument(
      doc.id, 
      doc.content, 
      { title: doc.title }
    );
  }
  
  // Add specific concept nodes
  const concepts = [
    { id: 'rag', name: 'Retrieval Augmented Generation', type: 'technology' },
    { id: 'graphrag', name: 'Graph-based RAG', type: 'technology' },
    { id: 'llm', name: 'Large Language Model', type: 'technology' },
    { id: 'ipfs', name: 'InterPlanetary File System', type: 'technology' },
    { id: 'vector_db', name: 'Vector Database', type: 'technology' }
  ];
  
  for (const concept of concepts) {
    logger.info(`Adding concept: ${concept.name}`);
    await graph.addNode(
      concept.id,
      concept.name,
      { type: concept.type }
    );
  }
  
  // Add relationships between concepts
  const relationships = [
    { source: 'rag', target: 'llm', weight: 0.9 },
    { source: 'rag', target: 'vector_db', weight: 0.8 },
    { source: 'graphrag', target: 'rag', weight: 1.0 },
    { source: 'ipfs', target: 'graphrag', weight: 0.6 },
    { source: 'vector_db', target: 'graphrag', weight: 0.85 }
  ];
  
  for (const rel of relationships) {
    logger.info(`Adding relationship: ${rel.source} -> ${rel.target}`);
    await graph.addEdge(
      rel.source,
      rel.target,
      rel.weight
    );
  }
  
  // Save to disk
  const graphPath = path.join(graphDir, 'ai_knowledge_graph.json');
  logger.info(`Saving knowledge graph to: ${graphPath}`);
  await graph.saveToDisk(graphPath);
  
  return { graph, graphPath };
}

/**
 * Run sample queries against the knowledge graph
 */
async function queryKnowledgeGraph(graph, queries) {
  const results = {};
  
  for (const [queryType, queryText] of Object.entries(queries)) {
    logger.info(`Running ${queryType} query: ${queryText}`);
    
    if (queryType === 'vector') {
      const result = await graph.vectorSearch(queryText, 2);
      results.vector = result;
    } else if (queryType === 'hybrid') {
      const result = await graph.hybridSearch(queryText, 2);
      results.hybrid = result;
    } else if (queryType === 'general') {
      const result = await graph.query(queryText, 2, 'hybrid');
      results.general = result;
    }
  }
  
  return results;
}

/**
 * Main function to run the example
 */
async function main() {
  try {
    // Build the knowledge graph
    const { graph, graphPath } = await buildSampleKnowledgeGraph();
    
    // Example queries
    const queries = {
      vector: 'How does retrieval augmented generation work?',
      hybrid: 'connections between IPFS and AI technologies',
      general: 'graph-based knowledge systems'
    };
    
    // Query the graph
    const results = await queryKnowledgeGraph(graph, queries);
    
    // Display results
    for (const [queryType, result] of Object.entries(results)) {
      logger.info(`\n${queryType.toUpperCase()} SEARCH RESULTS:`);
      if (Array.isArray(result)) {
        for (let i = 0; i < result.length; i++) {
          const [nodeId, score] = result[i];
          logger.info(`  Result ${i+1}: Node ID: ${nodeId}, Score: ${score.toFixed(4)}`);
        }
      } else {
        logger.info(`  ${result}`);
      }
    }
    
    logger.info(`\nKnowledge graph saved to: ${graphPath}`);
    logger.info(`You can load this graph in future using: graph.loadFromDisk('${graphPath}')`);
    
    // Optionally save to IPFS if available
    try {
      if (graph.ipfsKit) {
        const cid = await graph.saveToIpfs();
        if (cid && typeof cid !== 'object' && !String(cid).includes('error')) {
          logger.info(`\nKnowledge graph saved to IPFS with CID: ${cid}`);
          logger.info(`You can load this graph from IPFS using: graph.loadFromIpfs('${cid}')`);
        }
      }
    } catch (error) {
      logger.error(`Failed to save to IPFS: ${error}`);
    }
    
  } catch (error) {
    logger.error(`Error in GraphRAG example: ${error}`);
    throw error;
  }
}

// Run the example
main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});