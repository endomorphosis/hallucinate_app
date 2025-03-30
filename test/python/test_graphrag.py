"""
Tests for GraphRAG integration layer

This module tests the GraphRAG integration layer that connects to
the GraphRAG functionality provided by the ipfs_datasets_py package.
"""

import unittest
import json
import os
import sys
import asyncio
from pathlib import Path
import time

# Add project root to Python path to ensure imports work
project_root = Path(__file__).parents[2]
sys.path.append(str(project_root))
sys.path.append(str(project_root / 'hallucinate_app' / 'python'))

# Import the GraphRAG module
try:
    from hallucinate_app.python.hallucinate_app.graphrag import GraphRAG, graphrag
except ImportError:
    # Try alternative import path
    try:
        from hallucinate_app.hallucinate_app.graphrag import GraphRAG, graphrag
    except ImportError:
        print("Failed to import GraphRAG module. Make sure the module exists and paths are correct.")
        sys.exit(1)

# Import IPFS Kit for testing if available
try:
    from hallucinate_app.python.hallucinate_app.ipfs_kit import IPFSKit
    has_ipfs_kit = True
except ImportError:
    try:
        from hallucinate_app.hallucinate_app.ipfs_kit import IPFSKit
        has_ipfs_kit = True
    except ImportError:
        has_ipfs_kit = False
        print("IPFSKit not available, some tests will be skipped.")

# Import IPFS FAISS for testing if available
try:
    from hallucinate_app.python.hallucinate_app.ipfs_faiss import IPFSFaiss
    has_ipfs_faiss = True
except ImportError:
    try:
        from hallucinate_app.hallucinate_app.ipfs_faiss import IPFSFaiss
        has_ipfs_faiss = True
    except ImportError:
        has_ipfs_faiss = False
        print("IPFSFaiss not available, some tests will be skipped.")

# Check if ipfs_datasets_py and GraphRAG are available
try:
    import ipfs_datasets_py
    has_ipfs_datasets_py = True
    has_graphrag = hasattr(ipfs_datasets_py, 'GraphRAG')
except ImportError:
    has_ipfs_datasets_py = False
    has_graphrag = False
    print("ipfs_datasets_py not available, some tests will be skipped.")


