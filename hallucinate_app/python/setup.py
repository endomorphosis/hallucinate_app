from setuptools import setup

setup(
	name='hallucinate_app',
	version='0.0.1',
	packages=[
        'hallucinate_app',
	],
	install_requires=[
                "libp2p_kit_py",
                "ipfs_kit_py",
                "orbitdb_kit_py",
                "ipfs_faiss_py",
                "ipfs_model_manager_py",
                "ipfs_transformers_py",
                "ipfs_datasets_py",
                "ipfs_agents_py",
                "ipfs_accelerate_py",
                'transformers',
                'torch',
                'torchvision',
                'numpy',
                'torchtext',
                'urllib3',
                'requests',
                'boto3',
	]
)
