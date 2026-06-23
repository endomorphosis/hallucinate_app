import os
import json
import logging
import sys
import tempfile
import shutil
import asyncio
import time
from pathlib import Path
import requests
from typing import Dict, List, Optional, Union, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_model_manager")

# Try to import IPFS Kit
try:
    from .ipfs_kit import IPFSKit, ipfs_kit
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import IPFSKit, some functionality will be limited")
    has_ipfs_kit = False

# Try to import HuggingFace Hub
try:
    import huggingface_hub
    from huggingface_hub import HfApi, snapshot_download
    has_huggingface_hub = True
except ImportError:
    logger.warning("Could not import huggingface_hub, some functionality will be limited")
    has_huggingface_hub = False

class ModelMetadata:
    """Model metadata container"""
    def __init__(self, model_id: str = "", 
                 model_type: str = "",
                 task: str = "",
                 cids: Dict[str, str] = None,
                 local_path: str = "",
                 size_bytes: int = 0,
                 config: Dict[str, Any] = None):
        self.model_id = model_id
        self.model_type = model_type
        self.task = task
        self.cids = cids or {}  # Map of filename -> CID
        self.local_path = local_path
        self.size_bytes = size_bytes
        self.config = config or {}
        
    def to_dict(self) -> Dict:
        """Convert to dictionary representation"""
        return {
            "model_id": self.model_id,
            "model_type": self.model_type,
            "task": self.task,
            "cids": self.cids,
            "local_path": self.local_path,
            "size_bytes": self.size_bytes,
            "config": self.config
        }
        
    @classmethod
    def from_dict(cls, data: Dict) -> 'ModelMetadata':
        """Create from dictionary representation"""
        return cls(
            model_id=data.get("model_id", ""),
            model_type=data.get("model_type", ""),
            task=data.get("task", ""),
            cids=data.get("cids", {}),
            local_path=data.get("local_path", ""),
            size_bytes=data.get("size_bytes", 0),
            config=data.get("config", {})
        )

