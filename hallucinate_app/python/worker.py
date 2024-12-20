import os
# from cloudkit_worker import run
# import config from .config
import ipfs_accelerate_py
import ipfs_kit_py
import libp2p_kit_py
import ipfs_faiss_py 
import ipfs_model_manager_py
import ipfs_datasets_py 
import ipfs_transformers_py 
import ipfs_embeddings_py
import ipfs_accelerate_py 

class libp2pWorker:
    def __init__(self):
        resources = {}
        metadata = {}
        self.resources = resources
        self.metadata = metadata
        self.metadata["role"] == "master"
        self.imports = ['ipfs_kit', 'libp2p_kit', 'orbitdb_kit', 'ipfs_faiss', 'ipfs_model_manager', 'ipfs_datasets', 'ipfs_transformers', 'ipfs_agents', 'ipfs_accelerate', 'ipfs_embeddings']
        if "ipfs_kit_py" in globals():
            self.ipfs_kit = ipfs_kit_py.ipfs_kit(self.resources, self.metadata)
            self.resources["ipfs_kit"] = self.ipfs_kit
        if "libp2p_kit_py" in globals():
            self.libp2p_kit = libp2p_kit_py.libp2p_kit(self.resources, self.metadata)
            self.resources["libp2p_kit"] = self.libp2p_kit
        if "ipfs_transformers_py" in globals():
            self.ipfs_transformers = ipfs_transformers_py.ipfs_transformers(self.resources, self.metadata)
            self.resources["ipfs_transformers"] = self.ipfs_transformers
        if "ipfs_datasets_py" in globals():
            self.ipfs_datasets = ipfs_datasets_py.ipfs_datasets(self.resources, self.metadata)
            self.resources["ipfs_datasets"] = self.ipfs_datasets
        if "ipfs_model_manager_py" in globals():
            self.ipfs_model_manager = ipfs_model_manager_py.ipfs_model_manager(self.resources, self.metadata)
            self.resources["ipfs_model_manager"] = self.ipfs_model_manager
        if "ipfs_accelerate_py" in globals():
            self.ipfs_accelerate = ipfs_accelerate_py.ipfs_accelerate(self.resources, self.metadata)
            self.resources["ipfs_accelerate"] = self.ipfs_accelerate
        if "ipfs_faiss_py" in globals():
            self.ipfs_faiss = ipfs_faiss_py.ipfs_faiss_py(self.resources, self.metadata)
            self.resources["ipfs_faiss"] = self.ipfs_faiss
        if "ipfs_embeddings_py" in globals():
            self.ipfs_embeddings = ipfs_embeddings_py.ipfs_embeddings(self.resources, self.metadata)
            self.resources["ipfs_embeddings"] = self.ipfs_embeddings
        # if "ipfs_agents_py" in globals():
        #     self.ipfs_agents = ipfs_agents_py.ipfs_agents(self.resources, self.metadata)
        #     self.resources["ipfs_agents"] = self.ipfs_agents
        return None

    def init(self, imports):
        #   if not isinstance(imports, object):
        #     raise ValueError('imports must be a object')
        #   for imp in imports:
        #     self[imp] = __import__(imp)
        #     self[imp].init()
        return True

    def test(self, imports):
        # if not isinstance(imports, object):
        #     raise ValueError('imports must be a object')
        # for imp in imports:
        #     self[imp] = __import__(imp)
        #     self[imp].test()
        return True
    
    def run(self):
        # imports = ['ipfs_kit', 'libp2p_kit', 'orbitdb_kit', 'ipfs_faiss', 'ipfs_model_manager', 'ipfs_datasets', 'ipfs_transformers', 'ipfs_agents', 'ipfs_accelerate']
        # self.init(imports)
        # self.ipfs_kit.run()
        # self.libp2p_kit.run()
        # self.orbitdb_kit.run()
        # self.ipfs_faiss.run()
        # self.ipfs_model_manager.run()
        # self.ipfs_datasets.run()
        # self.ipfs_transformers.run()
        # self.ipfs_agents.run()
        # self.ipfs_accelerate.run()

        return True
	
if __name__ == '__main__':
    try:
        worker = libp2pWorker()
        worker.init(worker.imports)
        worker.test(worker.imports)
        worker.run()
        # worker.run(skillset=os.path.join(os.path.dirname(__file__), 'skillset'))
    except Exception as e:
        print(e)
    pass