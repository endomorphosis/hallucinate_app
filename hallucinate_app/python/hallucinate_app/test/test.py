import os
import sys
import json
import unittest
import importlib.util
from pathlib import Path

# Add parent directory to path to import local modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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

# Try to import our local modules
try:
    from auth import auth_manager, AuthManager
except ImportError:
    auth_manager = None

try:
    from keystore import keystore, Keystore
except ImportError:
    keystore = None

try:
    from auth_keystore_integration import auth_keystore_integration, AuthKeystoreIntegration
except ImportError:
    auth_keystore_integration = None

try:
    from secure_model_manager import secure_model_manager, SecureModelManager
except ImportError:
    secure_model_manager = None

try:
    from secure_datasets_manager import secure_dataset_manager, SecureDatasetManager
except ImportError:
    secure_dataset_manager = None

try:
    from secure_transformers_manager import secure_transformers_manager, SecureTransformersManager
except ImportError:
    secure_transformers_manager = None

try:
    from secure_faiss_manager import secure_faiss_manager, SecureFaissManager
except ImportError:
    secure_faiss_manager = None

try:
    from secure_orbitdb_manager import secure_orbitdb_manager, SecureOrbitDBManager
except ImportError:
    secure_orbitdb_manager = None


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
            
        # Test Auth Manager
        if auth_manager:
            try:
                test_results['auth'] = auth_manager.test()
            except Exception as e:
                test_results['auth'] = str(e)
        else:
            test_results['auth'] = "Module not available"
            
        # Test Keystore
        if keystore:
            try:
                test_results['keystore'] = keystore.test()
            except Exception as e:
                test_results['keystore'] = str(e)
        else:
            test_results['keystore'] = "Module not available"
            
        # Test Auth-Keystore Integration
        if auth_keystore_integration:
            try:
                test_results['auth_keystore_integration'] = auth_keystore_integration.test()
            except Exception as e:
                test_results['auth_keystore_integration'] = str(e)
        else:
            test_results['auth_keystore_integration'] = "Module not available"
            
        # Test Secure Model Manager
        if secure_model_manager:
            try:
                test_results['secure_model_manager'] = secure_model_manager.test()
            except Exception as e:
                test_results['secure_model_manager'] = str(e)
        else:
            test_results['secure_model_manager'] = "Module not available"
            
        # Test Secure Dataset Manager
        if secure_dataset_manager:
            try:
                test_results['secure_dataset_manager'] = secure_dataset_manager.test()
            except Exception as e:
                test_results['secure_dataset_manager'] = str(e)
        else:
            test_results['secure_dataset_manager'] = "Module not available"
            
        # Test Secure Transformers Manager
        if secure_transformers_manager:
            try:
                test_results['secure_transformers_manager'] = secure_transformers_manager.test()
            except Exception as e:
                test_results['secure_transformers_manager'] = str(e)
        else:
            test_results['secure_transformers_manager'] = "Module not available"
            
        # Test Secure FAISS Manager
        if secure_faiss_manager:
            try:
                test_results['secure_faiss_manager'] = secure_faiss_manager.test()
            except Exception as e:
                test_results['secure_faiss_manager'] = str(e)
        else:
            test_results['secure_faiss_manager'] = "Module not available"
            
        # Test Secure OrbitDB Manager
        if secure_orbitdb_manager:
            try:
                test_results['secure_orbitdb_manager'] = secure_orbitdb_manager.test()
            except Exception as e:
                test_results['secure_orbitdb_manager'] = str(e)
        else:
            test_results['secure_orbitdb_manager'] = "Module not available"

        return test_results


def run_server_tests():
    """Run the server tests and module-specific test files"""
    test_results = {}
    
    # Function to run tests from a specific test file
    def run_test_file(file_name, test_key):
        try:
            # Dynamically import the test module
            current_dir = Path(__file__).parent
            test_file = current_dir / file_name
            
            if test_file.exists():
                spec = importlib.util.spec_from_file_location(test_key, test_file)
                test_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(test_module)
                
                # Run the tests
                test_loader = unittest.TestLoader()
                test_suite = test_loader.loadTestsFromModule(test_module)
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
    
    # Run IPFS Accelerate Server tests
    test_results["ipfs_accelerate_server"] = run_test_file("test_ipfs_accelerate_server.py", "test_ipfs_accelerate_server")
    
    # Run Auth tests
    test_results["auth"] = run_test_file("test_auth.py", "test_auth")
    
    # Run Auth-Keystore Integration tests
    test_results["auth_keystore_integration"] = run_test_file("test_auth_keystore_integration.py", "test_auth_keystore_integration")
    
    # Run Secure Model Manager tests
    test_results["secure_model_manager"] = run_test_file("test_secure_model_manager.py", "test_secure_model_manager")
    
    # Run Secure Dataset Manager tests
    test_results["secure_dataset_manager"] = run_test_file("test_secure_datasets_manager.py", "test_secure_datasets_manager")
    
    # Run Secure Transformers Manager tests
    test_results["secure_transformers_manager"] = run_test_file("test_secure_transformers_manager.py", "test_secure_transformers_manager")
    
    # Run Secure FAISS Manager tests
    test_results["secure_faiss_manager"] = run_test_file("test_secure_faiss_manager.py", "test_secure_faiss_manager")
    
    # Run Secure OrbitDB Manager tests
    test_results["secure_orbitdb_manager"] = run_test_file("test_secure_orbitdb_manager.py", "test_secure_orbitdb_manager")
    
    # Run IPFS Kit Integration tests
    try:
        # Try to import the IPFS Kit test module
        from test_ipfs_kit_integration import test as test_ipfs_kit_integration
        # Run tests and parse results
        ipfs_kit_results_json = test_ipfs_kit_integration()
        ipfs_kit_results = json.loads(ipfs_kit_results_json)
        test_results["ipfs_kit_integration"] = ipfs_kit_results
    except Exception as e:
        test_results["ipfs_kit_integration"] = {"error": str(e)}
    
    return test_results
    
    
if __name__ == '__main__':
    test_results = {}
    
    try:
        # Run module tests
        worker = TestLibp2pWorker()
        module_test_results = worker.test()
        test_results["modules"] = module_test_results
        
        # Run server and other test files
        other_test_results = run_server_tests()
        test_results["tests"] = other_test_results
        
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