class IPFSModelManager:
    """
    IPFS Model Manager for managing AI models via IPFS
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize IPFS Model Manager
        
        Args:
            resources (dict): Resources required by the manager
            metadata (dict): Metadata for model operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Get model path from metadata or default
        self.models_path = self.metadata.get('localPath', os.path.expanduser("~/.cache/huggingface"))
        if not os.path.exists(self.models_path):
            os.makedirs(self.models_path, exist_ok=True)
            
        # Get role from metadata or default to leecher
        self.role = self.metadata.get('role', 'leecher')
        if self.role not in ['master', 'worker', 'leecher']:
            logger.warning(f"Invalid role '{self.role}', defaulting to 'leecher'")
            self.role = 'leecher'
        
        # Model registry is the in-memory database of models
        self.model_registry = {}
        
        # IPFS Kit instance for model storage
        if has_ipfs_kit:
            if 'ipfsKit' in self.resources:
                self.ipfs_kit = self.resources['ipfsKit']
            else:
                self.ipfs_kit = ipfs_kit
        else:
            self.ipfs_kit = None
            
        # HuggingFace Hub API
        self.hf_api = HfApi() if has_huggingface_hub else None
        
        self.initialized = False
        self.registry_loaded = False
        
        logger.info(f"IPFSModelManager initialized with role={self.role}, path={self.models_path}")
        
    async def init(self):
        """Initialize model manager and load model registry"""
        try:
            # Make sure IPFS is available if we need it
            if self.ipfs_kit and self.role != 'leecher':
                await self.ipfs_kit.init()
                
            # Load registry
            await self.load_registry()
            
            self.initialized = True
            logger.info("IPFSModelManager initialized successfully")
            return True
        except Exception:
            logger.exception("IPFSModelManager initialization failed")
            return False
        
    async def load_registry(self):
        """Load model registry from local storage"""
        registry_path = os.path.join(self.models_path, "model_registry.json")
        
        if os.path.exists(registry_path):
            try:
                with open(registry_path, 'r') as f:
                    raw_registry = json.load(f)
                    
                self.model_registry = {}
                for model_id, model_data in raw_registry.items():
                    self.model_registry[model_id] = ModelMetadata.from_dict(model_data)
                    
                self.registry_loaded = True
                logger.info(f"Loaded {len(self.model_registry)} models from registry")
                return True
            except Exception:
                logger.exception("Failed to load model registry")
                self.model_registry = {}
                return False
        else:
            logger.info("No model registry found, creating new one")
            self.model_registry = {}
            self.registry_loaded = True
            return True
            
    async def save_registry(self):
        """Save model registry to local storage"""
        registry_path = os.path.join(self.models_path, "model_registry.json")
        
        try:
            # Convert registry to serializable dict
            serialized_registry = {}
            for model_id, model_metadata in self.model_registry.items():
                serialized_registry[model_id] = model_metadata.to_dict()
                
            # Save to file
            with open(registry_path, 'w') as f:
                json.dump(serialized_registry, f, indent=2)
                
            logger.info(f"Saved {len(self.model_registry)} models to registry")
            return True
        except Exception:
            logger.exception("Failed to save model registry")
            return False
            
    async def list_models(self) -> Dict[str, ModelMetadata]:
        """List all models in the registry"""
        if not self.initialized:
            await self.init()
            
        return self.model_registry
        
    async def get_model_info(self, model_id: str) -> Optional[ModelMetadata]:
        """Get information about a specific model"""
        if not self.initialized:
            await self.init()
            
        return self.model_registry.get(model_id)
        
    async def import_model_from_huggingface(self, model_id: str) -> Optional[ModelMetadata]:
        """
        Import a model from HuggingFace Hub
        
        Args:
            model_id (str): HuggingFace model ID
            
        Returns:
            ModelMetadata: Metadata for the imported model, or None if failed
        """
        if not self.initialized:
            await self.init()
            
        if not has_huggingface_hub:
            logger.error("Cannot import from HuggingFace: huggingface_hub not installed")
            return None
            
        model_dir = os.path.join(self.models_path, model_id)
        pre_existing_dir = os.path.exists(model_dir)
        try:
            # Check if model already exists
            if model_id in self.model_registry:
                logger.info(f"Model {model_id} already in registry, updating")
                
            # Download model
            logger.info(f"Downloading model {model_id} from HuggingFace Hub")
            
            os.makedirs(model_dir, exist_ok=True)
            
            local_path = snapshot_download(
                repo_id=model_id,
                local_dir=model_dir,
                local_dir_use_symlinks=False
            )
            
            # Get model info
            model_info = self.hf_api.model_info(model_id)
            
            # Calculate size
            total_size = 0
            file_cids = {}
            for root, _, files in os.walk(local_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, local_path)
                    file_size = os.path.getsize(file_path)
                    total_size += file_size
                    
                    # Add to IPFS if we have it available
                    if self.ipfs_kit and self.role == 'master':
                        try:
                            logger.info(f"Adding {rel_path} to IPFS")
                            result = await self.ipfs_kit.add_to_ipfs(open(file_path, 'rb').read())
                            if result and 'cid' in result:
                                file_cids[rel_path] = result['cid']
                        except Exception:
                            logger.exception(f"Failed to add {rel_path} to IPFS")
            
            # Create model metadata
            model_metadata = ModelMetadata(
                model_id=model_id,
                model_type=model_info.pipeline_tag or "",
                task=model_info.pipeline_tag or "",
                cids=file_cids,
                local_path=local_path,
                size_bytes=total_size,
                config={
                    "description": model_info.description or "",
                    "author": model_info.author or "",
                    "tags": model_info.tags or []
                }
            )
            
            # Add to registry
            self.model_registry[model_id] = model_metadata
            
            # Save registry
            await self.save_registry()
            
            return model_metadata
            
        except Exception as e:  # noqa: BLE001 – intentionally returns None so callers can handle gracefully
            logger.exception(f"Failed to import model {model_id}: {e}")
            # Clean up any partially-created model directory to avoid leaving
            # corrupted state on disk when the directory was created by this call.
            if not pre_existing_dir and os.path.isdir(model_dir):
                try:
                    shutil.rmtree(model_dir)
                    logger.debug(f"Cleaned up partial model directory: {model_dir}")
                except OSError:
                    logger.warning(f"Could not clean up partial model directory: {model_dir}")
            return None
            
    async def import_model_from_ipfs(self, model_id: str, cid: str) -> Optional[ModelMetadata]:
        """
        Import a model from IPFS
        
        Args:
            model_id (str): Model ID to use in registry
            cid (str): IPFS CID for the model
            
        Returns:
            ModelMetadata: Metadata for the imported model, or None if failed
        """
        if not self.initialized:
            await self.init()
            
        if not self.ipfs_kit:
            logger.error("Cannot import from IPFS: IPFS Kit not available")
            return None
            
        model_dir = os.path.join(self.models_path, model_id)
        pre_existing_dir = os.path.exists(model_dir)
        try:
            # Check if model already exists
            if model_id in self.model_registry:
                logger.info(f"Model {model_id} already in registry, updating")
                
            # Create model directory
            os.makedirs(model_dir, exist_ok=True)
            
            # Download from IPFS
            logger.info(f"Downloading model {model_id} from IPFS (CID: {cid})")
            
            result = await self.ipfs_kit.fetch_from_ipfs(cid, model_dir)
            
            if not result:
                logger.error(f"Failed to fetch model {model_id} from IPFS")
                return None
                
            # Create minimal metadata
            model_metadata = ModelMetadata(
                model_id=model_id,
                local_path=model_dir,
                cids={model_id: cid}
            )
            
            # Add to registry
            self.model_registry[model_id] = model_metadata
            
            # Save registry
            await self.save_registry()
            
            return model_metadata
            
        except Exception as e:  # noqa: BLE001 – intentionally returns None so callers can handle gracefully
            logger.exception(f"Failed to import model {model_id} from IPFS: {e}")
            # Clean up any partially-created model directory to avoid leaving
            # corrupted state on disk when the directory was created by this call.
            if not pre_existing_dir and os.path.isdir(model_dir):
                try:
                    shutil.rmtree(model_dir)
                    logger.debug(f"Cleaned up partial model directory: {model_dir}")
                except OSError:
                    logger.warning(f"Could not clean up partial model directory: {model_dir}")
            return None
            
    async def remove_model(self, model_id: str) -> bool:
        """
        Remove a model from the registry and optionally from disk
        
        Args:
            model_id (str): Model ID to remove
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.initialized:
            await self.init()
            
        if model_id not in self.model_registry:
            logger.warning(f"Model {model_id} not found in registry")
            return False
            
        try:
            # Get model path
            model_metadata = self.model_registry[model_id]
            local_path = model_metadata.local_path
            
            # Remove from registry
            del self.model_registry[model_id]
            
            # Save registry
            await self.save_registry()
            
            # Remove from disk if path exists
            if local_path and os.path.exists(local_path):
                if os.path.isdir(local_path):
                    shutil.rmtree(local_path)
                else:
                    os.remove(local_path)
                    
            return True
        except Exception:
            logger.exception(f"Failed to remove model {model_id}")
            return False
    
    def test(self):
        """
        Test IPFS Model Manager functionality
        
        Returns:
            dict: Test results
        """
        logger.info("Testing IPFS Model Manager")
        
        try:
            # Run tests
            loop = asyncio.get_event_loop()
            
            # Test initialization
            if not self.initialized:
                init_result = loop.run_until_complete(self.init())
            else:
                init_result = True
                
            # Test model registry
            registry_test = loop.run_until_complete(self.load_registry())
            
            # Test listing models
            models = loop.run_until_complete(self.list_models())
            list_models_test = isinstance(models, dict)
            
            # Test importing a model if HuggingFace Hub is available
            hf_import_test = False
            if has_huggingface_hub:
                try:
                    # Use a tiny test model
                    test_model = "hf-internal-testing/tiny-random-bert"
                    model_metadata = loop.run_until_complete(
                        self.import_model_from_huggingface(test_model)
                    )
                    hf_import_test = model_metadata is not None
                    
                    # Clean up test model
                    if hf_import_test:
                        loop.run_until_complete(self.remove_model(test_model))
                except Exception:
                    logger.exception("HuggingFace import test failed")
            
            # Test IPFS import if available
            ipfs_import_test = False
            ipfs_import_error = None
            if self.ipfs_kit:
                test_file = None
                try:
                    # Create a test file to add to IPFS
                    with tempfile.NamedTemporaryFile(delete=False) as f:
                        f.write(b"test model file")
                        test_file = f.name
                    
                    # Add to IPFS    
                    ipfs_result = loop.run_until_complete(
                        self.ipfs_kit.add_to_ipfs(b"test model file")
                    )
                    
                    if ipfs_result and 'cid' in ipfs_result:
                        # Import from IPFS
                        test_model_id = "test-ipfs-model"
                        model_metadata = loop.run_until_complete(
                            self.import_model_from_ipfs(test_model_id, ipfs_result['cid'])
                        )
                        ipfs_import_test = model_metadata is not None
                        
                        # Clean up
                        if ipfs_import_test:
                            loop.run_until_complete(self.remove_model(test_model_id))
                        
                except Exception as exc:
                    # Self-tests return partial failures to callers, but keep the
                    # original traceback in logs for debugging.
                    ipfs_import_error = str(exc)
                    logger.exception("IPFS import test failed")
                finally:
                    # Always clean up the temp file, even on exception
                    if test_file is not None:
                        try:
                            os.unlink(test_file)
                        except OSError:
                            logger.warning(
                                "Could not remove temporary test file %s",
                                test_file,
                                exc_info=True,
                            )
            
            # Compile results
            ipfs_import_result = {"success": ipfs_import_test}
            if ipfs_import_error is not None:
                ipfs_import_result["error"] = ipfs_import_error
            results = {
                "success": init_result and registry_test and list_models_test,
                "module": "model_manager",
                "initialization": init_result,
                "registry": registry_test,
                "list_models": list_models_test,
                "imports": {
                    "huggingface": hf_import_test,
                    "ipfs": ipfs_import_test,
                    "ipfs_details": ipfs_import_result,
                },
                "capabilities": {
                    "huggingface": has_huggingface_hub,
                    "ipfs": self.ipfs_kit is not None
                },
                "metadata": self.metadata
            }
            
            return results
        except Exception as e:
            logger.exception("IPFS Model Manager test failed")
            return {
                "success": False,
                "module": "model_manager",
                "error": str(e),
                "initialization": self.initialized,
                "registry": False,
                "list_models": False,
                "imports": {
                    "huggingface": False,
                    "ipfs": False
                },
                "capabilities": {
                    "huggingface": has_huggingface_hub,
                    "ipfs": self.ipfs_kit is not None
                },
                "metadata": self.metadata
            }

# Create default instance
ipfs_model_manager = IPFSModelManager()
