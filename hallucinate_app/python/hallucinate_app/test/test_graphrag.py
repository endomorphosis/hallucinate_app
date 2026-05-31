"""
Tests for the GraphRAG integration layer

This file contains tests for verifying the functionality
of the GraphRAG integration layer for Hallucinate App.
"""

import os
import json
import asyncio
import tempfile
import unittest
from pathlib import Path

# Import GraphRAG
try:
    from hallucinate_app.graphrag import GraphRAG
except ImportError:
    # Try alternative import path
    import sys
    sys.path.append(str(Path(__file__).parents[3]))
    from hallucinate_app.python.hallucinate_app.graphrag import GraphRAG

class TestGraphRAG(unittest.TestCase):
    """Test suite for GraphRAG integration layer"""
    
    def setUp(self):
        """Set up test environment"""
        self.test_dir = tempfile.mkdtemp(prefix="graphrag_test_")
        
        # Create test GraphRAG instance
        self.graphrag = GraphRAG(
            metadata={
                'storage_dir': self.test_dir,
                'db_name': 'test_graphrag',
                'test_mode': True
            }
        )
        
        # Run event loop for async init
        asyncio.get_event_loop().run_until_complete(self.graphrag.init())
    
    def tearDown(self):
        """Clean up test environment"""
        # Clean up test files
        import shutil
        try:
            shutil.rmtree(self.test_dir)
        except OSError:
            pass
    
    def test_initialization(self):
        """Test GraphRAG initialization"""
        self.assertTrue(self.graphrag.initialized)
        self.assertIsNotNone(self.graphrag.storage_dir)
    
    def test_document_operations(self):
        """Test document operations"""
        # Add a document
        doc_id = "test_doc_1"
        doc_content = "This is a test document for GraphRAG integration testing."
        metadata = {"test": True, "title": "Test Document"}
        
        result = asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_document(doc_id, doc_content, metadata)
        )
        
        # Skip if implementation is not available
        if not self.graphrag.graphrag_impl:
            self.skipTest("GraphRAG implementation not available")
        
        # Check if operation was successful (not returning an error)
        self.assertTrue(
            result is None or 
            (isinstance(result, dict) and "error" not in result) or
            (not isinstance(result, dict) and "error" not in str(result))
        )
    
    def test_node_and_edge_operations(self):
        """Test node and edge operations"""
        # Skip if implementation is not available
        if not self.graphrag.graphrag_impl:
            self.skipTest("GraphRAG implementation not available")
            
        # Add nodes
        node1_id = "test_node_1"
        node2_id = "test_node_2"
        
        result1 = asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_node(node1_id, "Test Node 1", {"type": "test"})
        )
        
        result2 = asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_node(node2_id, "Test Node 2", {"type": "test"})
        )
        
        # Add edge
        edge_result = asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_edge(node1_id, node2_id, 0.8, True)
        )
        
        # Check if operations were successful
        self.assertTrue(
            result1 is None or 
            (isinstance(result1, dict) and "error" not in result1) or
            (not isinstance(result1, dict) and "error" not in str(result1))
        )
        
        self.assertTrue(
            result2 is None or 
            (isinstance(result2, dict) and "error" not in result2) or
            (not isinstance(result2, dict) and "error" not in str(result2))
        )
        
        self.assertTrue(
            edge_result is None or 
            (isinstance(edge_result, dict) and "error" not in edge_result) or
            (not isinstance(edge_result, dict) and "error" not in str(edge_result))
        )
    
    def test_search(self):
        """Test search functionality"""
        # Skip if implementation is not available
        if not self.graphrag.graphrag_impl:
            self.skipTest("GraphRAG implementation not available")
            
        # Add test data
        asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_document("doc_search", "This is a searchable document about AI technology.", {"title": "Search Test"})
        )
        
        # Test vector search
        vector_results = asyncio.get_event_loop().run_until_complete(
            self.graphrag.vector_search("AI technology", 2)
        )
        
        # Test hybrid search
        hybrid_results = asyncio.get_event_loop().run_until_complete(
            self.graphrag.hybrid_search("AI technology", 2)
        )
        
        # Check if searches returned valid results
        self.assertTrue(
            vector_results is None or 
            (isinstance(vector_results, dict) and "error" not in vector_results) or
            (not isinstance(vector_results, dict) and "error" not in str(vector_results))
        )
        
        self.assertTrue(
            hybrid_results is None or 
            (isinstance(hybrid_results, dict) and "error" not in hybrid_results) or
            (not isinstance(hybrid_results, dict) and "error" not in str(hybrid_results))
        )
    
    def test_persistence(self):
        """Test persistence to disk"""
        # Skip if implementation is not available
        if not self.graphrag.graphrag_impl:
            self.skipTest("GraphRAG implementation not available")
            
        # Add test data
        asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_document("doc_persist", "This is a document to test persistence.", {"title": "Persistence Test"})
        )
        
        # Save to disk
        save_path = os.path.join(self.test_dir, "test_save.json")
        save_result = asyncio.get_event_loop().run_until_complete(
            self.graphrag.save_to_disk(save_path)
        )
        
        # Check if file was created
        self.assertTrue(os.path.exists(save_path))
        
        # Load from disk
        load_result = asyncio.get_event_loop().run_until_complete(
            self.graphrag.load_from_disk(save_path)
        )
        
        # Check if operations were successful
        self.assertTrue(
            save_result is None or 
            (isinstance(save_result, dict) and "error" not in save_result) or
            (not isinstance(save_result, dict) and "error" not in str(save_result))
        )
        
        self.assertTrue(
            load_result is None or 
            (isinstance(load_result, dict) and "error" not in load_result) or
            (not isinstance(load_result, dict) and "error" not in str(load_result))
        )
    
    def test_stats(self):
        """Test getting statistics"""
        # Skip if implementation is not available
        if not self.graphrag.graphrag_impl:
            self.skipTest("GraphRAG implementation not available")
            
        # Add test data
        asyncio.get_event_loop().run_until_complete(
            self.graphrag.add_document("doc_stats", "This is a document to test statistics.", {"title": "Stats Test"})
        )
        
        # Get stats
        stats = asyncio.get_event_loop().run_until_complete(
            self.graphrag.get_stats()
        )
        
        # Check if stats were retrieved successfully
        self.assertTrue(
            stats is None or 
            (isinstance(stats, dict) and "error" not in stats) or
            (not isinstance(stats, dict) and "error" not in str(stats))
        )
    
    def test_module_test_method(self):
        """Test the module's own test method"""
        test_results = self.graphrag.test()
        
        # Check if test method returns results
        self.assertIsNotNone(test_results)
        self.assertIsInstance(test_results, dict)
        self.assertIn('module', test_results)
        self.assertEqual(test_results['module'], 'graphrag_integration')

