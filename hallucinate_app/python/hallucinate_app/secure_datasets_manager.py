"""
Secure Datasets Manager Module

Provides capability-based secure access to dataset operations
Integrates with UCAN authentication for decentralized auth
Implements proper error handling and access control
"""

import os
import json
import logging
import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional, Union, Any, Set

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("secure_datasets_manager")

# Try to import auth manager
try:
    from .auth import auth_manager, AuthManager
    has_auth = True
except ImportError:
    logger.warning("Auth module not available, using default empty implementation")
    has_auth = False
    
# Try to import dataset manager
try:
    from .ipfs_datasets import ipfs_datasets, IPFSDatasets
    has_dataset_manager = True
except ImportError:
    logger.warning("IPFS Datasets not available, using mock implementation")
    has_dataset_manager = False

# Define capability namespaces for dataset operations
DATASET_CAPABILITIES = {
    "LOAD": "dataset:load",
    "IMPORT": "dataset:import",
    "REMOVE": "dataset:remove",
    "LIST": "dataset:list",
    "SAMPLE": "dataset:sample",
    "ADMIN": "dataset:admin",
}


class SecureDatasetManager:
    """
    Secure Dataset Manager providing capability-based access control
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the secure dataset manager
        
        Args:
            resources: Resources dictionary
            metadata: Metadata dictionary with configuration
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Use resources if provided, otherwise use default instances
        self.auth = self.resources.get("auth") or (auth_manager if has_auth else None)
        
        if has_dataset_manager:
            self.dataset_manager = self.resources.get("dataset_manager") or ipfs_datasets
        else:
            self.dataset_manager = None
        
        self.initialized = False
        
        # Cache for tracking loaded datasets and their capabilities
        self.dataset_access_cache = {}
        self.dataset_load_requests = {}
        
        # Operational stats
        self.stats = {
            "access_granted": 0,
            "access_denied": 0,
            "datasets_loaded": 0,
            "samples_retrieved": 0,
            "last_request": None
        }
        
        # Resource usage monitoring
        self.resource_usage = {
            "by_dataset": {},
            "by_user": {}
        }
        
        logger.info("Secure Dataset Manager initialized")
    
    async def init(self) -> bool:
        """
        Initialize the secure dataset manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure auth manager is initialized
            if self.auth and hasattr(self.auth, "init"):
                if not getattr(self.auth, "initialized", False):
                    await self.auth.init()
            
            # Initialize underlying dataset manager if needed
            if self.dataset_manager and hasattr(self.dataset_manager, "init"):
                await self.dataset_manager.init()
            
            self.initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize secure dataset manager: {e}")
            return False
    
    async def load_dataset(self, dataset_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely load a dataset with capability verification
        
        Args:
            dataset_id: Dataset identifier to load
            options: Loading options including auth_token for authorization
            
        Returns:
            Dict: Load result
        """
        if not self.initialized:
            raise RuntimeError("Secure dataset manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "load_dataset",
            "dataset_id": dataset_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for dataset loading")
            
            # Verify capability token for dataset access
            capability_string = f"{DATASET_CAPABILITIES['LOAD']}:{dataset_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader dataset:load:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{DATASET_CAPABILITIES['LOAD']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized dataset load attempt for {dataset_id}")
                        raise PermissionError(f"Not authorized to load dataset {dataset_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing dataset load without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Check if dataset is already being loaded
            if dataset_id in self.dataset_load_requests:
                logger.info(f"Dataset {dataset_id} is already being loaded, waiting for completion")
                return await self.dataset_load_requests[dataset_id]
            
            # Create a future for this load request
            future = asyncio.Future()
            self.dataset_load_requests[dataset_id] = future
            
            try:
                # Call underlying dataset manager
                subset = options.get("subset")
                split = options.get("split")
                
                if self.dataset_manager and hasattr(self.dataset_manager, "load_dataset"):
                    result = await self.dataset_manager.load_dataset(dataset_id, subset, split)
                    
                    if result and "error" not in result:
                        # Update cache with successful load
                        self.dataset_access_cache[dataset_id] = {
                            "loaded_at": datetime.now().isoformat(),
                            "loaded_by": self._extract_principal_from_token(auth_token),
                            "token": auth_token,
                            "last_used": datetime.now().isoformat(),
                            "metadata": result
                        }
                        
                        # Set future result
                        future.set_result(result)
                        
                        # Update stats
                        self.stats["datasets_loaded"] += 1
                        self._update_resource_usage("load", dataset_id, options)
                        
                        return result
                    else:
                        # Set future with error
                        future.set_result(result)
                        return result
                else:
                    # Mock implementation if no dataset manager available
                    mock_result = {
                        "success": True,
                        "dataset_id": dataset_id,
                        "mock": True,
                        "message": "Mock dataset loaded (no real dataset manager available)"
                    }
                    
                    # Update cache with mock load
                    self.dataset_access_cache[dataset_id] = {
                        "loaded_at": datetime.now().isoformat(),
                        "loaded_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.now().isoformat(),
                        "mock": True
                    }
                    
                    # Set future result
                    future.set_result(mock_result)
                    
                    # Update stats
                    self.stats["datasets_loaded"] += 1
                    self._update_resource_usage("load", dataset_id, options)
                    
                    return mock_result
            except Exception as e:
                # Set future with error
                error_result = {
                    "success": False,
                    "dataset_id": dataset_id,
                    "error": str(e)
                }
                future.set_result(error_result)
                return error_result
            finally:
                # Remove from pending requests
                if dataset_id in self.dataset_load_requests:
                    del self.dataset_load_requests[dataset_id]
        except Exception as e:
            logger.error(f"Secure dataset load failed for {dataset_id}: {e}")
            return {
                "success": False,
                "dataset_id": dataset_id,
                "error": str(e)
            }
    
    async def import_dataset_from_ipfs(self, dataset_id: str, cid: str, 
                                    options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely import a dataset from IPFS with capability verification
        
        Args:
            dataset_id: Dataset identifier to import
            cid: IPFS content identifier
            options: Import options including auth_token for authorization
            
        Returns:
            Dict: Import result
        """
        if not self.initialized:
            raise RuntimeError("Secure dataset manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "import_dataset_from_ipfs",
            "dataset_id": dataset_id,
            "cid": cid,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for dataset import")
            
            # Verify capability token for dataset import
            capability_string = f"{DATASET_CAPABILITIES['IMPORT']}:{dataset_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader dataset:import:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{DATASET_CAPABILITIES['IMPORT']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized dataset import attempt for {dataset_id}")
                        raise PermissionError(f"Not authorized to import dataset {dataset_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing dataset import without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying dataset manager
            if self.dataset_manager and hasattr(self.dataset_manager, "import_dataset_from_ipfs"):
                result = await self.dataset_manager.import_dataset_from_ipfs(dataset_id, cid)
                
                if result and "error" not in result:
                    # Update cache with successful import
                    self.dataset_access_cache[dataset_id] = {
                        "loaded_at": datetime.now().isoformat(),
                        "loaded_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.now().isoformat(),
                        "source": "ipfs",
                        "cid": cid,
                        "metadata": result
                    }
                    
                    # Update stats
                    self.stats["datasets_loaded"] += 1
                    self._update_resource_usage("import", dataset_id, options)
                
                return result
            else:
                # Mock implementation if no dataset manager available
                mock_result = {
                    "success": True,
                    "dataset_id": dataset_id,
                    "cid": cid,
                    "mock": True,
                    "message": "Mock dataset imported (no real dataset manager available)"
                }
                
                # Update cache with mock import
                self.dataset_access_cache[dataset_id] = {
                    "loaded_at": datetime.now().isoformat(),
                    "loaded_by": self._extract_principal_from_token(auth_token),
                    "token": auth_token,
                    "last_used": datetime.now().isoformat(),
                    "source": "ipfs",
                    "cid": cid,
                    "mock": True
                }
                
                # Update stats
                self.stats["datasets_loaded"] += 1
                self._update_resource_usage("import", dataset_id, options)
                
                return mock_result
        except Exception as e:
            logger.error(f"Secure dataset import failed for {dataset_id}: {e}")
            return {
                "success": False,
                "dataset_id": dataset_id,
                "error": str(e)
            }
    
    async def remove_dataset(self, dataset_id: str, options: Dict[str, Any] = None) -> bool:
        """
        Securely remove a dataset with capability verification
        
        Args:
            dataset_id: Dataset identifier to remove
            options: Removal options including auth_token for authorization
            
        Returns:
            bool: True if removal successful
        """
        if not self.initialized:
            raise RuntimeError("Secure dataset manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "remove_dataset",
            "dataset_id": dataset_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for dataset removal")
            
            # Verify capability token for dataset removal
            capability_string = f"{DATASET_CAPABILITIES['REMOVE']}:{dataset_id}"
            is_authorized = False
            is_admin = False
            is_original_loader = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                # Also allow admins or original loaders to remove datasets
                is_admin = await self.auth.verify_capability(auth_token, f"{DATASET_CAPABILITIES['ADMIN']}:*")
                
                if dataset_id in self.dataset_access_cache:
                    dataset_access = self.dataset_access_cache[dataset_id]
                    original_loader = self._extract_principal_from_token(dataset_access["token"])
                    current_user = self._extract_principal_from_token(auth_token)
                    is_original_loader = original_loader == current_user
                
                if not is_authorized and not is_admin and not is_original_loader:
                    self.stats["access_denied"] += 1
                    logger.warning(f"Unauthorized dataset removal attempt for {dataset_id}")
                    raise PermissionError(f"Not authorized to remove dataset {dataset_id}")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing dataset removal without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying dataset manager
            if self.dataset_manager and hasattr(self.dataset_manager, "remove_dataset"):
                result = await self.dataset_manager.remove_dataset(dataset_id)
                success = bool(result)
            else:
                # Mock implementation if no dataset manager available
                success = True
            
            # Remove from cache
            if dataset_id in self.dataset_access_cache:
                del self.dataset_access_cache[dataset_id]
            
            return success
        except Exception as e:
            logger.error(f"Secure dataset removal failed for {dataset_id}: {e}")
            return False
    
    async def list_datasets(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely list datasets with capability verification
        
        Args:
            options: List options including auth_token for authorization
            
        Returns:
            Dict: List of datasets
        """
        if not self.initialized:
            raise RuntimeError("Secure dataset manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "list_datasets",
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for dataset listing")
            
            # Verify capability token for dataset listing
            capability_string = f"{DATASET_CAPABILITIES['LIST']}:*"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    self.stats["access_denied"] += 1
                    logger.warning("Unauthorized dataset listing attempt")
                    raise PermissionError("Not authorized to list datasets")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing dataset listing without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying dataset manager
            if self.dataset_manager and hasattr(self.dataset_manager, "list_datasets"):
                datasets = await self.dataset_manager.list_datasets()
                
                # Enrich with access info from cache
                for dataset_id in datasets.keys():
                    if dataset_id in self.dataset_access_cache:
                        access_info = self.dataset_access_cache[dataset_id]
                        datasets[dataset_id]["last_access"] = access_info["last_used"]
                        datasets[dataset_id]["loaded_by"] = access_info["loaded_by"]
                
                return datasets
            else:
                # Mock implementation if no dataset manager available
                return {dataset_id: {
                    "dataset_id": dataset_id,
                    "loaded_at": info["loaded_at"],
                    "loaded_by": info["loaded_by"],
                    "last_used": info["last_used"],
                    "mock": True
                } for dataset_id, info in self.dataset_access_cache.items()}
        except Exception as e:
            logger.error(f"Secure dataset listing failed: {e}")
            return {}
    
    async def get_sample(self, dataset_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely get dataset sample with capability verification
        
        Args:
            dataset_id: Dataset identifier
            options: Sample options including auth_token for authorization
            
        Returns:
            Dict: Dataset samples
        """
        if not self.initialized:
            raise RuntimeError("Secure dataset manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "get_sample",
            "dataset_id": dataset_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for dataset sampling")
            
            # Verify capability token for dataset sampling
            capability_string = f"{DATASET_CAPABILITIES['SAMPLE']}:{dataset_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader dataset:sample:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{DATASET_CAPABILITIES['SAMPLE']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized dataset sample attempt for {dataset_id}")
                        raise PermissionError(f"Not authorized to sample dataset {dataset_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing dataset sampling without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache if dataset exists
            if dataset_id in self.dataset_access_cache:
                dataset_access = self.dataset_access_cache[dataset_id]
                dataset_access["last_used"] = datetime.now().isoformat()
                self.dataset_access_cache[dataset_id] = dataset_access
            
            # Call underlying dataset manager
            split = options.get("split")
            num_samples = options.get("num_samples", 5)
            
            if self.dataset_manager and hasattr(self.dataset_manager, "get_sample"):
                result = await self.dataset_manager.get_sample(dataset_id, split, num_samples)
                
                # Update stats
                self.stats["samples_retrieved"] += 1
                self._update_resource_usage("sample", dataset_id, options)
                
                return result
            else:
                # Mock implementation if no dataset manager available
                mock_samples = [{"text": f"Sample {i} for {dataset_id}"} for i in range(num_samples)]
                
                # Update stats
                self.stats["samples_retrieved"] += 1
                self._update_resource_usage("sample", dataset_id, options)
                
                return {
                    "dataset_id": dataset_id,
                    "split": split or "train",
                    "num_samples": num_samples,
                    "samples": mock_samples,
                    "mock": True
                }
        except Exception as e:
            logger.error(f"Secure dataset sample failed for {dataset_id}: {e}")
            return {
                "success": False,
                "dataset_id": dataset_id,
                "error": str(e)
            }
    
    def _extract_principal_from_token(self, token: str) -> str:
        """
        Extract principal ID from auth token (simplified)
        
        Args:
            token: Auth token
            
        Returns:
            str: Principal ID
        """
        # In a real implementation, this would decode the UCAN token
        # For now, we'll just return a placeholder value
        return "principal:unknown"
    
    def _update_resource_usage(self, operation: str, dataset_id: str, 
                             options: Dict[str, Any] = None) -> None:
        """
        Update resource usage tracking
        
        Args:
            operation: Operation type
            dataset_id: Dataset ID
            options: Operation options
        """
        options = options or {}
        
        # Initialize dataset tracking if needed
        if dataset_id not in self.resource_usage["by_dataset"]:
            self.resource_usage["by_dataset"][dataset_id] = {
                "loads": 0,
                "imports": 0,
                "samples": 0,
                "last_access": None
            }
        
        # Initialize user tracking if options has user info
        user_id = options.get("user_id", "anonymous")
        if user_id not in self.resource_usage["by_user"]:
            self.resource_usage["by_user"][user_id] = {
                "loads": 0,
                "imports": 0,
                "samples": 0,
                "datasets": set()
            }
        
        # Update counters based on operation
        if operation == "load":
            self.resource_usage["by_dataset"][dataset_id]["loads"] += 1
            self.resource_usage["by_user"][user_id]["loads"] += 1
            self.resource_usage["by_user"][user_id]["datasets"].add(dataset_id)
        elif operation == "import":
            self.resource_usage["by_dataset"][dataset_id]["imports"] += 1
            self.resource_usage["by_user"][user_id]["imports"] += 1
            self.resource_usage["by_user"][user_id]["datasets"].add(dataset_id)
        elif operation == "sample":
            self.resource_usage["by_dataset"][dataset_id]["samples"] += 1
            self.resource_usage["by_user"][user_id]["samples"] += 1
        
        # Update last access timestamp
        self.resource_usage["by_dataset"][dataset_id]["last_access"] = datetime.now().isoformat()
    
    async def get_stats(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get module statistics
        
        Args:
            options: Options for stats retrieval including auth_token
            
        Returns:
            Dict: Module statistics
        """
        if not self.initialized:
            raise RuntimeError("Secure dataset manager not initialized. Call init() first")
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token and self.auth:
                raise ValueError("Authentication token required for stats access")
            
            # Verify capability token for admin access
            is_authorized = True
            if self.auth:
                capability_string = f"{DATASET_CAPABILITIES['ADMIN']}:stats"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning("Unauthorized stats access attempt")
                    raise PermissionError("Not authorized to access module statistics")
            
            # Return copy of stats
            top_datasets = self._get_top_datasets(5)
            
            # Need to convert sets to lists for serialization
            user_stats = {}
            for user_id, stats in self.resource_usage["by_user"].items():
                user_stats[user_id] = {
                    "loads": stats["loads"],
                    "imports": stats["imports"],
                    "samples": stats["samples"],
                    "datasets": list(stats["datasets"])
                }
            
            return {
                **self.stats,
                "dataset_count": len(self.dataset_access_cache),
                "resource_usage": {
                    "dataset_count": len(self.resource_usage["by_dataset"]),
                    "user_count": len(self.resource_usage["by_user"]),
                    "total_samples": self.stats["samples_retrieved"],
                    "top_datasets": top_datasets,
                    "by_user": user_stats
                }
            }
        except Exception as e:
            logger.error(f"Failed to get secure dataset manager stats: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_top_datasets(self, count: int = 5) -> List[Dict[str, Any]]:
        """
        Get top N datasets by sample count
        
        Args:
            count: Number of datasets to return
            
        Returns:
            List: Top datasets
        """
        # Sort datasets by sample count
        sorted_datasets = sorted(
            self.resource_usage["by_dataset"].items(),
            key=lambda x: x[1]["samples"],
            reverse=True
        )
        
        # Take top N datasets
        top_datasets = sorted_datasets[:count]
        
        # Format results
        return [
            {
                "dataset_id": dataset_id,
                "samples": stats["samples"],
                "loads": stats["loads"],
                "imports": stats["imports"],
                "last_access": stats["last_access"]
            }
            for dataset_id, stats in top_datasets
        ]
    
    def test(self) -> Dict[str, Any]:
        """
        Run tests on the secure dataset manager
        
        Returns:
            Dict: Test results
        """
        logger.info("Testing secure dataset manager")
        
        try:
            # Create asyncio event loop for async tests
            loop = asyncio.get_event_loop()
            
            test_results = {
                "success": True,
                "module": "secure_dataset_manager",
                "initialization": False,
                "capability_verification": False,
                "dataset_operations": {
                    "load": False,
                    "import": False,
                    "remove": False,
                    "list": False,
                    "sample": False
                },
                "stats_tracking": False
            }
            
            # Test initialization if not already initialized
            if not self.initialized:
                init_result = loop.run_until_complete(self.init())
                test_results["initialization"] = init_result
            else:
                test_results["initialization"] = True
            
            if test_results["initialization"]:
                # Create test principals and capabilities for testing if auth is available
                admin_token = "mock-admin-token"
                load_token = "mock-load-token"
                import_token = "mock-import-token"
                sample_token = "mock-sample-token"
                
                if self.auth:
                    # Create test user if not exists
                    if "test-user" not in self.auth.principals:
                        loop.run_until_complete(self.auth.create_principal("test-user"))
                    
                    # Issue capabilities
                    admin_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": DATASET_CAPABILITIES["ADMIN"],
                            "with": "*"
                        })
                    )
                    admin_token = admin_token_result["token"]
                    
                    load_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": DATASET_CAPABILITIES["LOAD"],
                            "with": "*"
                        })
                    )
                    load_token = load_token_result["token"]
                    
                    import_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": DATASET_CAPABILITIES["IMPORT"],
                            "with": "*"
                        })
                    )
                    import_token = import_token_result["token"]
                    
                    sample_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": DATASET_CAPABILITIES["SAMPLE"],
                            "with": "*"
                        })
                    )
                    sample_token = sample_token_result["token"]
                
                # Save original dataset manager
                original_dataset_manager = self.dataset_manager
                
                try:
                    # Create a mock dataset manager class for testing
                    class MockDatasetManager:
                        async def init(self):
                            return True
                        
                        async def load_dataset(self, dataset_id, subset=None, split=None):
                            return {
                                "dataset_id": dataset_id,
                                "subset": subset,
                                "split": split,
                                "success": True
                            }
                        
                        async def import_dataset_from_ipfs(self, dataset_id, cid):
                            return {
                                "dataset_id": dataset_id,
                                "cid": cid,
                                "success": True
                            }
                        
                        async def remove_dataset(self, dataset_id):
                            return True
                        
                        async def list_datasets(self):
                            return {"test-dataset": {"dataset_id": "test-dataset"}}
                        
                        async def get_sample(self, dataset_id, split=None, num_samples=5):
                            return {
                                "dataset_id": dataset_id,
                                "split": split or "train",
                                "num_samples": num_samples,
                                "samples": [{"text": f"Sample {i}"} for i in range(num_samples)]
                            }
                    
                    # Set mock dataset manager
                    self.dataset_manager = MockDatasetManager()
                    
                    # Test capability verification by trying with invalid token
                    try:
                        # This should fail with invalid token
                        await self.load_dataset("test-dataset", {"auth_token": "invalid-token"})
                        test_results["capability_verification"] = False
                    except (PermissionError, ValueError):
                        # Expected failure is good
                        test_results["capability_verification"] = True
                    
                    # If auth not available, assume verification passes
                    if not self.auth:
                        test_results["capability_verification"] = True
                    
                    # Test dataset operations
                    try:
                        # Test load dataset
                        load_result = await self.load_dataset("test-dataset", {
                            "auth_token": load_token,
                            "user_id": "test-user"
                        })
                        test_results["dataset_operations"]["load"] = load_result.get("success", False)
                        
                        # Test import dataset
                        import_result = await self.import_dataset_from_ipfs("test-dataset", "test-cid", {
                            "auth_token": import_token,
                            "user_id": "test-user"
                        })
                        test_results["dataset_operations"]["import"] = import_result.get("success", False)
                        
                        # Test sample dataset
                        sample_result = await self.get_sample("test-dataset", {
                            "auth_token": sample_token,
                            "user_id": "test-user"
                        })
                        test_results["dataset_operations"]["sample"] = "samples" in sample_result
                        
                        # Test list datasets
                        datasets = await self.list_datasets({
                            "auth_token": admin_token
                        })
                        test_results["dataset_operations"]["list"] = isinstance(datasets, dict)
                        
                        # Test remove dataset
                        remove_result = await self.remove_dataset("test-dataset", {
                            "auth_token": admin_token
                        })
                        test_results["dataset_operations"]["remove"] = remove_result is True
                        
                        # Test stats
                        stats = await self.get_stats({
                            "auth_token": admin_token
                        })
                        test_results["stats_tracking"] = (
                            isinstance(stats, dict) and
                            "access_granted" in stats and
                            "samples_retrieved" in stats
                        )
                    except Exception as e:
                        logger.error(f"Dataset operations test failed: {e}")
                finally:
                    # Restore original dataset manager
                    self.dataset_manager = original_dataset_manager
            
            # Overall success
            test_results["success"] = (
                test_results["initialization"] and
                (test_results["capability_verification"] or not self.auth) and
                all(test_results["dataset_operations"].values()) and
                test_results["stats_tracking"]
            )
            
            return test_results
        except Exception as e:
            logger.error(f"Secure dataset manager test failed: {e}")
            return {
                "success": False,
                "module": "secure_dataset_manager",
                "error": str(e)
            }


# Create default instance
secure_dataset_manager = SecureDatasetManager()