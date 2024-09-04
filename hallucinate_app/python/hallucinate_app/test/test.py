import os
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
        self.ipfs = ipfs_kit_py.ipfs_kit(self.resources, self.metadata)
        self.orbitdb = orbitdb_kit_py.orbitdb_kit(self.resources, self.metadata)
        self.faiss = ipfs_faiss_py.ipfs_faiss_dataset(self.resources, self.metadata)
        self.model_manager = ipfs_model_manager_py.ipfs_model_manager(self.resources, self.metadata)
        self.datasets = ipfs_datasets_py.ipfs_datasets(self.resources, self.metadata)
        self.transformers = ipfs_transformers_py.ipfs_transformers(self.resources, self.metadata)
        self.accelerate = ipfs_accelerate_py.ipfs_accelerate(self.resources, self.metadata)
        self.libp2p = libp2p_kit_py.libp2p_kit(self.resources, self.metadata)
        self.agents = ipfs_agents_py.ipfs_agent(self.resources, self.metadata)

    def test(self):

        return True
	
if __name__ == '__main__':
    try:
        worker = testLibp2pWorker()
        worker.test()
        # worker.run(skillset=os.path.join(os.path.dirname(__file__), 'skillset'))
    except Exception as e:
        print(e)
    pass