import os
import json
# from cloudkit_worker import run
# import config from .config
import ipfs_accelerate_py
import ipfs_agents_py
import ipfs_kit_py
import libp2p_kit_py
import orbitdb_kit_py
import ipfs_faiss_py 
import ipfs_model_manager_py
import ipfs_datasets_py 
import ipfs_transformers_py 
import ipfs_agents_py 
import ipfs_accelerate_py 

class testLibp2pWorker:
    def __init__(self):
        resources = {}
        metadata = {}
        self.resources = resources
        self.metadata = metadata

    def test(self):
        test_results = {}

        try:
            self.libp2p = libp2p_kit_py.libp2p_kit(self.resources, self.metadata)
            test_results['libp2p'] = self.libp2p.test()
        except Exception as e:
            test_results['libp2p'] = e

        try:
            self.ipfs = ipfs_kit_py.ipfs_kit(self.resources, self.metadata)
            test_results['ipfs'] = self.test()
        except Exception as e:
            test_results['ipfs'] = e

        try:
            self.model_manager = ipfs_model_manager_py.ipfs_model_manager(self.resources, self.metadata)
            test_results['model_manager'] = self.model_manager.test()
        except Exception as e:
            test_results['model_manager'] = e
        
        try:
            self.datasets = ipfs_datasets_py.ipfs_datasets(self.resources, self.metadata)
            test_results['datasets'] = self.datasets.test()
        except Exception as e:
            test_results['datasets'] = e
            
        try:
            self.orbitdb = orbitdb_kit_py.orbitdb_kit(self.resources, self.metadata)
            test_results['orbitdb'] = self.orbitdb.test()
        except Exception as e:
            test_results['orbitdb'] = e
        
        try:
            self.faiss = ipfs_faiss_py.ipfs_faiss_dataset(self.resources, self.metadata)
            test_results['faiss'] = self.faiss.test()
        except Exception as e:
            test_results['faiss'] = e
        
        try:
            self.transformers = ipfs_transformers_py.ipfs_transformers(self.resources, self.metadata)
            test_results['transformers'] = self.transformers.test()
        except Exception as e:
            test_results['transformers'] = e

        try:
            self.accelerate = ipfs_accelerate_py.ipfs_accelerate(self.resources, self.metadata)
            test_results['accelerate'] = self.accelerate.test()
        except Exception as e:
            test_results['accelerate'] = e

        try:
            self.agents = ipfs_agents_py.ipfs_agent(self.resources, self.metadata)
            test_results['agents'] = self.agents.test()
        except Exception as e:
            test_results['agents'] = e

        return test_results
    
if __name__ == '__main__':
    try:
        worker = testLibp2pWorker()
        test_results = worker.test()
        print("Test Results:")
        print(test_results)
        test_results_json = json.dumps(test_results)
        with open('test_results.json', 'w') as f:
            f.write(test_results_json)
        # worker.run(skillset=os.path.join(os.path.dirname(__file__), 'skillset'))
    except Exception as e:
        print(e)
    pass