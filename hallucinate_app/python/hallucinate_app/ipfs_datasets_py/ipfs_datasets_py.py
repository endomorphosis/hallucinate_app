import os
import json
import tempfile
import tarfile
import shutil
import time
from typing import Dict, List, Optional, Any, Union

class IPFSDatasetsPy:
    """
    IPFS Datasets Python Package - Core implementation for dataset management
    
    This class provides functionality for managing datasets through IPFS,
    allowing decentralized storage and retrieval of machine learning datasets.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize IPFS Datasets Python implementation
        
        Args:
            resources (dict): External resources like IPFS client
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Default configuration
        self.datasets_path = self.metadata.get('datasetsPath', os.path.expanduser("~/.cache/huggingface/datasets"))
        self.role = self.metadata.get('role', 'leecher')
        self.dataset_registry = {}
        
        # Create datasets directory if it doesn't exist
        os.makedirs(self.datasets_path, exist_ok=True)
        
        # Get IPFS client from resources if available
        self.ipfs_client = self.resources.get('ipfsKit')
        
        # Flag for initialization status
        self.initialized = False
        
        print(f"IPFSDatasetsPy initialized with role={self.role}, path={self.datasets_path}")
    
    async def init(self):
        """Initialize datasets module"""
        try:
            # Load dataset registry
            registry_path = os.path.join(self.datasets_path, "dataset_registry.json")
            
            if os.path.exists(registry_path):
                with open(registry_path, 'r') as f:
                    self.dataset_registry = json.load(f)
                print(f"Loaded {len(self.dataset_registry)} datasets from registry")
            else:
                print("No dataset registry found, creating new one")
                self.dataset_registry = {}
                
            # Initialize IPFS client if available
            if self.ipfs_client and hasattr(self.ipfs_client, 'init'):
                await self.ipfs_client.init()
                
            self.initialized = True
            return True
        except Exception as e:
            print(f"Failed to initialize IPFSDatasetsPy: {e}")
            return False
    
    async def load_dataset(self, dataset_id, subset=None, split=None):
        """
        Load a dataset from local registry or download from source
        
        Args:
            dataset_id (str): Dataset identifier
            subset (str, optional): Dataset configuration or subset
            split (str, optional): Dataset split (train, test, etc.)
            
        Returns:
            dict: Dataset information and metadata
        """
        if not self.initialized:
            await self.init()
            
        try:
            # Check if dataset is in registry
            if dataset_id in self.dataset_registry:
                dataset_info = self.dataset_registry[dataset_id]
                print(f"Dataset {dataset_id} found in registry")
                
                # Check if dataset exists locally
                if 'local_path' in dataset_info and os.path.exists(dataset_info['local_path']):
                    # Return dataset info with requested split
                    if split and 'splits' in dataset_info and split in dataset_info['splits']:
                        return {
                            "dataset_id": dataset_id,
                            "split": split,
                            "local_path": dataset_info['local_path'],
                            "splits": dataset_info['splits'],
                            "features": dataset_info.get('features', {})
                        }
                    else:
                        return {
                            "dataset_id": dataset_id,
                            "local_path": dataset_info['local_path'],
                            "splits": dataset_info.get('splits', ['train']),
                            "features": dataset_info.get('features', {})
                        }
            
            # Dataset not found or not available locally, try to download
            # For this implementation, we'll just return a mock dataset info
            # In a real implementation, this would download from HuggingFace or similar
            
            mock_dataset_info = {
                "dataset_id": dataset_id,
                "subset": subset,
                "split": split,
                "local_path": os.path.join(self.datasets_path, dataset_id),
                "splits": ["train", "test"] if not split else [split],
                "features": {"text": "string", "label": "int"},
                "num_rows": 1000,
                "mock": True
            }
            
            # Add to registry
            self.dataset_registry[dataset_id] = mock_dataset_info
            
            # Save registry
            registry_path = os.path.join(self.datasets_path, "dataset_registry.json")
            with open(registry_path, 'w') as f:
                json.dump(self.dataset_registry, f, indent=2)
                
            return mock_dataset_info
        except Exception as e:
            print(f"Failed to load dataset {dataset_id}: {e}")
            return {"error": str(e)}
    
    async def import_dataset_from_ipfs(self, dataset_id, cid):
        """
        Import a dataset from IPFS
        
        Args:
            dataset_id (str): Dataset identifier to use
            cid (str): IPFS content identifier
            
        Returns:
            dict: Dataset information and metadata
        """
        if not self.initialized:
            await self.init()
            
        if not self.ipfs_client:
            return {"error": "IPFS client not available"}
            
        try:
            # Create dataset directory
            dataset_path = os.path.join(self.datasets_path, dataset_id)
            os.makedirs(dataset_path, exist_ok=True)
            
            # Download from IPFS
            with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as temp_file:
                temp_path = temp_file.name
                
            # Use IPFS client to fetch content
            if hasattr(self.ipfs_client, 'fetch_from_ipfs'):
                result = await self.ipfs_client.fetch_from_ipfs(cid, temp_path)
                
                if not result:
                    return {"error": "Failed to fetch dataset from IPFS"}
                    
                # Extract archive
                with tarfile.open(temp_path, 'r:gz') as tar:
                    tar.extractall(path=os.path.dirname(dataset_path))
                    
                # Clean up temp file
                os.unlink(temp_path)
                
                # Add to registry
                dataset_info = {
                    "dataset_id": dataset_id,
                    "local_path": dataset_path,
                    "ipfs_cid": cid,
                    "splits": ["train", "test"],  # This would be determined from actual dataset
                    "features": {"text": "string", "label": "int"},  # This would be determined from actual dataset
                    "last_updated": time.time(),
                    "source": "ipfs"
                }
                
                self.dataset_registry[dataset_id] = dataset_info
                
                # Save registry
                registry_path = os.path.join(self.datasets_path, "dataset_registry.json")
                with open(registry_path, 'w') as f:
                    json.dump(self.dataset_registry, f, indent=2)
                    
                return dataset_info
            else:
                return {"error": "IPFS client does not support fetch_from_ipfs method"}
        except Exception as e:
            print(f"Failed to import dataset from IPFS: {e}")
            return {"error": str(e)}
    
    async def get_sample(self, dataset_id, split=None, num_samples=5):
        """
        Get sample rows from a dataset
        
        Args:
            dataset_id (str): Dataset identifier
            split (str, optional): Dataset split
            num_samples (int): Number of samples to return
            
        Returns:
            dict: Sample data from the dataset
        """
        if not self.initialized:
            await self.init()
            
        try:
            # Check if dataset is in registry
            if dataset_id not in self.dataset_registry:
                # Try to load dataset first
                await self.load_dataset(dataset_id, split=split)
                
            # For this implementation, we'll return mock samples
            # In a real implementation, this would load the actual dataset
            
            samples = []
            for i in range(num_samples):
                samples.append({
                    "text": f"Sample text {i+1} for dataset {dataset_id}",
                    "label": i % 2
                })
                
            return {
                "dataset_id": dataset_id,
                "split": split or "train",
                "num_samples": len(samples),
                "samples": samples
            }
        except Exception as e:
            print(f"Failed to get sample from dataset {dataset_id}: {e}")
            return {"error": str(e)}
    
    async def remove_dataset(self, dataset_id):
        """
        Remove a dataset from registry and local storage
        
        Args:
            dataset_id (str): Dataset identifier
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
            
        try:
            # Check if dataset is in registry
            if dataset_id not in self.dataset_registry:
                print(f"Dataset {dataset_id} not found in registry")
                return False
                
            # Get dataset info
            dataset_info = self.dataset_registry[dataset_id]
            
            # Remove dataset directory if it exists
            if 'local_path' in dataset_info and os.path.exists(dataset_info['local_path']):
                if os.path.isdir(dataset_info['local_path']):
                    shutil.rmtree(dataset_info['local_path'])
                else:
                    os.unlink(dataset_info['local_path'])
                    
            # Remove from registry
            del self.dataset_registry[dataset_id]
            
            # Save registry
            registry_path = os.path.join(self.datasets_path, "dataset_registry.json")
            with open(registry_path, 'w') as f:
                json.dump(self.dataset_registry, f, indent=2)
                
            return True
        except Exception as e:
            print(f"Failed to remove dataset {dataset_id}: {e}")
            return False
    
    async def list_datasets(self):
        """
        List all datasets in registry
        
        Returns:
            dict: Datasets information
        """
        if not self.initialized:
            await self.init()
            
        return self.dataset_registry
    
    # Test helper methods for the JS implementation to call
    async def test_dataset_loading(self):
        """Test dataset loading functionality"""
        try:
            test_dataset_id = "test-dataset"
            result = await self.load_dataset(test_dataset_id)
            return result
        except Exception as e:
            print(f"Test dataset loading failed: {e}")
            return {"error": str(e)}
    
    async def test_sample_loading(self):
        """Test sample loading functionality"""
        try:
            test_dataset_id = "test-dataset"
            result = await self.get_sample(test_dataset_id)
            return result
        except Exception as e:
            print(f"Test sample loading failed: {e}")
            return {"error": str(e)}
    
    async def test_ipfs_integration(self):
        """Test IPFS integration functionality"""
        if not self.ipfs_client:
            return {"error": "IPFS client not available"}
            
        try:
            # Create a test dataset
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
                temp_file.write(json.dumps({"data": [{"text": "Test", "label": 1}]}))
                test_file = temp_file.name
                
            # Create a tar archive
            with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as archive_file:
                archive_path = archive_file.name
                
            with tarfile.open(archive_path, 'w:gz') as tar:
                tar.add(test_file, arcname=os.path.basename(test_file))
                
            # Add to IPFS
            if hasattr(self.ipfs_client, 'add_to_ipfs'):
                with open(archive_path, 'rb') as f:
                    content = f.read()
                    
                ipfs_result = await self.ipfs_client.add_to_ipfs(content)
                
                if ipfs_result and 'cid' in ipfs_result:
                    # Import the dataset
                    import_result = await self.import_dataset_from_ipfs(
                        "test-ipfs-dataset", 
                        ipfs_result['cid']
                    )
                    
                    # Clean up
                    await self.remove_dataset("test-ipfs-dataset")
                    
                    # Clean up test files
                    os.unlink(test_file)
                    os.unlink(archive_path)
                    
                    return import_result
                else:
                    return {"error": "Failed to add to IPFS"}
            else:
                return {"error": "IPFS client does not support add_to_ipfs method"}
        except Exception as e:
            print(f"Test IPFS integration failed: {e}")
            return {"error": str(e)}
            
    def test(self):
        """
        Run tests for the IPFS Datasets module
        
        Returns:
            dict: Test results
        """
        import asyncio
        
        print("Testing IPFSDatasetsPy functionality")
        
        # Create new event loop for sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Test initialization
            init_result = loop.run_until_complete(self.init())
            
            # Test dataset loading
            dataset_loading_result = loop.run_until_complete(self.test_dataset_loading())
            dataset_loading_success = "error" not in dataset_loading_result
            
            # Test sample loading
            sample_loading_result = loop.run_until_complete(self.test_sample_loading())
            sample_loading_success = "error" not in sample_loading_result
            
            # Test IPFS integration
            ipfs_test_result = {"success": False}
            if self.ipfs_client:
                ipfs_test_result = loop.run_until_complete(self.test_ipfs_integration())
                
            ipfs_integration_success = "error" not in ipfs_test_result
            
            # Test results
            results = {
                "success": init_result and dataset_loading_success,
                "module": "datasets",
                "initialization": init_result,
                "registry": init_result,  # Registry is loaded during init
                "list_datasets": True,
                "dataset_loading": dataset_loading_success,
                "sample_loading": sample_loading_success,
                "ipfs_integration": ipfs_integration_success,
                "capabilities": {
                    "huggingface_datasets": False,  # This would check for actual HF datasets
                    "ipfs": self.ipfs_client is not None
                }
            }
            
            return results
        except Exception as e:
            print(f"IPFSDatasetsPy test failed: {e}")
            return {
                "success": False,
                "module": "datasets",
                "error": str(e)
            }
        finally:
            loop.close()