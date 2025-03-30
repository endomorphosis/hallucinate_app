"""
GraphRAG Integration Example

This script demonstrates how to use the GraphRAG integration
to build and query knowledge graphs in Hallucinate App.
"""

import os
import asyncio
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("graphrag_example")

# Ensure examples directory exists
examples_dir = Path(__file__).parent
if not examples_dir.exists():
    examples_dir.mkdir(parents=True)

# Import the GraphRAG module
try:
    from hallucinate_app.graphrag import GraphRAG
except ImportError:
    # Try alternative import path
    import sys
    sys.path.append(str(Path(__file__).parents[3]))  # Add project root to path
    from hallucinate_app.python.hallucinate_app.graphrag import GraphRAG


async def build_sample_knowledge_graph():
    """Build a sample knowledge graph about AI technologies"""
    
    # Create a temporary directory for the graph
    graph_dir = os.path.join(os.path.expanduser('~'), '.cache', 'graphrag_example')
    os.makedirs(graph_dir, exist_ok=True)
    
    # Initialize GraphRAG with custom storage location
    graph = GraphRAG(metadata={'storage_dir': graph_dir, 'db_name': 'ai_knowledge_graph'})
    await graph.init()
    
    logger.info("Building sample knowledge graph...")
    
    # Add documents about AI technologies
    documents = [
        {
            "id": "doc1",
            "title": "What is Retrieval Augmented Generation?",
            "content": """
            Retrieval Augmented Generation (RAG) is an AI framework that enhances 
            large language models by retrieving external knowledge. This allows models 
            to access up-to-date information beyond their training data, reducing hallucination 
            and improving factual accuracy.
            """
        },
        {
            "id": "doc2",
            "title": "Graph-based RAG",
            "content": """
            Graph-based RAG extends traditional RAG by organizing retrieved information in a 
            knowledge graph structure. This approach captures relationships between entities 
            and concepts, enabling more contextual understanding. By combining vector embeddings 
            with graph traversal algorithms, it delivers more accurate and relevant information.
            """
        },
        {
            "id": "doc3",
            "title": "IPFS Applications in AI",
            "content": """
            The InterPlanetary File System (IPFS) offers decentralized storage for AI models 
            and datasets. Content addressing ensures data integrity, while peer-to-peer 
            distribution improves availability and reduces bandwidth costs. IPFS can store 
            both models and knowledge bases in a distributed manner, enabling decentralized AI systems.
            """
        }
    ]
    
    # Add documents to knowledge graph
    for doc in documents:
        logger.info(f"Adding document: {doc['title']}")
        await graph.add_document(
            doc["id"], 
            doc["content"], 
            {"title": doc["title"]}
        )
    
    # Add specific concept nodes
    concepts = [
        {"id": "rag", "name": "Retrieval Augmented Generation", "type": "technology"},
        {"id": "graphrag", "name": "Graph-based RAG", "type": "technology"},
        {"id": "llm", "name": "Large Language Model", "type": "technology"},
        {"id": "ipfs", "name": "InterPlanetary File System", "type": "technology"},
        {"id": "vector_db", "name": "Vector Database", "type": "technology"}
    ]
    
    for concept in concepts:
        logger.info(f"Adding concept: {concept['name']}")
        await graph.add_node(
            concept["id"],
            concept["name"],
            {"type": concept["type"]}
        )
    
    # Add relationships between concepts
    relationships = [
        {"source": "rag", "target": "llm", "weight": 0.9},
        {"source": "rag", "target": "vector_db", "weight": 0.8},
        {"source": "graphrag", "target": "rag", "weight": 1.0},
        {"source": "ipfs", "target": "graphrag", "weight": 0.6},
        {"source": "vector_db", "target": "graphrag", "weight": 0.85}
    ]
    
    for rel in relationships:
        logger.info(f"Adding relationship: {rel['source']} -> {rel['target']}")
        await graph.add_edge(
            rel["source"],
            rel["target"],
            rel["weight"]
        )
    
    # Save to disk
    graph_path = os.path.join(graph_dir, "ai_knowledge_graph.json")
    logger.info(f"Saving knowledge graph to: {graph_path}")
    await graph.save_to_disk(graph_path)
    
    return graph, graph_path


async def query_knowledge_graph(graph, queries):
    """Run sample queries against the knowledge graph"""
    results = {}
    
    for query_type, query_text in queries.items():
        logger.info(f"Running {query_type} query: {query_text}")
        
        if query_type == "vector":
            result = await graph.vector_search(query_text, k=2)
            results["vector"] = result
        elif query_type == "hybrid":
            result = await graph.hybrid_search(query_text, k=2)
            results["hybrid"] = result
        elif query_type == "general":
            result = await graph.query(query_text, k=2, search_type="hybrid")
            results["general"] = result
    
    return results


async def main():
    """Main function to run the example"""
    try:
        # Build the knowledge graph
        graph, graph_path = await build_sample_knowledge_graph()
        
        # Example queries
        queries = {
            "vector": "How does retrieval augmented generation work?",
            "hybrid": "connections between IPFS and AI technologies",
            "general": "graph-based knowledge systems"
        }
        
        # Query the graph
        results = await query_knowledge_graph(graph, queries)
        
        # Display results
        for query_type, result in results.items():
            logger.info(f"\n{query_type.upper()} SEARCH RESULTS:")
            if isinstance(result, list):
                for i, (node_id, score) in enumerate(result):
                    logger.info(f"  Result {i+1}: Node ID: {node_id}, Score: {score:.4f}")
            else:
                logger.info(f"  {result}")
        
        logger.info(f"\nKnowledge graph saved to: {graph_path}")
        logger.info(f"You can load this graph in future using: graph.load_from_disk('{graph_path}')")
        
        # Optionally save to IPFS if available
        try:
            if hasattr(graph, 'ipfs_kit') and graph.ipfs_kit:
                cid = await graph.save_to_ipfs()
                if cid and not isinstance(cid, dict) and not 'error' in str(cid):
                    logger.info(f"\nKnowledge graph saved to IPFS with CID: {cid}")
                    logger.info(f"You can load this graph from IPFS using: graph.load_from_ipfs('{cid}')")
        except Exception as e:
            logger.error(f"Failed to save to IPFS: {e}")
        
    except Exception as e:
        logger.error(f"Error in GraphRAG example: {e}")
        raise


if __name__ == "__main__":
    # Run the example
    asyncio.run(main())