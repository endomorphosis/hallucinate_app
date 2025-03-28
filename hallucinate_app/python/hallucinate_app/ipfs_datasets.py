import os
import json
import logging
import sys
import tempfile
import shutil
import asyncio
import time
from pathlib import Path
from typing import Dict, List, Optional, Union, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_datasets")

# Try to import IPFS Kit and Model Manager
try:
    from .ipfs_kit import IPFSKit, ipfs_kit
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import IPFSKit, some functionality will be limited")
    has_ipfs_kit = False

# Try to import ipfs_datasets_py
try:
    import ipfs_datasets_py
    has_ipfs_datasets_py = True
except ImportError:
    logger.warning("Could not import ipfs_datasets_py, falling back to mock implementation")
    has_ipfs_datasets_py = False

# Try to import datasets
try:
    import datasets
    from datasets import load_dataset, Dataset, DatasetDict, load_from_disk
    has_huggingface_datasets = True
except ImportError:
    logger.warning("Could not import huggingface datasets, functionality will be limited")
    has_huggingface_datasets = False

class IPFSDatasets:
    """
    IPFS Datasets for managing datasets via IPFS
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize IPFS Datasets
        
        Args:
            resources (dict): Resources required
            metadata (dict): Metadata for dataset operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Get dataset path from metadata or default
        self.datasets_path = self.metadata.get('datasetsPath', os.path.expanduser("~/.cache/huggingface/datasets"))
        if not os.path.exists(self.datasets_path):
            os.makedirs(self.datasets_path, exist_ok=True)
            
        # Get role from metadata or default to leecher
        self.role = self.metadata.get('role', 'leecher')
        if self.role not in ['master', 'worker', 'leecher']:
            logger.warning(f"Invalid role '{self.role}', defaulting to 'leecher'")
            self.role = 'leecher'
            
        # Default dataset if specified
        self.default_dataset = self.metadata.get('dataset', None)
        
        # Dataset registry to track local datasets
        self.dataset_registry = {}
        self.registry_loaded = False
        
        # IPFS Kit instance for dataset storage
        if has_ipfs_kit:
            if 'ipfsKit' in self.resources:
                self.ipfs_kit = self.resources['ipfsKit']
            else:
                self.ipfs_kit = ipfs_kit
        else:
            self.ipfs_kit = None
            
        # Initialize with ipfs_datasets_py if available
        if has_ipfs_datasets_py:
            self.ipfs_datasets_py = ipfs_datasets_py.IPFSDatasetsPy(
                resources=self.resources,
                metadata=self.metadata
            )
        else:
            self.ipfs_datasets_py = None
            
        self.initialized = False
        logger.info(f"IPFSDatasets initialized with role={self.role}, path={self.datasets_path}")
        
    async def init(self):
        """Initialize datasets manager and load dataset registry"""
        try:
            # Make sure IPFS is available if we need it
            if self.ipfs_kit and self.role != 'leecher':
                await self.ipfs_kit.init()
                
            # Load registry
            await self.load_registry()
            
            # Load default dataset if specified
            if self.default_dataset:
                await self.load_dataset(self.default_dataset)
                
            self.initialized = True
            logger.info("IPFSDatasets initialized successfully")
            return True
        except Exception as e:
            logger.error(f"IPFSDatasets initialization failed: {e}")
            return False
        
    async def load_registry(self):
        """Load dataset registry from local storage"""
        registry_path = os.path.join(self.datasets_path, "dataset_registry.json")
        
        if os.path.exists(registry_path):
            try:
                with open(registry_path, 'r') as f:
                    self.dataset_registry = json.load(f)
                    
                self.registry_loaded = True
                logger.info(f"Loaded {len(self.dataset_registry)} datasets from registry")
                return True
            except Exception as e:
                logger.error(f"Failed to load dataset registry: {e}")
                self.dataset_registry = {}
                return False
        else:
            logger.info("No dataset registry found, creating new one")
            self.dataset_registry = {}
            self.registry_loaded = True
            return True
            
    async def save_registry(self):
        """Save dataset registry to local storage"""
        registry_path = os.path.join(self.datasets_path, "dataset_registry.json")
        
        try:
            # Save to file
            with open(registry_path, 'w') as f:
                json.dump(self.dataset_registry, f, indent=2)
                
            logger.info(f"Saved {len(self.dataset_registry)} datasets to registry")
            return True
        except Exception as e:
            logger.error(f"Failed to save dataset registry: {e}")
            return False
            
    async def list_datasets(self) -> Dict[str, Dict]:
        """List all datasets in the registry"""
        if not self.initialized:
            await self.init()
            
        return self.dataset_registry
        
    async def get_dataset_info(self, dataset_id: str) -> Optional[Dict]:
        """Get information about a specific dataset"""
        if not self.initialized:
            await self.init()
            
        return self.dataset_registry.get(dataset_id)
            
    async def load_dataset(self, dataset_id: str, subset: str = None, split: str = None, revision: str = None) -> Dict:
        """
        Load a dataset from HuggingFace Hub or from local cache
        
        Args:
            dataset_id (str): Dataset identifier (e.g., "imdb")
            subset (str, optional): Configuration or subset of the dataset
            split (str, optional): Which split of the dataset to load (e.g., "train", "test")
            revision (str, optional): Version of the dataset to load
            
        Returns:
            dict: Dataset information including metadata
        """
        if not self.initialized:
            await self.init()
            
        if not has_huggingface_datasets:
            logger.error("Cannot load dataset: huggingface datasets not installed")
            return {"error": "huggingface datasets not installed"}
            
        try:
            # Check if dataset is in registry
            if dataset_id in self.dataset_registry:
                logger.info(f"Dataset {dataset_id} found in registry")
                dataset_info = self.dataset_registry[dataset_id]
                
                # Check if already downloaded
                if "local_path" in dataset_info and os.path.exists(dataset_info["local_path"]):
                    try:
                        # Try loading from disk
                        dataset = load_from_disk(dataset_info["local_path"])
                        logger.info(f"Loaded dataset {dataset_id} from local cache")
                        
                        # Return specific split if requested
                        if split:
                            if isinstance(dataset, DatasetDict) and split in dataset:
                                return {
                                    "dataset_id": dataset_id,
                                    "split": split,
                                    "dataset": dataset[split],
                                    "num_rows": len(dataset[split]),
                                    "info": dataset_info
                                }
                            else:
                                logger.warning(f"Split {split} not found in dataset {dataset_id}")
                        
                        return {
                            "dataset_id": dataset_id,
                            "dataset": dataset,
                            "num_rows": sum(len(ds) for ds in dataset.values()) if isinstance(dataset, DatasetDict) else len(dataset),
                            "info": dataset_info
                        }
                    except Exception as e:
                        logger.warning(f"Failed to load dataset from disk: {e}, downloading again")
            
            # Download dataset from HuggingFace
            logger.info(f"Loading dataset {dataset_id} from HuggingFace Hub")
            
            # Determine dataset path
            dataset_path = os.path.join(self.datasets_path, dataset_id.replace('/', '_'))
            os.makedirs(dataset_path, exist_ok=True)
            
            # Load the dataset
            load_args = {"path": dataset_id}
            if subset:
                load_args["name"] = subset
            if revision:
                load_args["revision"] = revision
                
            dataset = load_dataset(**load_args)
            
            # Filter to specific split if requested
            result_dataset = dataset
            if split and isinstance(dataset, DatasetDict) and split in dataset:
                result_dataset = dataset[split]
                
            # Save dataset to disk for future use
            dataset.save_to_disk(dataset_path)
            
            # Get dataset info
            dataset_info = {
                "dataset_id": dataset_id,
                "subset": subset,
                "revision": revision,
                "local_path": dataset_path,
                "splits": list(dataset.keys()) if isinstance(dataset, DatasetDict) else ["train"],
                "features": {k: str(v) for k, v in (dataset[split] if split and split in dataset else next(iter(dataset.values()))).features.items()},
                "num_rows": sum(len(ds) for ds in dataset.values()) if isinstance(dataset, DatasetDict) else len(dataset),
                "last_updated": time.time()
            }
            
            # Add to registry
            self.dataset_registry[dataset_id] = dataset_info
            await self.save_registry()
            
            # If we have IPFS and we're a master/worker, add to IPFS
            if self.ipfs_kit and self.role in ['master', 'worker']:
                try:
                    logger.info(f"Adding dataset {dataset_id} to IPFS")
                    
                    # Create archive of dataset
                    import tarfile
                    archive_path = os.path.join(tempfile.gettempdir(), f"{dataset_id.replace('/', '_')}.tar.gz")
                    
                    with tarfile.open(archive_path, "w:gz") as tar:
                        tar.add(dataset_path, arcname=os.path.basename(dataset_path))
                    
                    # Add to IPFS
                    with open(archive_path, 'rb') as f:
                        result = await self.ipfs_kit.add_to_ipfs(f.read())
                        
                    if result and 'cid' in result:
                        dataset_info['ipfs_cid'] = result['cid']
                        self.dataset_registry[dataset_id] = dataset_info
                        await self.save_registry()
                        
                    # Clean up
                    os.remove(archive_path)
                except Exception as e:
                    logger.error(f"Failed to add dataset {dataset_id} to IPFS: {e}")
            
            # Return dataset info
            return {
                "dataset_id": dataset_id,
                "dataset": result_dataset if split else dataset,
                "split": split,
                "num_rows": len(result_dataset) if split else dataset_info["num_rows"],
                "info": dataset_info
            }
        except Exception as e:
            logger.error(f"Failed to load dataset {dataset_id}: {e}")
            return {"error": str(e)}
            
    async def import_dataset_from_ipfs(self, dataset_id: str, cid: str) -> Dict:
        """
        Import a dataset from IPFS
        
        Args:
            dataset_id (str): Dataset identifier to use in registry
            cid (str): IPFS CID for the dataset
            
        Returns:
            dict: Dataset information including metadata
        """
        if not self.initialized:
            await self.init()
            
        if not self.ipfs_kit:
            logger.error("Cannot import from IPFS: IPFS Kit not available")
            return {"error": "IPFS Kit not available"}
            
        if not has_huggingface_datasets:
            logger.error("Cannot import dataset: huggingface datasets not installed")
            return {"error": "huggingface datasets not installed"}
            
        try:
            # Create dataset directory
            dataset_path = os.path.join(self.datasets_path, dataset_id.replace('/', '_'))
            os.makedirs(dataset_path, exist_ok=True)
            
            # Create a temporary directory for the download
            with tempfile.TemporaryDirectory() as tmpdir:
                # Download from IPFS
                archive_path = os.path.join(tmpdir, f"{dataset_id.replace('/', '_')}.tar.gz")
                
                logger.info(f"Downloading dataset {dataset_id} from IPFS (CID: {cid})")
                result = await self.ipfs_kit.fetch_from_ipfs(cid, archive_path)
                
                if not result:
                    logger.error(f"Failed to fetch dataset {dataset_id} from IPFS")
                    return {"error": "Failed to fetch from IPFS"}
                    
                # Extract archive
                import tarfile
                with tarfile.open(archive_path, "r:gz") as tar:
                    tar.extractall(path=os.path.dirname(dataset_path))
                    
                # Try to load dataset
                try:
                    dataset = load_from_disk(dataset_path)
                except Exception as e:
                    logger.error(f"Failed to load dataset from extracted files: {e}")
                    return {"error": f"Failed to load dataset: {str(e)}"}
                    
                # Create dataset info
                dataset_info = {
                    "dataset_id": dataset_id,
                    "ipfs_cid": cid,
                    "local_path": dataset_path,
                    "splits": list(dataset.keys()) if isinstance(dataset, DatasetDict) else ["train"],
                    "features": {k: str(v) for k, v in (next(iter(dataset.values())) if isinstance(dataset, DatasetDict) else dataset).features.items()},
                    "num_rows": sum(len(ds) for ds in dataset.values()) if isinstance(dataset, DatasetDict) else len(dataset),
                    "last_updated": time.time(),
                    "source": "ipfs"
                }
                
                # Add to registry
                self.dataset_registry[dataset_id] = dataset_info
                await self.save_registry()
                
                return {
                    "dataset_id": dataset_id,
                    "dataset": dataset,
                    "num_rows": dataset_info["num_rows"],
                    "info": dataset_info
                }
        except Exception as e:
            logger.error(f"Failed to import dataset {dataset_id} from IPFS: {e}")
            return {"error": str(e)}
            
    async def remove_dataset(self, dataset_id: str) -> bool:
        """
        Remove a dataset from the registry and optionally from disk
        
        Args:
            dataset_id (str): Dataset ID to remove
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.initialized:
            await self.init()
            
        if dataset_id not in self.dataset_registry:
            logger.warning(f"Dataset {dataset_id} not found in registry")
            return False
            
        try:
            # Get dataset path
            dataset_info = self.dataset_registry[dataset_id]
            local_path = dataset_info.get("local_path")
            
            # Remove from registry
            del self.dataset_registry[dataset_id]
            
            # Save registry
            await self.save_registry()
            
            # Remove from disk if path exists
            if local_path and os.path.exists(local_path):
                if os.path.isdir(local_path):
                    shutil.rmtree(local_path)
                else:
                    os.remove(local_path)
                    
            return True
        except Exception as e:
            logger.error(f"Failed to remove dataset {dataset_id}: {e}")
            return False
            
    async def get_sample(self, dataset_id: str, split: str = None, num_samples: int = 5) -> List:
        """
        Get sample rows from a dataset
        
        Args:
            dataset_id (str): Dataset identifier
            split (str, optional): Which split to sample from
            num_samples (int): Number of samples to return
            
        Returns:
            list: Sample records from the dataset
        """
        if not self.initialized:
            await self.init()
            
        if not has_huggingface_datasets:
            logger.error("Cannot get sample: huggingface datasets not installed")
            return {"error": "huggingface datasets not installed"}
            
        try:
            # Load dataset
            result = await self.load_dataset(dataset_id, split=split)
            
            if "error" in result:
                return result
                
            dataset = result["dataset"]
            
            # Get the dataset to sample from
            if isinstance(dataset, DatasetDict):
                if split:
                    if split in dataset:
                        target_dataset = dataset[split]
                    else:
                        logger.warning(f"Split {split} not found in dataset {dataset_id}")
                        return {"error": f"Split {split} not found"}
                else:
                    # Use first split if none specified
                    first_key = next(iter(dataset.keys()))
                    target_dataset = dataset[first_key]
                    split = first_key
            else:
                # Dataset is already a single split
                target_dataset = dataset
                split = split or "train"
                
            # Get samples
            if num_samples >= len(target_dataset):
                samples = [target_dataset[i] for i in range(len(target_dataset))]
            else:
                import random
                indices = random.sample(range(len(target_dataset)), num_samples)
                samples = [target_dataset[i] for i in indices]
                
            # Convert to serializable format
            serializable_samples = []
            for sample in samples:
                serializable_sample = {}
                for key, value in sample.items():
                    if hasattr(value, 'numpy'):
                        # Convert numpy arrays to lists
                        serializable_sample[key] = value.numpy().tolist()
                    elif isinstance(value, bytes):
                        # Convert bytes to string
                        serializable_sample[key] = value.decode('utf-8', errors='replace')
                    else:
                        serializable_sample[key] = value
                serializable_samples.append(serializable_sample)
                
            return {
                "dataset_id": dataset_id,
                "split": split,
                "num_samples": len(serializable_samples),
                "samples": serializable_samples
            }
        except Exception as e:
            logger.error(f"Failed to get sample from dataset {dataset_id}: {e}")
            return {"error": str(e)}
            
    def test(self):
        """
        Test IPFS Datasets functionality
        
        Returns:
            dict: Test results
        """
        logger.info("Testing IPFS Datasets")
        
        try:
            # Create asyncio event loop
            loop = asyncio.get_event_loop()
            
            # Test initialization
            if not self.initialized:
                init_result = loop.run_until_complete(self.init())
            else:
                init_result = True
                
            # Test registry
            registry_test = loop.run_until_complete(self.load_registry())
            
            # Test listing datasets
            datasets = loop.run_until_complete(self.list_datasets())
            list_datasets_test = isinstance(datasets, dict)
            
            # Test sample loading
            sample_test = False
            dataset_loading_test = False
            
            if has_huggingface_datasets:
                try:
                    # Use a tiny test dataset
                    test_dataset = "hf-internal-testing/imdb"
                    dataset_result = loop.run_until_complete(
                        self.load_dataset(test_dataset)
                    )
                    dataset_loading_test = "error" not in dataset_result
                    
                    if dataset_loading_test:
                        # Try to get a sample
                        sample_result = loop.run_until_complete(
                            self.get_sample(test_dataset, num_samples=2)
                        )
                        sample_test = "error" not in sample_result
                        
                        # Clean up test dataset
                        loop.run_until_complete(self.remove_dataset(test_dataset))
                except Exception as e:
                    logger.error(f"HuggingFace dataset test failed: {e}")
            
            # Test IPFS if available
            ipfs_test = False
            if self.ipfs_kit:
                try:
                    # Create a test dataset
                    from datasets import Dataset
                    test_data = {"text": ["Test text 1", "Test text 2"], "label": [0, 1]}
                    test_dataset = Dataset.from_dict(test_data)
                    
                    # Save to disk
                    test_dir = os.path.join(tempfile.gettempdir(), "test_dataset")
                    if os.path.exists(test_dir):
                        shutil.rmtree(test_dir)
                    os.makedirs(test_dir)
                    test_dataset.save_to_disk(test_dir)
                    
                    # Create a tar archive
                    import tarfile
                    archive_path = os.path.join(tempfile.gettempdir(), "test_dataset.tar.gz")
                    with tarfile.open(archive_path, "w:gz") as tar:
                        tar.add(test_dir, arcname=os.path.basename(test_dir))
                    
                    # Add to IPFS
                    with open(archive_path, 'rb') as f:
                        content = f.read()
                    
                    ipfs_result = loop.run_until_complete(
                        self.ipfs_kit.add_to_ipfs(content)
                    )
                    
                    if ipfs_result and 'cid' in ipfs_result:
                        # Import from IPFS
                        import_result = loop.run_until_complete(
                            self.import_dataset_from_ipfs("test_ipfs_dataset", ipfs_result['cid'])
                        )
                        ipfs_test = "error" not in import_result
                        
                        # Clean up
                        if ipfs_test:
                            loop.run_until_complete(self.remove_dataset("test_ipfs_dataset"))
                    
                    # Clean up test files
                    shutil.rmtree(test_dir)
                    os.remove(archive_path)
                except Exception as e:
                    logger.error(f"IPFS dataset test failed: {e}")
            
            # Compile results
            results = {
                "success": init_result and registry_test and list_datasets_test,
                "module": "datasets",
                "initialization": init_result,
                "registry": registry_test,
                "list_datasets": list_datasets_test,
                "dataset_loading": dataset_loading_test,
                "sample_loading": sample_test,
                "ipfs_integration": ipfs_test,
                "capabilities": {
                    "huggingface_datasets": has_huggingface_datasets,
                    "ipfs": self.ipfs_kit is not None,
                    "ipfs_datasets_py": has_ipfs_datasets_py
                },
                "metadata": self.metadata
            }
            
            return results
        except Exception as e:
            logger.error(f"IPFS Datasets test failed: {e}")
            return {
                "success": False,
                "module": "datasets",
                "error": str(e),
                "initialization": self.initialized,
                "registry": False,
                "list_datasets": False,
                "dataset_loading": False,
                "sample_loading": False,
                "ipfs_integration": False,
                "capabilities": {
                    "huggingface_datasets": has_huggingface_datasets,
                    "ipfs": self.ipfs_kit is not None,
                    "ipfs_datasets_py": has_ipfs_datasets_py
                },
                "metadata": self.metadata
            }

# Create default instance
ipfs_datasets = IPFSDatasets()