class TestGraphRAGIntegration(unittest.TestCase):
    """Test the GraphRAG integration layer"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        # Create a temporary directory for testing
        cls.test_dir = f"/tmp/graphrag_test_{int(time.time())}"
        os.makedirs(cls.test_dir, exist_ok=True)
        
        # Initialize resources for GraphRAG
        cls.resources = {}
        
        # Initialize IPFS Kit if available
        if has_ipfs_kit:
            cls.resources['ipfsKit'] = IPFSKit(None, {
                'offline': True,  # Run IPFS in offline mode for testing
                'profile': 'test'
            })
        
        # Initialize IPFS FAISS if available
        if has_ipfs_faiss:
            cls.resources['ipfsFaiss'] = IPFSFaiss(None, {
                'test_mode': True
            })
        
        # Initialize metadata
        cls.metadata = {
            'storage_dir': cls.test_dir,
            'test_mode': True
        }
        
        # Initialize GraphRAG
        cls.graphrag = GraphRAG(cls.resources, cls.metadata)
        
        # Initialize event loop for async tests
        cls.loop = asyncio.get_event_loop()
        if cls.loop.is_closed():
            cls.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(cls.loop)
        
        # Initialize component
        cls.loop.run_until_complete(cls.graphrag.init())
    
    @classmethod
    def tearDownClass(cls):
        """Clean up after tests"""
        # Remove test directory
        import shutil
        try:
            shutil.rmtree(cls.test_dir)
        except:
            pass
    
    def test_01_initialization(self):
        """Test that GraphRAG initializes correctly"""
        self.assertTrue(self.graphrag.initialized, "GraphRAG should be initialized")
        
        # Check configuration
        self.assertEqual(self.graphrag.storage_dir, self.test_dir, 
                         "Storage directory should match test directory")
        
        # Check capabilities
        if has_graphrag:
            self.assertIsNotNone(self.graphrag.graphrag_impl, 
                                "GraphRAG implementation should be available")
    
    def test_02_resource_access(self):
        """Test that GraphRAG has access to required resources"""
        # Check IPFS Kit
        if has_ipfs_kit:
            self.assertIsNotNone(self.graphrag.ipfs_kit, "IPFS Kit should be available")
        
        # Check FAISS
        if has_ipfs_faiss:
            self.assertIsNotNone(self.graphrag.faiss, "FAISS should be available")
    
    def test_03_test_method(self):
        """Test the test method of GraphRAG"""
        # Run the test method
        test_results = self.graphrag.test()
        
        # Check results
        self.assertIsInstance(test_results, dict, "Test results should be a dictionary")
        self.assertIn('success', test_results, "Test results should contain success key")
        self.assertIn('module', test_results, "Test results should contain module key")
        self.assertEqual(test_results['module'], 'graphrag_integration', 
                         "Module name should be graphrag_integration")
        
        # Print capabilities for debugging
        print(f"GraphRAG capabilities: {test_results.get('capabilities', {})}")
        
        # If implementation is available, check implementation test
        if has_graphrag and self.graphrag.graphrag_impl:
            self.assertIn('implementation_found', test_results,
                          "Test results should indicate if implementation is found")
            self.assertTrue(test_results['implementation_found'],
                           "Implementation should be found")
    
    @unittest.skipIf(not has_graphrag, "GraphRAG implementation not available")
    def test_04_document_operations(self):
        """Test document operations if implementation available"""
        # Add a test document
        doc_id = f"test_doc_{int(time.time())}"
        doc_text = "This is a test document for GraphRAG integration testing."
        doc_metadata = {"test": True, "source": "integration_test"}
        
        add_result = self.loop.run_until_complete(
            self.graphrag.add_document(doc_id, doc_text, doc_metadata)
        )
        
        # Check if operation succeeded (may return None or a success result)
        self.assertFalse(isinstance(add_result, dict) and 'error' in add_result,
                        f"Document add should not return error: {add_result}")
    
    @unittest.skipIf(not has_graphrag, "GraphRAG implementation not available")
    def test_05_node_operations(self):
        """Test node operations if implementation available"""
        # Add a test node
        node_id = f"test_node_{int(time.time())}"
        node_data = "This is a test node for GraphRAG integration testing."
        node_metadata = {"test": True, "source": "integration_test"}
        
        add_result = self.loop.run_until_complete(
            self.graphrag.add_node(node_id, node_data, node_metadata)
        )
        
        # Check if operation succeeded (may return None or a success result)
        self.assertFalse(isinstance(add_result, dict) and 'error' in add_result,
                        f"Node add should not return error: {add_result}")
    
    @unittest.skipIf(not has_graphrag, "GraphRAG implementation not available")
    def test_06_edge_operations(self):
        """Test edge operations if implementation available"""
        # Add two test nodes
        node1_id = f"test_edge_node_1_{int(time.time())}"
        node2_id = f"test_edge_node_2_{int(time.time())}"
        
        # Add nodes
        self.loop.run_until_complete(
            self.graphrag.add_node(node1_id, "Source node for edge test")
        )
        self.loop.run_until_complete(
            self.graphrag.add_node(node2_id, "Target node for edge test")
        )
        
        # Add an edge
        edge_result = self.loop.run_until_complete(
            self.graphrag.add_edge(node1_id, node2_id, 0.75)
        )
        
        # Check if operation succeeded (may return None, False, True or a result dict)
        self.assertFalse(isinstance(edge_result, dict) and 'error' in edge_result,
                        f"Edge add should not return error: {edge_result}")
    
    @unittest.skipIf(not has_graphrag or not has_ipfs_faiss, 
                   "GraphRAG implementation or FAISS not available")
    def test_07_search_operations(self):
        """Test search operations if implementation and FAISS available"""
        # Add a test document with searchable content
        doc_id = f"test_search_doc_{int(time.time())}"
        doc_text = "This document contains specific keywords for testing search functionality"
        
        self.loop.run_until_complete(
            self.graphrag.add_document(doc_id, doc_text)
        )
        
        # Perform vector search
        query = "search keywords"
        search_result = self.loop.run_until_complete(
            self.graphrag.vector_search(query, 1)
        )
        
        # Check if operation returned results
        self.assertFalse(isinstance(search_result, dict) and 'error' in search_result,
                        f"Vector search should not return error: {search_result}")
    
    @unittest.skipIf(not has_graphrag, "GraphRAG implementation not available")
    def test_08_persistence(self):
        """Test persistence operations if implementation available"""
        # Save to disk
        save_path = os.path.join(self.test_dir, "graphrag_test_save.json")
        save_result = self.loop.run_until_complete(
            self.graphrag.save_to_disk(save_path)
        )
        
        # Check if operation succeeded
        self.assertFalse(isinstance(save_result, dict) and 'error' in save_result,
                        f"Save to disk should not return error: {save_result}")
        
        # Check if file exists
        self.assertTrue(os.path.exists(save_path), "Saved file should exist")
        
        # Create a new instance
        new_graphrag = GraphRAG(self.resources, self.metadata)
        self.loop.run_until_complete(new_graphrag.init())
        
        # Load the saved file
        load_result = self.loop.run_until_complete(
            new_graphrag.load_from_disk(save_path)
        )
        
        # Check if operation succeeded
        self.assertFalse(isinstance(load_result, dict) and 'error' in load_result,
                        f"Load from disk should not return error: {load_result}")
    
    @unittest.skipIf(not has_graphrag or not has_ipfs_kit, 
                   "GraphRAG implementation or IPFS Kit not available")
    def test_09_ipfs_integration(self):
        """Test IPFS integration if implementation and IPFS Kit available"""
        # Save to IPFS
        save_result = self.loop.run_until_complete(
            self.graphrag.save_to_ipfs()
        )
        
        # Check if operation returned a CID
        self.assertFalse(isinstance(save_result, dict) and 'error' in save_result,
                        f"Save to IPFS should not return error: {save_result}")
        
        # If we have a valid CID, try loading from it
        if save_result and not isinstance(save_result, dict):
            cid = save_result
            
            # Create a new instance
            new_graphrag = GraphRAG(self.resources, self.metadata)
            self.loop.run_until_complete(new_graphrag.init())
            
            # Load from IPFS
            load_result = self.loop.run_until_complete(
                new_graphrag.load_from_ipfs(cid)
            )
            
            # Check if operation succeeded
            self.assertFalse(isinstance(load_result, dict) and 'error' in load_result,
                            f"Load from IPFS should not return error: {load_result}")


if __name__ == "__main__":
    # Run unit tests and output results in JSON format
    test_loader = unittest.TestLoader()
    test_suite = test_loader.loadTestsFromTestCase(TestGraphRAGIntegration)
    test_runner = unittest.TextTestRunner(verbosity=2)
    test_result = test_runner.run(test_suite)
    
    # Output results in JSON format
    results = {
        "total": test_result.testsRun,
        "failures": len(test_result.failures),
        "errors": len(test_result.errors),
        "skipped": len(test_result.skipped),
        "success": test_result.wasSuccessful()
    }
    
    print(f"\nTest Summary: {json.dumps(results)}")