"""
Integration Test Suite for IPFS Embeddings and FAISS

This module provides a test suite for verifying the integration between
ipfs_embeddings_py and ipfs_faiss_py packages, ensuring they work together
properly for end-to-end vector embedding and similarity search operations.
"""

import unittest
import asyncio
import os
import sys
import json
import logging
import numpy as np
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("integration_test")

# Import the modules
try:
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from ipfs_embeddings_py.ipfs_embeddings_py import IPFSEmbeddingsPy
    from ipfs_embeddings_py.ipfs_faiss_py import IPFSFaissPy
    modules_imported = True
except ImportError as e:
    logger.error(f"Error importing modules: {e}")
    modules_imported = False

# Mock IPFS Kit for testing without IPFS dependency
class MockIPFSKit:
    """Mock IPFS Kit for testing without actual IPFS"""
    
    def __init__(self):
        self.files = {}
        logger.info("Initialized Mock IPFS Kit")
    
    async def is_connected(self):
        """Check if connected to IPFS"""
        return True
    
    async def add_file(self, file_path):
        """Add a file to mock IPFS"""
        try:
            # Read the file content
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # Generate a mock CID based on file content
            import hashlib
            cid = "Qm" + hashlib.sha256(content).hexdigest()[:44]
            
            # Store the content
            self.files[cid] = content
            
            return {
                "success": True,
                "cid": cid,
                "size": len(content)
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def get_file(self, cid, output_path):
        """Get a file from mock IPFS"""
        try:
            # Check if CID exists
            if cid not in self.files:
                return {"error": f"CID not found: {cid}"}
            
            # Write content to the output path
            with open(output_path, 'wb') as f:
                f.write(self.files[cid])
            
            return {
                "success": True,
                "size": len(self.files[cid])
            }
        except Exception as e:
            return {"error": str(e)}

class IPFSEmbeddingsFAISSIntegrationTest(unittest.TestCase):
    """
    Test the integration between IPFS Embeddings and FAISS modules
    
    This test suite verifies that the two modules work together properly for
    end-to-end vector embedding and similarity search operations.
    """
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        # Skip if modules couldn't be imported
        if not modules_imported:
            raise unittest.SkipTest("Required modules couldn't be imported")
        
        # Create a mock IPFS Kit
        cls.mock_ipfs_kit = MockIPFSKit()
        
        # Create a shared resource pool
        cls.resources = {
            "ipfsKit": cls.mock_ipfs_kit
        }
        
        # Create metadata for modules
        cls.metadata = {
            "test": True,
            "cache_dir": os.path.join(os.path.expanduser('~'), '.cache', 'ipfs_test'),
            "model_name": "all-MiniLM-L6-v2"  # Small model for testing
        }
        
        # Initialize modules
        cls.embeddings = IPFSEmbeddingsPy(cls.resources, cls.metadata)
        cls.faiss = IPFSFaissPy(cls.resources, cls.metadata)
        
        # Create an event loop for async tests
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        
        # Initialize both modules
        embeddings_init = cls.loop.run_until_complete(cls.embeddings.init())
        faiss_init = cls.loop.run_until_complete(cls.faiss.init())
        
        # Check if initialization was successful
        cls.embeddings_available = embeddings_init
        cls.faiss_available = faiss_init
        
        # Sample test data
        cls.test_texts = [
            "The quick brown fox jumps over the lazy dog",
            "A fast brown fox leaps over a sleeping dog",
            "The dog was too lazy to move when the fox jumped over",
            "Artificial intelligence is transforming technology",
            "Machine learning systems are improving rapidly",
            "IPFS provides a decentralized method for storing data",
            "Vector embeddings enable semantic search capabilities",
            "FAISS allows for efficient similarity search in high-dimensional spaces"
        ]
    
    def test_modules_initialized(self):
        """Test that both modules are properly initialized"""
        logger.info("Testing module initialization")
        self.assertTrue(self.embeddings_available, "Embeddings module should initialize")
        self.assertTrue(self.faiss_available, "FAISS module should initialize")
    
    def test_generate_embeddings(self):
        """Test generating embeddings"""
        if not self.embeddings_available:
            self.skipTest("Embeddings module not available")
        
        logger.info("Testing embedding generation")
        
        # Generate an embedding for a single text
        result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts[0])
        )
        
        self.assertNotIn("error", result, "Embedding generation should not error")
        self.assertIn("embedding", result, "Result should contain embedding")
        self.assertIn("dimensions", result, "Result should contain dimensions")
        
        # Verify embedding dimensions and type
        embedding = result["embedding"]
        self.assertIsInstance(embedding, list, "Embedding should be a list")
        self.assertEqual(len(embedding), result["dimensions"], "Embedding length should match dimensions")
        
        logger.info(f"Generated embedding with {result['dimensions']} dimensions")
        return embedding
    
    def test_batch_generate_embeddings(self):
        """Test generating embeddings in batch"""
        if not self.embeddings_available:
            self.skipTest("Embeddings module not available")
        
        logger.info("Testing batch embedding generation")
        
        # Generate embeddings for multiple texts
        result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts)
        )
        
        self.assertNotIn("error", result, "Batch embedding generation should not error")
        self.assertIn("embeddings", result, "Result should contain embeddings list")
        self.assertIn("count", result, "Result should contain count")
        
        # Verify embeddings
        embeddings = result["embeddings"]
        self.assertEqual(len(embeddings), len(self.test_texts), "Should generate embedding for each text")
        self.assertEqual(result["count"], len(self.test_texts), "Count should match input list length")
        
        logger.info(f"Generated {result['count']} embeddings")
        return embeddings
    
    def test_compare_similarity(self):
        """Test comparing similarity between embeddings"""
        if not self.embeddings_available:
            self.skipTest("Embeddings module not available")
        
        logger.info("Testing embedding similarity comparison")
        
        # Generate embeddings for two similar texts
        result1 = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts[0])
        )
        result2 = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts[1])
        )
        
        # Compare similarity
        similarity_result = self.loop.run_until_complete(
            self.embeddings.compare_similarity(
                result1["embedding"],
                result2["embedding"]
            )
        )
        
        self.assertNotIn("error", similarity_result, "Similarity comparison should not error")
        self.assertIn("similarity", similarity_result, "Result should contain similarity score")
        self.assertIn("metric", similarity_result, "Result should contain metric name")
        
        # Verify similarity score is between 0 and 1
        similarity = similarity_result["similarity"]
        self.assertGreaterEqual(similarity, 0, "Similarity should be >= 0")
        self.assertLessEqual(similarity, 1, "Similarity should be <= 1")
        
        # For similar texts, similarity should be relatively high
        self.assertGreater(similarity, 0.5, "Similar texts should have high similarity")
        
        logger.info(f"Similarity between similar texts: {similarity}")
        
        # Compare with dissimilar text
        result3 = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts[5])  # IPFS text
        )
        
        dissimilar_result = self.loop.run_until_complete(
            self.embeddings.compare_similarity(
                result1["embedding"],
                result3["embedding"]
            )
        )
        
        dissimilar_similarity = dissimilar_result["similarity"]
        
        # For dissimilar texts, similarity should be lower
        self.assertLess(dissimilar_similarity, similarity, "Dissimilar texts should have lower similarity")
        
        logger.info(f"Similarity between dissimilar texts: {dissimilar_similarity}")
    
    def test_search_similar(self):
        """Test searching for similar embeddings"""
        if not self.embeddings_available:
            self.skipTest("Embeddings module not available")
        
        logger.info("Testing embedding similarity search")
        
        # Generate embeddings for all test texts
        batch_result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts)
        )
        
        embeddings = batch_result["embeddings"]
        
        # Create a list of items with embeddings for search
        items = []
        for i, text in enumerate(self.test_texts):
            items.append({
                "id": i,
                "text": text,
                "embedding": embeddings[i]
            })
        
        # Search for similar texts to the first one
        search_result = self.loop.run_until_complete(
            self.embeddings.search_similar(self.test_texts[0], items)
        )
        
        self.assertNotIn("error", search_result, "Similarity search should not error")
        self.assertIn("results", search_result, "Result should contain results list")
        self.assertIn("count", search_result, "Result should contain count")
        
        # Verify search results
        results = search_result["results"]
        self.assertGreater(len(results), 0, "Should find at least one result")
        
        # First result should be the exact match (the input text)
        self.assertEqual(results[0]["id"], 0, "First result should be the query text")
        
        # Second result should be the most similar text
        self.assertEqual(results[1]["id"], 1, "Second result should be the most similar text")
        
        logger.info(f"Found {search_result['count']} similar texts")
        
        # Test searching with a vector directly
        vector_search_result = self.loop.run_until_complete(
            self.embeddings.search_similar(embeddings[3], items)
        )
        
        self.assertNotIn("error", vector_search_result, "Vector search should not error")
        self.assertEqual(vector_search_result["results"][0]["id"], 3, "First result should match input vector")
        
        logger.info("Vector-based search successful")
    
    def test_create_faiss_index(self):
        """Test creating a FAISS index"""
        if not self.faiss_available:
            self.skipTest("FAISS module not available")
        
        logger.info("Testing FAISS index creation")
        
        # Get embedding dimensions from a test embedding
        embed_result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts[0])
        )
        
        dimensions = embed_result["dimensions"]
        
        # Create a FAISS index
        index_result = self.loop.run_until_complete(
            self.faiss.create_index(dimensions, index_type='Flat')
        )
        
        self.assertNotIn("error", index_result, "Index creation should not error")
        self.assertIn("index_id", index_result, "Result should contain index_id")
        self.assertIn("type", index_result, "Result should contain index type")
        
        index_id = index_result["index_id"]
        logger.info(f"Created FAISS index: {index_id}")
        
        return index_id, dimensions
    
    def test_add_vectors_to_faiss(self):
        """Test adding vectors to a FAISS index"""
        if not self.faiss_available or not self.embeddings_available:
            self.skipTest("FAISS or Embeddings module not available")
        
        logger.info("Testing adding vectors to FAISS index")
        
        # Create an index
        index_result = self.test_create_faiss_index()
        if not isinstance(index_result, tuple):
            self.fail("Failed to create FAISS index")
        
        index_id, dimensions = index_result
        
        # Generate embeddings for test texts
        batch_result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts)
        )
        
        embeddings = batch_result["embeddings"]
        
        # Add vectors to the index
        add_result = self.loop.run_until_complete(
            self.faiss.add_vectors(index_id, embeddings)
        )
        
        self.assertNotIn("error", add_result, "Adding vectors should not error")
        self.assertIn("count", add_result, "Result should contain count")
        self.assertIn("total_vectors", add_result, "Result should contain total_vectors")
        
        # Verify count matches number of embeddings
        self.assertEqual(add_result["count"], len(embeddings), "Count should match number of embeddings")
        
        logger.info(f"Added {add_result['count']} vectors to FAISS index")
        
        return index_id, embeddings
    
    def test_faiss_search(self):
        """Test searching in a FAISS index"""
        if not self.faiss_available or not self.embeddings_available:
            self.skipTest("FAISS or Embeddings module not available")
        
        logger.info("Testing FAISS vector search")
        
        # Add vectors to index
        add_result = self.test_add_vectors_to_faiss()
        if not isinstance(add_result, tuple):
            self.fail("Failed to add vectors to FAISS index")
        
        index_id, embeddings = add_result
        
        # Use the first embedding as a query
        query_embedding = embeddings[0]
        
        # Search for similar vectors
        search_result = self.loop.run_until_complete(
            self.faiss.search(index_id, query_embedding, k=3)
        )
        
        self.assertNotIn("error", search_result, "FAISS search should not error")
        self.assertIn("results", search_result, "Result should contain results list")
        self.assertIn("count", search_result, "Result should contain count")
        
        # Verify search results
        results = search_result["results"]
        self.assertGreater(len(results), 0, "Should find at least one result")
        
        # First result should be the exact match (zero distance)
        self.assertEqual(results[0]["id"], 0, "First result should be the query vector")
        
        logger.info(f"Found {search_result['count']} similar vectors")
    
    def test_end_to_end_integration(self):
        """Test end-to-end integration workflow"""
        if not self.faiss_available or not self.embeddings_available:
            self.skipTest("FAISS or Embeddings module not available")
        
        logger.info("Testing end-to-end integration workflow")
        
        # 1. Generate embeddings for all test texts
        batch_result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts)
        )
        
        embeddings = batch_result["embeddings"]
        dimensions = batch_result["dimensions"]
        
        # 2. Create a FAISS index
        index_result = self.loop.run_until_complete(
            self.faiss.create_index(dimensions, index_type='Flat')
        )
        
        index_id = index_result["index_id"]
        
        # 3. Add embeddings to the index
        add_result = self.loop.run_until_complete(
            self.faiss.add_vectors(index_id, embeddings)
        )
        
        # 4. Generate a new embedding for a query text
        query_text = "How does IPFS help with decentralized storage?"
        query_result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(query_text)
        )
        
        query_embedding = query_result["embedding"]
        
        # 5. Search for similar vectors in the index
        search_result = self.loop.run_until_complete(
            self.faiss.search(index_id, query_embedding, k=3)
        )
        
        # 6. Map results back to original texts
        mapped_results = []
        for result in search_result["results"]:
            vector_id = result["id"]
            if 0 <= vector_id < len(self.test_texts):
                mapped_results.append({
                    "text": self.test_texts[vector_id],
                    "distance": result["distance"]
                })
        
        # Verify results contain IPFS-related text
        found_ipfs = False
        for result in mapped_results:
            if "IPFS" in result["text"]:
                found_ipfs = True
                break
        
        self.assertTrue(found_ipfs, "Results should include IPFS-related text")
        
        logger.info(f"End-to-end integration test successful with {len(mapped_results)} results")
        for i, r in enumerate(mapped_results):
            logger.info(f"  {i+1}. {r['text']} (distance: {r['distance']:.4f})")
    
    def test_ipfs_integration(self):
        """Test IPFS integration for saving and loading"""
        if not self.faiss_available or not self.embeddings_available:
            self.skipTest("FAISS or Embeddings module not available")
        
        logger.info("Testing IPFS integration")
        
        # 1. Generate embeddings
        batch_result = self.loop.run_until_complete(
            self.embeddings.generate_embedding(self.test_texts)
        )
        
        embeddings = batch_result["embeddings"]
        
        # 2. Save embeddings to IPFS
        save_result = self.loop.run_until_complete(
            self.embeddings.save_embeddings_to_ipfs(embeddings)
        )
        
        self.assertNotIn("error", save_result, "Saving embeddings should not error")
        self.assertIn("cid", save_result, "Result should contain CID")
        
        embeddings_cid = save_result["cid"]
        logger.info(f"Saved embeddings to IPFS with CID: {embeddings_cid}")
        
        # 3. Load embeddings from IPFS
        load_result = self.loop.run_until_complete(
            self.embeddings.load_embeddings_from_ipfs(embeddings_cid)
        )
        
        self.assertNotIn("error", load_result, "Loading embeddings should not error")
        self.assertIn("embeddings", load_result, "Result should contain embeddings")
        
        loaded_embeddings = load_result["embeddings"]
        self.assertEqual(len(loaded_embeddings), len(embeddings), "Should load all embeddings")
        
        logger.info(f"Loaded {len(loaded_embeddings)} embeddings from IPFS")
        
        # 4. Create and populate FAISS index
        index_result = self.loop.run_until_complete(
            self.faiss.create_index(batch_result["dimensions"], index_type='Flat')
        )
        
        index_id = index_result["index_id"]
        self.loop.run_until_complete(
            self.faiss.add_vectors(index_id, loaded_embeddings)
        )
        
        # 5. Save FAISS index to IPFS
        index_save_result = self.loop.run_until_complete(
            self.faiss.save_to_ipfs(index_id)
        )
        
        self.assertNotIn("error", index_save_result, "Saving index should not error")
        self.assertIn("index_cid", index_save_result, "Result should contain index_cid")
        
        index_cid = index_save_result["index_cid"]
        metadata_cid = index_save_result.get("metadata_cid")
        
        logger.info(f"Saved FAISS index to IPFS with CID: {index_cid}")
        if metadata_cid:
            logger.info(f"Saved FAISS metadata to IPFS with CID: {metadata_cid}")
        
        # 6. Load FAISS index from IPFS
        load_options = {}
        if metadata_cid:
            load_options["metadata_cid"] = metadata_cid
        
        index_load_result = self.loop.run_until_complete(
            self.faiss.load_from_ipfs(index_cid, load_options)
        )
        
        self.assertNotIn("error", index_load_result, "Loading index should not error")
        self.assertIn("index_id", index_load_result, "Result should contain index_id")
        
        loaded_index_id = index_load_result["index_id"]
        
        logger.info(f"Loaded FAISS index from IPFS: {loaded_index_id}")
        
        # 7. Search in the loaded index to verify it works
        query_embedding = embeddings[0]
        
        search_result = self.loop.run_until_complete(
            self.faiss.search(loaded_index_id, query_embedding, k=3)
        )
        
        self.assertNotIn("error", search_result, "Searching loaded index should not error")
        self.assertGreater(len(search_result["results"]), 0, "Should find results in loaded index")
        
        logger.info(f"Successfully searched in loaded index, found {len(search_result['results'])} results")
    
    @classmethod
    def tearDownClass(cls):
        """Clean up test environment"""
        # Clean up any temporary files or resources
        pass

if __name__ == '__main__':
    # Run the tests and output results in JSON format
    test_loader = unittest.TestLoader()
    test_suite = test_loader.loadTestsFromTestCase(IPFSEmbeddingsFAISSIntegrationTest)
    test_runner = unittest.TextTestRunner(verbosity=2)
    test_result = test_runner.run(test_suite)
    
    # Output JSON summary
    results = {
        "success": test_result.wasSuccessful(),
        "total": test_result.testsRun,
        "failures": len(test_result.failures),
        "errors": len(test_result.errors)
    }
    
    print(f"\nTest Summary: {json.dumps(results, indent=2)}")