import os
import sys
import json
import unittest
import importlib.util
from pathlib import Path

# Try to import required modules
# Use a try-except block for each import to handle missing dependencies gracefully
try:
    import ipfs_kit_py
except ImportError:
    ipfs_kit_py = None

try:
    import libp2p_kit_py
except ImportError:
    libp2p_kit_py = None

try:
    import orbitdb_kit_py
except ImportError:
    orbitdb_kit_py = None

try:
    import ipfs_faiss_py
except ImportError:
    ipfs_faiss_py = None

try:
    import ipfs_model_manager_py
except ImportError:
    ipfs_model_manager_py = None

try:
    import ipfs_datasets_py
except ImportError:
    ipfs_datasets_py = None

try:
    import ipfs_transformers_py
except ImportError:
    ipfs_transformers_py = None

try:
    import ipfs_agents_py
except ImportError:
    ipfs_agents_py = None

try:
    import ipfs_accelerate_py
except ImportError:
    ipfs_accelerate_py = None


class TestLibp2pWorker:
    def __init__(self):
        self.resources = {}
        self.metadata = {}

    def test(self):
        test_results = {}

        # Test IPFS Kit
        if ipfs_kit_py:
            try:
                self.ipfs = ipfs_kit_py.ipfs_kit(self.resources, self.metadata)
                test_results['ipfs'] = self.ipfs.test()
            except Exception as e:
                test_results['ipfs'] = str(e)
        else:
            test_results['ipfs'] = "Module not available"

        # Test libp2p Kit
        if libp2p_kit_py:
            try:
                self.libp2p = libp2p_kit_py.libp2p_kit(self.resources, self.metadata)
                test_results['libp2p'] = self.libp2p.test()
            except Exception as e:
                test_results['libp2p'] = str(e)
        else:
            test_results['libp2p'] = "Module not available"

        # Test Model Manager
        if ipfs_model_manager_py:
            try:
                self.model_manager = ipfs_model_manager_py.ipfs_model_manager(self.resources, self.metadata)
                test_results['model_manager'] = self.model_manager.test()
            except Exception as e:
                test_results['model_manager'] = str(e)
        else:
            test_results['model_manager'] = "Module not available"
        
        # Test Datasets
        if ipfs_datasets_py:
            try:
                self.datasets = ipfs_datasets_py.ipfs_datasets(self.resources, self.metadata)
                test_results['datasets'] = self.datasets.test()
            except Exception as e:
                test_results['datasets'] = str(e)
        else:
            test_results['datasets'] = "Module not available"
            
        # Test OrbitDB
        if orbitdb_kit_py:
            try:
                self.orbitdb = orbitdb_kit_py.orbitdb_kit(self.resources, self.metadata)
                test_results['orbitdb'] = self.orbitdb.test()
            except Exception as e:
                test_results['orbitdb'] = str(e)
        else:
            test_results['orbitdb'] = "Module not available"
        
        # Test FAISS
        if ipfs_faiss_py:
            try:
                self.faiss = ipfs_faiss_py.ipfs_faiss_dataset(self.resources, self.metadata)
                test_results['faiss'] = self.faiss.test()
            except Exception as e:
                test_results['faiss'] = str(e)
        else:
            test_results['faiss'] = "Module not available"
        
        # Test Transformers
        if ipfs_transformers_py:
            try:
                self.transformers = ipfs_transformers_py.ipfs_transformers(self.resources, self.metadata)
                test_results['transformers'] = self.transformers.test()
            except Exception as e:
                test_results['transformers'] = str(e)
        else:
            test_results['transformers'] = "Module not available"

        # Test Accelerate
        if ipfs_accelerate_py:
            try:
                self.accelerate = ipfs_accelerate_py.ipfs_accelerate(self.resources, self.metadata)
                test_results['accelerate'] = self.accelerate.test()
            except Exception as e:
                test_results['accelerate'] = str(e)
        else:
            test_results['accelerate'] = "Module not available"

        # Test Agents
        if ipfs_agents_py:
            try:
                self.agents = ipfs_agents_py.ipfs_agent(self.resources, self.metadata)
                test_results['agents'] = self.agents.test()
            except Exception as e:
                test_results['agents'] = str(e)
        else:
            test_results['agents'] = "Module not available"

        return test_results


def run_server_tests():
    """Run the IPFS Accelerate Server tests"""
    # Import and run server tests
    try:
        # Dynamically import the test module
        current_dir = Path(__file__).parent
        test_file = current_dir / "test_ipfs_accelerate_server.py"
        
        if test_file.exists():
            spec = importlib.util.spec_from_file_location("test_ipfs_accelerate_server", test_file)
            server_test_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(server_test_module)
            
            # Run the tests
            test_loader = unittest.TestLoader()
            test_suite = test_loader.loadTestsFromModule(server_test_module)
            test_runner = unittest.TextTestRunner(verbosity=2)
            test_result = test_runner.run(test_suite)
            
            return {
                "total": test_result.testsRun,
                "failures": len(test_result.failures),
                "errors": len(test_result.errors),
                "success": test_result.wasSuccessful()
            }
        else:
            return {"error": f"Test file not found: {test_file}"}
    except Exception as e:
        return {"error": str(e)}
    
    
if __name__ == '__main__':
    test_results = {}
    
    try:
        # Run module tests
        worker = TestLibp2pWorker()
        module_test_results = worker.test()
        test_results["modules"] = module_test_results
        
        # Run server tests
        server_test_results = run_server_tests()
        test_results["server"] = server_test_results
        
        # Print and save results
        print("Test Results:")
        print(json.dumps(test_results, indent=2))
        
        results_path = Path(__file__).parent / "test_results.json"
        with open(results_path, 'w') as f:
            json.dump(test_results, f, indent=2)
            
    except Exception as e:
        print(f"Error running tests: {e}")
        test_results["error"] = str(e)
        
        # Still try to save partial results if error occurs
        try:
            results_path = Path(__file__).parent / "test_results.json"
            with open(results_path, 'w') as f:
                json.dump(test_results, f, indent=2)
        except:
            pass