def run_tests():
    """Run the tests and return results as JSON"""
    try:
        # Create test suite
        suite = unittest.TestLoader().loadTestsFromTestCase(TestGraphRAG)
        
        # Run tests with custom result collector
        from io import StringIO
        test_output = StringIO()
        
        runner = unittest.TextTestRunner(stream=test_output)
        result = runner.run(suite)
        
        # Prepare result data
        test_data = {
            "success": result.wasSuccessful(),
            "module": "graphrag",
            "total": result.testsRun,
            "errors": len(result.errors),
            "failures": len(result.failures),
            "skipped": len(result.skipped),
            "details": test_output.getvalue()
        }
        
        # Get GraphRAG capabilities
        graphrag = GraphRAG()
        capabilities = {
            "graphrag_available": hasattr(graphrag, 'graphrag_impl') and graphrag.graphrag_impl is not None,
            "ipfs_datasets_py_available": 'ipfs_datasets_py' in sys.modules,
            "faiss_available": hasattr(graphrag, 'faiss') and graphrag.faiss is not None,
            "ipfs_available": hasattr(graphrag, 'ipfs_kit') and graphrag.ipfs_kit is not None
        }
        
        test_data["capabilities"] = capabilities
        
        return test_data
    except Exception as e:
        return {
            "success": False,
            "module": "graphrag",
            "error": str(e)
        }

if __name__ == "__main__":
    # Run tests and print results as JSON
    results = run_tests()
    print(json.dumps(results, indent=2))