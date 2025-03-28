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
logger = logging.getLogger("ipfs_transformers")

# Try to import IPFS Kit and Model Manager
try:
    from .ipfs_kit import IPFSKit, ipfs_kit
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import IPFSKit, some functionality will be limited")
    has_ipfs_kit = False

try:
    from .ipfs_model_manager import IPFSModelManager, ipfs_model_manager
    has_model_manager = True
except ImportError:
    logger.warning("Could not import IPFSModelManager, some functionality will be limited")
    has_model_manager = False

# Try to import transformers
try:
    import torch
    import transformers
    from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM, pipeline
    has_transformers = True
except ImportError:
    logger.warning("Could not import transformers, functionality will be limited")
    has_transformers = False

class IPFSTransformers:
    """
    IPFS Transformers for running transformer models via IPFS
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize IPFS Transformers
        
        Args:
            resources (dict): Resources required
            metadata (dict): Metadata for transformers operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Default model if specified
        self.default_model = self.metadata.get('model', None)
        
        # Default task if specified
        self.default_task = self.metadata.get('task', 'text-generation')
        
        # Device configuration
        self.device = self.metadata.get('device', 'cpu')
        if self.device == 'auto':
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
            
        # Cache directory
        self.cache_dir = self.metadata.get('cacheDir', os.path.expanduser("~/.cache/huggingface"))
        
        # Model registry is used to keep track of loaded models
        self.model_registry = {}
        
        # Active model and tokenizer
        self.active_model = None
        self.active_tokenizer = None
        self.active_model_id = None
        self.active_pipeline = None
        
        # IPFS Model Manager for model discovery
        if has_model_manager:
            if 'modelManager' in self.resources:
                self.model_manager = self.resources['modelManager']
            else:
                self.model_manager = ipfs_model_manager
        else:
            self.model_manager = None
            
        self.initialized = False
        logger.info(f"IPFSTransformers initialized with device={self.device}, cache_dir={self.cache_dir}")
        
    async def init(self):
        """Initialize transformers and load default model if specified"""
        try:
            if not has_transformers:
                logger.error("Cannot initialize: transformers not installed")
                return False
                
            # Initialize model manager if available
            if self.model_manager and not self.model_manager.initialized:
                await self.model_manager.init()
                
            # Load default model if specified
            if self.default_model:
                await self.load_model(self.default_model)
                
            self.initialized = True
            logger.info("IPFSTransformers initialized successfully")
            return True
        except Exception as e:
            logger.error(f"IPFSTransformers initialization failed: {e}")
            return False
            
    async def load_model(self, model_id: str, task: str = None) -> bool:
        """
        Load a transformer model
        
        Args:
            model_id (str): Model ID to load
            task (str, optional): Task for the model (text-generation, etc.)
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not has_transformers:
            logger.error("Cannot load model: transformers not installed")
            return False
            
        if not self.initialized:
            await self.init()
            
        try:
            logger.info(f"Loading model: {model_id}")
            
            # Use model manager to fetch model if available
            model_path = model_id
            if self.model_manager:
                model_info = await self.model_manager.get_model_info(model_id)
                if model_info:
                    model_path = model_info.local_path
                    logger.info(f"Using local model path: {model_path}")
                else:
                    # Try to import model if not found locally
                    logger.info(f"Model {model_id} not found locally, attempting to import")
                    model_info = await self.model_manager.import_model_from_huggingface(model_id)
                    if model_info:
                        model_path = model_info.local_path
                        logger.info(f"Imported model path: {model_path}")
            
            # Determine task if not provided
            effective_task = task or self.default_task
            
            # Load tokenizer
            tokenizer = AutoTokenizer.from_pretrained(model_path, cache_dir=self.cache_dir)
            
            # Load model based on task
            model = None
            pipeline_obj = None
            
            if effective_task == 'text-generation':
                model = AutoModelForCausalLM.from_pretrained(
                    model_path, 
                    cache_dir=self.cache_dir, 
                    device_map=self.device
                )
                pipeline_obj = pipeline(
                    task=effective_task,
                    model=model,
                    tokenizer=tokenizer,
                    device=0 if self.device == 'cuda' else -1
                )
            else:
                # Default to auto model and pipeline
                model = AutoModel.from_pretrained(
                    model_path, 
                    cache_dir=self.cache_dir,
                    device_map=self.device
                )
                pipeline_obj = pipeline(
                    task=effective_task,
                    model=model,
                    tokenizer=tokenizer,
                    device=0 if self.device == 'cuda' else -1
                )
            
            # Update active model
            self.active_model = model
            self.active_tokenizer = tokenizer
            self.active_model_id = model_id
            self.active_pipeline = pipeline_obj
            
            # Add to registry
            self.model_registry[model_id] = {
                'model': model,
                'tokenizer': tokenizer,
                'pipeline': pipeline_obj,
                'task': effective_task
            }
            
            logger.info(f"Successfully loaded model {model_id} for task {effective_task}")
            return True
        except Exception as e:
            logger.error(f"Failed to load model {model_id}: {e}")
            return False
            
    async def run_inference(self, input_text: str, model_id: str = None, 
                          task: str = None, params: Dict = None) -> Dict:
        """
        Run inference with a transformer model
        
        Args:
            input_text (str): Input text for inference
            model_id (str, optional): Model ID to use, defaults to active model
            task (str, optional): Task for the model
            params (dict, optional): Additional parameters for inference
            
        Returns:
            dict: Inference results
        """
        if not has_transformers:
            logger.error("Cannot run inference: transformers not installed")
            return {"error": "transformers not installed"}
            
        if not self.initialized:
            await self.init()
            
        # Load model if specified and not active
        if model_id and model_id != self.active_model_id:
            success = await self.load_model(model_id, task)
            if not success:
                return {"error": f"Failed to load model {model_id}"}
                
        # Make sure we have an active model
        if not self.active_model or not self.active_pipeline:
            return {"error": "No active model"}
            
        try:
            logger.info(f"Running inference with model {self.active_model_id}")
            
            # Get inference parameters
            inference_params = params or {}
            
            # Run inference with pipeline
            results = self.active_pipeline(input_text, **inference_params)
            
            return {
                "model_id": self.active_model_id,
                "input": input_text,
                "results": results
            }
        except Exception as e:
            logger.error(f"Inference failed: {e}")
            return {"error": str(e)}
            
    def test(self):
        """
        Test IPFS Transformers functionality
        
        Returns:
            dict: Test results
        """
        logger.info("Testing IPFS Transformers")
        
        try:
            # Check for transformers
            if not has_transformers:
                return {
                    "success": False,
                    "module": "transformers",
                    "error": "transformers not installed",
                    "initialization": False,
                    "model_loading": False,
                    "inference": False,
                    "capabilities": {
                        "transformers": False,
                        "model_manager": has_model_manager,
                        "torch": "torch" in sys.modules
                    },
                    "metadata": self.metadata
                }
                
            # Run tests
            loop = asyncio.get_event_loop()
            
            # Test initialization
            if not self.initialized:
                init_result = loop.run_until_complete(self.init())
            else:
                init_result = True
                
            # Test model loading
            model_load_test = False
            inference_test = False
            
            try:
                # Use a tiny test model
                test_model = "hf-internal-testing/tiny-random-bert"
                model_load_test = loop.run_until_complete(
                    self.load_model(test_model, task="feature-extraction")
                )
                
                # Test inference if model loaded
                if model_load_test:
                    inference_result = loop.run_until_complete(
                        self.run_inference("This is a test", test_model)
                    )
                    inference_test = "error" not in inference_result
            except Exception as e:
                logger.error(f"Model load/inference test failed: {e}")
            
            # Compile results
            results = {
                "success": init_result and model_load_test and inference_test,
                "module": "transformers",
                "initialization": init_result,
                "model_loading": model_load_test,
                "inference": inference_test,
                "capabilities": {
                    "transformers": has_transformers,
                    "model_manager": has_model_manager,
                    "torch": "torch" in sys.modules,
                    "cuda": torch.cuda.is_available() if "torch" in sys.modules else False
                },
                "active_model": self.active_model_id,
                "device": self.device,
                "metadata": self.metadata
            }
            
            return results
        except Exception as e:
            logger.error(f"IPFS Transformers test failed: {e}")
            return {
                "success": False,
                "module": "transformers",
                "error": str(e),
                "initialization": self.initialized,
                "model_loading": False,
                "inference": False,
                "capabilities": {
                    "transformers": has_transformers,
                    "model_manager": has_model_manager,
                    "torch": "torch" in sys.modules,
                    "cuda": torch.cuda.is_available() if "torch" in sys.modules else False
                },
                "metadata": self.metadata
            }

# Create default instance
ipfs_transformers = IPFSTransformers()