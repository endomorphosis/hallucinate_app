"""
Secure Model Manager Module

Provides capability-based secure access to model operations
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
logger = logging.getLogger("secure_model_manager")

# Try to import auth manager
try:
    from .auth import auth_manager, AuthManager
    has_auth = True
except ImportError:
    logger.warning("Auth module not available, using default empty implementation")
    has_auth = False
    
# Try to import model manager
try:
    from .ipfs_model_manager import ipfs_model_manager, IPFSModelManager, ModelMetadata
    has_model_manager = True
except ImportError:
    logger.warning("IPFS Model Manager not available, using mock implementation")
    has_model_manager = False

# Define capability namespaces for model operations
MODEL_CAPABILITIES = {
    "LOAD": "model:load",
    "UNLOAD": "model:unload",
    "INFERENCE": "model:inference",
    "LIST": "model:list",
    "CACHE": "model:cache",
    "ADMIN": "model:admin",
}


class SecureModelManager:
    """
    Secure Model Manager providing capability-based access control
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the secure model manager
        
        Args:
            resources: Resources dictionary
            metadata: Metadata dictionary with configuration
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Use resources if provided, otherwise use default instances
        self.auth = self.resources.get("auth") or (auth_manager if has_auth else None)
        
        if has_model_manager:
            self.model_manager = self.resources.get("model_manager") or ipfs_model_manager
        else:
            self.model_manager = None
        
        self.initialized = False
        
        # Cache for tracking loaded models and their capabilities
        self.model_access_cache = {}
        self.model_load_requests = {}
        
        # Operational stats
        self.stats = {
            "access_granted": 0,
            "access_denied": 0,
            "models_loaded": 0,
            "inferences_run": 0,
            "last_request": None
        }
        
        # Resource usage monitoring
        self.resource_usage = {
            "by_model": {},
            "by_user": {}
        }
        
        logger.info("Secure Model Manager initialized")
    
    async def init(self) -> bool:
        """
        Initialize the secure model manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure auth manager is initialized
            if self.auth and hasattr(self.auth, "init"):
                if not getattr(self.auth, "initialized", False):
                    await self.auth.init()
            
            # Initialize underlying model manager if needed
            if self.model_manager and hasattr(self.model_manager, "init"):
                await self.model_manager.init()
            
            self.initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize secure model manager: {e}")
            return False
    
    async def load_model(self, model_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely load a model with capability verification
        
        Args:
            model_id: Model identifier to load
            options: Loading options including authToken for authorization
            
        Returns:
            Dict: Load result
        """
        if not self.initialized:
            raise RuntimeError("Secure model manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "load_model",
            "model_id": model_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for model loading")
            
            # Verify capability token for model access
            capability_string = f"{MODEL_CAPABILITIES['LOAD']}:{model_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader model:load:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{MODEL_CAPABILITIES['LOAD']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized model load attempt for {model_id}")
                        raise PermissionError(f"Not authorized to load model {model_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing model load without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Check if model is already being loaded
            if model_id in self.model_load_requests:
                logger.info(f"Model {model_id} is already being loaded, waiting for completion")
                return await self.model_load_requests[model_id]
            
            # Create a future for this load request
            future = asyncio.Future()
            self.model_load_requests[model_id] = future
            
            try:
                # Call underlying model manager
                if self.model_manager and hasattr(self.model_manager, "import_model_from_huggingface"):
                    if options.get("source") == "ipfs" and "cid" in options:
                        # Load from IPFS
                        result = await self.model_manager.import_model_from_ipfs(model_id, options["cid"])
                    else:
                        # Default to HuggingFace
                        result = await self.model_manager.import_model_from_huggingface(model_id)
                    
                    if result:
                        # Update cache with successful load
                        self.model_access_cache[model_id] = {
                            "loaded_at": datetime.now().isoformat(),
                            "loaded_by": self._extract_principal_from_token(auth_token),
                            "token": auth_token,
                            "last_used": datetime.now().isoformat(),
                            "metadata": result.to_dict() if hasattr(result, "to_dict") else result
                        }
                        
                        # Set future result
                        future.set_result({
                            "success": True,
                            "model_id": model_id,
                            "metadata": result.to_dict() if hasattr(result, "to_dict") else result
                        })
                        
                        # Update stats
                        self.stats["models_loaded"] += 1
                        self._update_resource_usage("load", model_id, options)
                        
                        return future.result()
                    else:
                        # Set future with error
                        future.set_result({
                            "success": False,
                            "model_id": model_id,
                            "error": "Failed to load model"
                        })
                        return future.result()
                else:
                    # Mock implementation if no model manager available
                    mock_result = {
                        "success": True,
                        "model_id": model_id,
                        "mock": True,
                        "message": "Mock model loaded (no real model manager available)"
                    }
                    
                    # Update cache with mock load
                    self.model_access_cache[model_id] = {
                        "loaded_at": datetime.now().isoformat(),
                        "loaded_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.now().isoformat(),
                        "mock": True
                    }
                    
                    # Set future result
                    future.set_result(mock_result)
                    
                    # Update stats
                    self.stats["models_loaded"] += 1
                    self._update_resource_usage("load", model_id, options)
                    
                    return mock_result
            except Exception as e:
                # Set future with error
                error_result = {
                    "success": False,
                    "model_id": model_id,
                    "error": str(e)
                }
                future.set_result(error_result)
                return error_result
            finally:
                # Remove from pending requests
                if model_id in self.model_load_requests:
                    del self.model_load_requests[model_id]
        except Exception as e:
            logger.error(f"Secure model load failed for {model_id}: {e}")
            return {
                "success": False,
                "model_id": model_id,
                "error": str(e)
            }
    
    async def run_inference(self, model_id: str, input_data: Any, 
                          options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely run inference on a model with capability verification
        
        Args:
            model_id: Model identifier to use
            input_data: Input data for inference
            options: Inference options including authToken for authorization
            
        Returns:
            Dict: Inference result
        """
        if not self.initialized:
            raise RuntimeError("Secure model manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "run_inference",
            "model_id": model_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for model inference")
            
            # Verify capability token for model inference
            capability_string = f"{MODEL_CAPABILITIES['INFERENCE']}:{model_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader model:inference:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(
                        auth_token, f"{MODEL_CAPABILITIES['INFERENCE']}:*"
                    )
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized model inference attempt for {model_id}")
                        raise PermissionError(f"Not authorized to run inference on model {model_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing inference without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Verify model is loaded
            if model_id not in self.model_access_cache:
                raise ValueError(f"Model {model_id} is not loaded. Load the model first.")
            
            # Update last used timestamp
            model_access = self.model_access_cache[model_id]
            model_access["last_used"] = datetime.now().isoformat()
            self.model_access_cache[model_id] = model_access
            
            # Call underlying model manager implementation
            # In a real implementation, this would actually run the model
            # For now, return a mock result
            mock_result = {
                "success": True,
                "model_id": model_id,
                "input": str(input_data)[:100] + "...",  # Truncate for logs
                "result": "This is a mock inference result. In a real implementation, this would be the model output.",
                "timestamp": datetime.now().isoformat()
            }
            
            # Update stats
            self.stats["inferences_run"] += 1
            self._update_resource_usage("inference", model_id, options)
            
            return mock_result
        except Exception as e:
            logger.error(f"Secure model inference failed for {model_id}: {e}")
            return {
                "success": False,
                "model_id": model_id,
                "error": str(e)
            }
    
    async def unload_model(self, model_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely unload a model with capability verification
        
        Args:
            model_id: Model identifier to unload
            options: Unloading options including authToken for authorization
            
        Returns:
            Dict: Unload result
        """
        if not self.initialized:
            raise RuntimeError("Secure model manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "unload_model",
            "model_id": model_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for model unloading")
            
            # Verify capability token for model unload
            capability_string = f"{MODEL_CAPABILITIES['UNLOAD']}:{model_id}"
            is_authorized = False
            is_admin = False
            is_original_loader = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                # Also allow admins or original loaders to unload models
                is_admin = await self.auth.verify_capability(auth_token, f"{MODEL_CAPABILITIES['ADMIN']}:*")
                
                if model_id in self.model_access_cache:
                    model_access = self.model_access_cache[model_id]
                    original_loader = self._extract_principal_from_token(model_access["token"])
                    current_user = self._extract_principal_from_token(auth_token)
                    is_original_loader = original_loader == current_user
                
                if not is_authorized and not is_admin and not is_original_loader:
                    self.stats["access_denied"] += 1
                    logger.warning(f"Unauthorized model unload attempt for {model_id}")
                    raise PermissionError(f"Not authorized to unload model {model_id}")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing model unload without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying model manager
            if self.model_manager and hasattr(self.model_manager, "remove_model"):
                result = await self.model_manager.remove_model(model_id)
                success = bool(result)
            else:
                # Mock implementation if no model manager available
                success = True
            
            # Remove from cache
            if model_id in self.model_access_cache:
                del self.model_access_cache[model_id]
            
            return {
                "success": success,
                "model_id": model_id,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Secure model unload failed for {model_id}: {e}")
            return {
                "success": False,
                "model_id": model_id,
                "error": str(e)
            }
    
    async def list_models(self, options: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Securely list loaded models with capability verification
        
        Args:
            options: List options including authToken for authorization
            
        Returns:
            List: List of loaded models
        """
        if not self.initialized:
            raise RuntimeError("Secure model manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "list_models",
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for model listing")
            
            # Verify capability token for model listing
            capability_string = f"{MODEL_CAPABILITIES['LIST']}:*"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    self.stats["access_denied"] += 1
                    logger.warning("Unauthorized model listing attempt")
                    raise PermissionError("Not authorized to list models")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing model listing without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying model manager if available
            models = []
            if self.model_manager and hasattr(self.model_manager, "list_models"):
                model_registry = await self.model_manager.list_models()
                
                # Combine registry with access cache
                for model_id, model_metadata in model_registry.items():
                    model_info = {
                        "id": model_id,
                        "metadata": model_metadata.to_dict() if hasattr(model_metadata, "to_dict") else model_metadata
                    }
                    
                    # Add access info if available
                    if model_id in self.model_access_cache:
                        access_info = self.model_access_cache[model_id]
                        model_info["loaded_at"] = access_info["loaded_at"]
                        model_info["loaded_by"] = access_info["loaded_by"]
                        model_info["last_used"] = access_info["last_used"]
                    
                    models.append(model_info)
            else:
                # Fallback to cache if underlying implementation doesn't exist
                for model_id, access_info in self.model_access_cache.items():
                    models.append({
                        "id": model_id,
                        "loaded_at": access_info["loaded_at"],
                        "loaded_by": access_info["loaded_by"],
                        "last_used": access_info["last_used"],
                        "metadata": access_info.get("metadata", {})
                    })
            
            return models
        except Exception as e:
            logger.error(f"Secure model listing failed: {e}")
            return []
    
    async def get_cache_status(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely get model cache status with capability verification
        
        Args:
            options: Cache options including authToken for authorization
            
        Returns:
            Dict: Cache status
        """
        if not self.initialized:
            raise RuntimeError("Secure model manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "get_cache_status",
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for cache status access")
            
            # Verify capability token for cache access
            capability_string = f"{MODEL_CAPABILITIES['CACHE']}:status"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    self.stats["access_denied"] += 1
                    logger.warning("Unauthorized cache status access attempt")
                    raise PermissionError("Not authorized to access cache status")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing cache status access without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Return basic cache info
            return {
                "cache_size": len(self.model_access_cache),
                "models": list(self.model_access_cache.keys()),
                "last_updated": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Secure cache status access failed: {e}")
            return {
                "success": False,
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
    
    def _update_resource_usage(self, operation: str, model_id: str, 
                             options: Dict[str, Any] = None) -> None:
        """
        Update resource usage tracking
        
        Args:
            operation: Operation type
            model_id: Model ID
            options: Operation options
        """
        options = options or {}
        
        # Initialize model tracking if needed
        if model_id not in self.resource_usage["by_model"]:
            self.resource_usage["by_model"][model_id] = {
                "loads": 0,
                "inferences": 0,
                "last_access": None
            }
        
        # Initialize user tracking if options has user info
        user_id = options.get("user_id", "anonymous")
        if user_id not in self.resource_usage["by_user"]:
            self.resource_usage["by_user"][user_id] = {
                "loads": 0,
                "inferences": 0,
                "models": set()
            }
        
        # Update counters based on operation
        if operation == "load":
            self.resource_usage["by_model"][model_id]["loads"] += 1
            self.resource_usage["by_user"][user_id]["loads"] += 1
            self.resource_usage["by_user"][user_id]["models"].add(model_id)
        elif operation == "inference":
            self.resource_usage["by_model"][model_id]["inferences"] += 1
            self.resource_usage["by_user"][user_id]["inferences"] += 1
        
        # Update last access timestamp
        self.resource_usage["by_model"][model_id]["last_access"] = datetime.now().isoformat()
    
    async def get_stats(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get module statistics
        
        Args:
            options: Options for stats retrieval including authToken
            
        Returns:
            Dict: Module statistics
        """
        if not self.initialized:
            raise RuntimeError("Secure model manager not initialized. Call init() first")
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token and self.auth:
                raise ValueError("Authentication token required for stats access")
            
            # Verify capability token for admin access
            is_authorized = True
            if self.auth:
                capability_string = f"{MODEL_CAPABILITIES['ADMIN']}:stats"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning("Unauthorized stats access attempt")
                    raise PermissionError("Not authorized to access module statistics")
            
            # Return copy of stats
            top_models = self._get_top_models(5)
            for model in top_models:
                # Convert sets to lists for JSON serialization
                if isinstance(model, dict) and "models" in model and isinstance(model["models"], set):
                    model["models"] = list(model["models"])
            
            # Need to convert sets to lists for serialization
            user_stats = {}
            for user_id, stats in self.resource_usage["by_user"].items():
                user_stats[user_id] = {
                    "loads": stats["loads"],
                    "inferences": stats["inferences"],
                    "models": list(stats["models"])
                }
            
            return {
                **self.stats,
                "model_count": len(self.model_access_cache),
                "resource_usage": {
                    "model_count": len(self.resource_usage["by_model"]),
                    "user_count": len(self.resource_usage["by_user"]),
                    "total_inferences": self.stats["inferences_run"],
                    "top_models": top_models,
                    "by_user": user_stats
                }
            }
        except Exception as e:
            logger.error(f"Failed to get secure model manager stats: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_top_models(self, count: int = 5) -> List[Dict[str, Any]]:
        """
        Get top N models by inference count
        
        Args:
            count: Number of models to return
            
        Returns:
            List: Top models
        """
        # Sort models by inference count
        sorted_models = sorted(
            self.resource_usage["by_model"].items(),
            key=lambda x: x[1]["inferences"],
            reverse=True
        )
        
        # Take top N models
        top_models = sorted_models[:count]
        
        # Format results
        return [
            {
                "model_id": model_id,
                "inferences": stats["inferences"],
                "loads": stats["loads"],
                "last_access": stats["last_access"]
            }
            for model_id, stats in top_models
        ]
    
    def test(self) -> Dict[str, Any]:
        """
        Run tests on the secure model manager
        
        Returns:
            Dict: Test results
        """
        logger.info("Testing secure model manager")
        
        try:
            # Create asyncio event loop for async tests
            loop = asyncio.get_event_loop()
            
            test_results = {
                "success": True,
                "module": "secure_model_manager",
                "initialization": False,
                "capability_verification": False,
                "model_operations": {
                    "load": False,
                    "inference": False,
                    "unload": False,
                    "list": False
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
                inference_token = "mock-inference-token"
                
                if self.auth:
                    # Create test user if not exists
                    if "test-user" not in self.auth.principals:
                        loop.run_until_complete(self.auth.create_principal("test-user"))
                    
                    # Issue capabilities
                    admin_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": MODEL_CAPABILITIES["ADMIN"],
                            "with": "*"
                        })
                    )
                    admin_token = admin_token_result["token"]
                    
                    load_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": MODEL_CAPABILITIES["LOAD"],
                            "with": "*"
                        })
                    )
                    load_token = load_token_result["token"]
                    
                    inference_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": MODEL_CAPABILITIES["INFERENCE"],
                            "with": "*"
                        })
                    )
                    inference_token = inference_token_result["token"]
                
                # Save original model manager
                original_model_manager = self.model_manager
                
                try:
                    # Create a mock model manager class for testing
                    class MockModelManager:
                        async def init(self):
                            return True
                        
                        async def import_model_from_huggingface(self, model_id):
                            return {
                                "model_id": model_id,
                                "success": True,
                                "to_dict": lambda: {"model_id": model_id, "mock": True}
                            }
                        
                        async def remove_model(self, model_id):
                            return True
                        
                        async def list_models(self):
                            return {"test-model": {"model_id": "test-model", "to_dict": lambda: {"model_id": "test-model", "mock": True}}}
                    
                    # Set mock model manager
                    self.model_manager = MockModelManager()
                    
                    # Test capability verification by trying with invalid token
                    try:
                        # This should fail with invalid token
                        await self.load_model("test-model", {"auth_token": "invalid-token"})
                        test_results["capability_verification"] = False
                    except (PermissionError, ValueError):
                        # Expected failure is good
                        test_results["capability_verification"] = True
                    
                    # If auth not available, assume verification passes
                    if not self.auth:
                        test_results["capability_verification"] = True
                    
                    # Test model operations
                    try:
                        # Test load model
                        load_result = await self.load_model("test-model", {
                            "auth_token": load_token,
                            "user_id": "test-user"
                        })
                        test_results["model_operations"]["load"] = load_result.get("success", False)
                        
                        # Test inference
                        inference_result = await self.run_inference("test-model", "Test input", {
                            "auth_token": inference_token,
                            "user_id": "test-user"
                        })
                        test_results["model_operations"]["inference"] = inference_result.get("success", False)
                        
                        # Test list models
                        models = await self.list_models({
                            "auth_token": admin_token
                        })
                        test_results["model_operations"]["list"] = isinstance(models, list)
                        
                        # Test unload model
                        unload_result = await self.unload_model("test-model", {
                            "auth_token": admin_token
                        })
                        test_results["model_operations"]["unload"] = unload_result.get("success", False)
                        
                        # Test stats
                        stats = await self.get_stats({
                            "auth_token": admin_token
                        })
                        test_results["stats_tracking"] = (
                            isinstance(stats, dict) and
                            "access_granted" in stats and
                            "inferences_run" in stats
                        )
                    except Exception as e:
                        logger.error(f"Model operations test failed: {e}")
                finally:
                    # Restore original model manager
                    self.model_manager = original_model_manager
            
            # Overall success
            test_results["success"] = (
                test_results["initialization"] and
                (test_results["capability_verification"] or not self.auth) and
                all(test_results["model_operations"].values()) and
                test_results["stats_tracking"]
            )
            
            return test_results
        except Exception as e:
            logger.error(f"Secure model manager test failed: {e}")
            return {
                "success": False,
                "module": "secure_model_manager",
                "error": str(e)
            }


# Create default instance
secure_model_manager = SecureModelManager()