import os
import json
import logging
import sys
import tempfile
import shutil
import asyncio
import time
from pathlib import Path
from typing import Dict, List, Optional, Union, Any, Callable

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
    from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM, pipeline, AutoProcessor
    has_transformers = True
except ImportError:
    logger.warning("Could not import transformers, functionality will be limited")
    has_transformers = False
    
# Try to import ipfs_accelerate_py
try:
    import ipfs_accelerate_py
    has_ipfs_accelerate = True
    logger.info("Successfully imported ipfs_accelerate_py")
except ImportError:
    logger.warning("Could not import ipfs_accelerate_py, hardware acceleration will be limited")
    has_ipfs_accelerate = False

class IPFSTransformers:
    """
    IPFS Transformers for running transformer models via IPFS
    
    This module provides integration with the ipfs_accelerate_py package for hardware-accelerated
    inference across multiple backends (CPU, GPU, OpenVINO, WebNN, WebGPU).
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
        
        # Role configuration for IPFS (master, worker, leecher)
        self.role = self.metadata.get('role', 'leecher')
        if self.role not in ['master', 'worker', 'leecher']:
            logger.warning(f"Invalid role '{self.role}', defaulting to 'leecher'")
            self.role = 'leecher'
        
        # Device configuration
        self.device = self.metadata.get('device', 'cpu')
        if self.device == 'auto':
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
            
        # Cache directory
        self.cache_dir = self.metadata.get('cacheDir', os.path.expanduser("~/.cache/huggingface"))
        
        # Model registry is used to keep track of loaded models
        self.model_registry = {}
        
        # Active model information
        self.active_model = None
        self.active_tokenizer = None
        self.active_model_id = None
        self.active_pipeline = None
        
        # Hardware capabilities (will be updated during init)
        self.hardware_capabilities = {
            "cuda": torch.cuda.is_available() if has_transformers else False,
            "openvino": False,
            "cpu": True,
            "webnn": False,
            "webgpu": False
        }
        
        # IPFS Model Manager for model discovery
        if has_model_manager:
            if 'modelManager' in self.resources:
                self.model_manager = self.resources['modelManager']
            else:
                self.model_manager = ipfs_model_manager
        else:
            self.model_manager = None
        
        # IPFS Accelerate for hardware acceleration
        if has_ipfs_accelerate:
            if 'ipfs_accelerate' in self.resources:
                self.ipfs_accelerate = self.resources['ipfs_accelerate']
            else:
                try:
                    # Try to get the global instance or create a new one
                    self.ipfs_accelerate = ipfs_accelerate_py.get_instance()
                    if self.ipfs_accelerate is None:
                        self.ipfs_accelerate = ipfs_accelerate_py.ipfs_accelerate_py(
                            resources=self.resources, 
                            metadata={"role": self.role}
                        )
                    self.resources['ipfs_accelerate'] = self.ipfs_accelerate
                    logger.info("IPFS Accelerate initialized")
                except Exception as e:
                    logger.error(f"Failed to initialize IPFS Accelerate: {e}")
                    self.ipfs_accelerate = None
        else:
            self.ipfs_accelerate = None
        
        # Authorization manager if available
        if 'auth' in self.resources:
            self.auth = self.resources['auth']
        else:
            self.auth = None
        
        self.initialized = False
        logger.info(f"IPFSTransformers initialized with device={self.device}, cache_dir={self.cache_dir}")
        
    async def init(self):
        """Initialize transformers and load default model if specified"""
        try:
            # Initialize IPFS Accelerate if available
            if self.ipfs_accelerate:
                try:
                    # If no models are specified in metadata, create a default list
                    models_to_load = self.metadata.get('models', [])
                    if self.default_model and self.default_model not in models_to_load:
                        models_to_load.append(self.default_model)
                    
                    # Detect hardware capabilities through ipfs_accelerate
                    try:
                        self.hardware_capabilities = await self.ipfs_accelerate.test_hardware()
                        logger.info(f"Hardware capabilities detected: {self.hardware_capabilities}")
                    except Exception as e:
                        logger.error(f"Error detecting hardware capabilities: {e}")
                        # Try synchronous call as fallback
                        try:
                            self.hardware_capabilities = self.ipfs_accelerate.test_hardware()
                            logger.info(f"Hardware capabilities detected (sync): {self.hardware_capabilities}")
                        except Exception as e:
                            logger.error(f"Error detecting hardware capabilities (sync): {e}")
                    
                    # Configure endpoints for the models
                    if models_to_load:
                        # Create a list of suitable endpoints based on hardware capabilities
                        endpoints = []
                        if self.hardware_capabilities.get('cuda', False):
                            endpoints.append("cuda:0")
                        if self.hardware_capabilities.get('openvino', False):
                            endpoints.append("openvino:0")
                        endpoints.append("cpu")  # Always include CPU as fallback
                        
                        # Create endpoint configurations
                        local_endpoints = []
                        for model in models_to_load:
                            for endpoint in endpoints:
                                local_endpoints.append([model, endpoint, 2048])  # Use default context length of 2048
                        
                        # Initialize the endpoints
                        resources = {"local_endpoints": local_endpoints}
                        try:
                            await self.ipfs_accelerate.init_endpoints(models_to_load, resources)
                            logger.info(f"Initialized endpoints for models: {models_to_load}")
                        except Exception as e:
                            logger.error(f"Failed to initialize endpoints: {e}")
                except Exception as e:
                    logger.error(f"Error initializing IPFS Accelerate: {e}")
                
            # Initialize model manager if available
            if self.model_manager and not self.model_manager.initialized:
                try:
                    await self.model_manager.init()
                    logger.info("Model manager initialized successfully")
                except Exception as e:
                    logger.error(f"Failed to initialize model manager: {e}")
                
            # Initialize transformers if needed
            if not has_transformers:
                logger.warning("Transformers not installed, will use IPFS Accelerate for inference")
                
            # Load default model if specified and we have transformers
            if self.default_model and has_transformers and not self.ipfs_accelerate:
                await self.load_model(self.default_model)
                
            self.initialized = True
            logger.info("IPFSTransformers initialized successfully")
            return True
        except Exception as e:
            logger.error(f"IPFSTransformers initialization failed: {e}")
            return False
            
    async def load_model(self, model_id: str, task: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Load a transformer model
        
        Args:
            model_id (str): Model ID to load
            task (str, optional): Task for the model (text-generation, etc.)
            options (dict, optional): Additional loading options:
                - auth_token: UCAN token for authorization
                - device: Hardware device to use (e.g., 'cpu', 'cuda:0', 'openvino:0')
                - from_ipfs: Whether to load from IPFS (requires model_manager)
                - cid: IPFS CID for the model (if from_ipfs=True)
            
        Returns:
            dict: Result of the model loading operation with details
        """
        if not self.initialized:
            await self.init()
            
        options = options or {}
        effective_task = task or self.default_task
        result = {"success": False, "model_id": model_id, "task": effective_task}
        
        # Check if auth is required and provided
        if self.auth and "auth_token" not in options:
            logger.error("Auth token required but not provided")
            result["error"] = "Auth token required"
            return result
            
        # Validate auth token if available
        if self.auth and "auth_token" in options:
            try:
                capability = "model:load"
                auth_result = await self.auth.verify_capability(
                    options["auth_token"], 
                    capability,
                    {"model_id": model_id}
                )
                
                if not auth_result.get("valid", False):
                    error_msg = f"Auth validation failed: {auth_result.get('reason', 'Not authorized')}"
                    logger.error(error_msg)
                    result["error"] = error_msg
                    return result
                    
                logger.info(f"Auth validated for {capability} on {model_id}")
            except Exception as e:
                logger.error(f"Auth validation error: {e}")
                result["error"] = f"Auth validation error: {str(e)}"
                return result
                
        try:
            logger.info(f"Loading model: {model_id}")
            
            # First try loading with IPFS Accelerate if available
            if self.ipfs_accelerate:
                try:
                    logger.info(f"Attempting to load model {model_id} via IPFS Accelerate")
                    
                    # First see if we need to load from IPFS using model manager
                    from_ipfs = options.get("from_ipfs", False)
                    model_cid = options.get("cid", None)
                    
                    if from_ipfs and model_cid and self.model_manager:
                        # Import from IPFS using model manager
                        logger.info(f"Importing model {model_id} from IPFS with CID {model_cid}")
                        model_metadata = await self.model_manager.import_model_from_ipfs(model_id, model_cid)
                        
                        if model_metadata:
                            logger.info(f"Successfully imported model {model_id} from IPFS")
                            if hasattr(model_metadata, 'to_dict'):
                                result["metadata"] = model_metadata.to_dict()
                            else:
                                result["metadata"] = model_metadata
                    
                    # Configure the endpoint for this model
                    device = options.get("device", self.device)
                    context_length = options.get("context_length", 2048)
                    
                    # Create endpoint configuration
                    local_endpoints = [[model_id, device, context_length]]
                    resources = {"local_endpoints": local_endpoints}
                    
                    # Initialize the endpoint
                    await self.ipfs_accelerate.init_endpoints([model_id], resources)
                    
                    # Add to model registry to track that it's loaded
                    self.model_registry[model_id] = {
                        "loaded_via": "ipfs_accelerate",
                        "device": device,
                        "context_length": context_length,
                        "task": effective_task
                    }
                    
                    logger.info(f"Model {model_id} loaded successfully via IPFS Accelerate")
                    result["success"] = True
                    result["device"] = device
                    result["accelerated"] = True
                    return result
                    
                except Exception as e:
                    logger.error(f"Failed to load model with IPFS Accelerate: {e}")
                    # Continue to try other methods
            
            # If we don't have transformers, we can't load directly
            if not has_transformers:
                logger.error("Cannot load model: transformers not installed and IPFS Accelerate failed")
                result["error"] = "Cannot load model: transformers not installed and IPFS Accelerate failed"
                return result
            
            # Fallback to direct loading with transformers
            logger.info(f"Loading model {model_id} directly with transformers")
            
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
                        if hasattr(model_info, 'to_dict'):
                            result["metadata"] = model_info.to_dict()
                        else:
                            result["metadata"] = model_info
            
            # Load tokenizer
            tokenizer = AutoTokenizer.from_pretrained(model_path, cache_dir=self.cache_dir)
            
            # Detect if model can be loaded with a processor
            try:
                processor = AutoProcessor.from_pretrained(model_path, cache_dir=self.cache_dir)
            except Exception:
                processor = None
            
            # Get device configuration
            device = options.get("device", self.device)
            if device.startswith("cuda") and torch.cuda.is_available():
                torch_device = torch.device(device)
            else:
                torch_device = torch.device("cpu")
            
            # Load model based on task
            model = None
            pipeline_obj = None
            
            if effective_task == 'text-generation':
                model = AutoModelForCausalLM.from_pretrained(
                    model_path, 
                    cache_dir=self.cache_dir, 
                    device_map=device
                )
                pipeline_obj = pipeline(
                    task=effective_task,
                    model=model,
                    tokenizer=tokenizer,
                    device=0 if device.startswith("cuda") else -1
                )
            else:
                # Default to auto model and pipeline
                model = AutoModel.from_pretrained(
                    model_path, 
                    cache_dir=self.cache_dir,
                    device_map=device
                )
                pipeline_obj = pipeline(
                    task=effective_task,
                    model=model,
                    tokenizer=tokenizer,
                    device=0 if device.startswith("cuda") else -1
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
                'processor': processor,
                'pipeline': pipeline_obj,
                'task': effective_task,
                'device': str(torch_device),
                'loaded_via': 'transformers'
            }
            
            logger.info(f"Successfully loaded model {model_id} for task {effective_task}")
            result["success"] = True
            result["device"] = str(torch_device)
            result["task"] = effective_task
            
            return result
        except Exception as e:
            logger.error(f"Failed to load model {model_id}: {e}")
            result["error"] = str(e)
            return result
            
    async def run_inference(self, inputs: Any, model_id: str = None, 
                          options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Run inference with a transformer model
        
        Args:
            inputs: Input data for inference (text, images, etc.)
            model_id (str, optional): Model ID to use, defaults to active model
            options (dict, optional): Inference options including:
                - auth_token: UCAN token for authorization
                - task: Task for the model (text-generation, etc.)
                - stream: Boolean to enable streaming responses
                - device: Hardware device override
                - generation_config: Parameters for text generation
                - max_length: Maximum generation length
                
        Returns:
            dict: Inference results
        """
        if not self.initialized:
            await self.init()
            
        options = options or {}
        effective_model_id = model_id or self.active_model_id
        result = {"success": False, "model_id": effective_model_id}
        
        if not effective_model_id:
            logger.error("No model specified or active")
            result["error"] = "No model specified or active"
            return result
            
        # Check if auth is required and provided
        if self.auth and "auth_token" not in options:
            logger.error("Auth token required but not provided")
            result["error"] = "Auth token required"
            return result
            
        # Validate auth token if available
        if self.auth and "auth_token" in options:
            try:
                capability = "model:inference"
                auth_result = await self.auth.verify_capability(
                    options["auth_token"], 
                    capability,
                    {"model_id": effective_model_id}
                )
                
                if not auth_result.get("valid", False):
                    error_msg = f"Auth validation failed: {auth_result.get('reason', 'Not authorized')}"
                    logger.error(error_msg)
                    result["error"] = error_msg
                    return result
                    
                logger.info(f"Auth validated for {capability} on {effective_model_id}")
            except Exception as e:
                logger.error(f"Auth validation error: {e}")
                result["error"] = f"Auth validation error: {str(e)}"
                return result
                
        # Check if model is loaded, and if not, try to load it
        if effective_model_id not in self.model_registry:
            logger.info(f"Model {effective_model_id} not loaded, attempting to load it")
            load_result = await self.load_model(
                effective_model_id, 
                task=options.get("task", self.default_task),
                options=options
            )
            
            if not load_result.get("success", False):
                logger.error(f"Failed to load model {effective_model_id}")
                return load_result
                
        # Get information about how the model was loaded
        model_info = self.model_registry[effective_model_id]
        loaded_via = model_info.get("loaded_via", "unknown")
        
        # Run inference based on how the model was loaded
        try:
            # First check if model was loaded via ipfs_accelerate
            if loaded_via == "ipfs_accelerate" and self.ipfs_accelerate:
                logger.info(f"Running inference with model {effective_model_id} via IPFS Accelerate")
                
                # Check if streaming is requested
                if options.get("stream", False):
                    # Set up a streaming generator
                    async def stream_generator():
                        try:
                            stream_result = await self.ipfs_accelerate.infer(
                                effective_model_id, 
                                inputs
                            )
                            
                            # Yield the result
                            if isinstance(stream_result, dict) and "infer" in stream_result:
                                yield stream_result["infer"]
                            else:
                                yield stream_result
                        except Exception as e:
                            logger.error(f"Streaming error: {e}")
                            yield {"error": str(e)}
                    
                    result["stream"] = stream_generator()
                    result["streaming"] = True
                    result["success"] = True
                else:
                    # Run standard inference
                    inference_result = await self.ipfs_accelerate.infer(
                        effective_model_id,
                        inputs
                    )
                    
                    if isinstance(inference_result, dict) and "infer" in inference_result:
                        result.update(inference_result["infer"])
                    else:
                        result["output"] = inference_result
                        
                    result["success"] = True
                
                return result
                
            # Fallback to direct transformers inference
            elif loaded_via == "transformers" and has_transformers:
                logger.info(f"Running inference with model {effective_model_id} via transformers")
                
                # Get the model info
                model = model_info.get("model")
                tokenizer = model_info.get("tokenizer")
                processor = model_info.get("processor")
                pipeline_obj = model_info.get("pipeline")
                
                if not model or not tokenizer:
                    logger.error(f"Model {effective_model_id} not properly loaded")
                    result["error"] = "Model components not available"
                    return result
                
                # Get inference parameters
                generation_config = options.get("generation_config", {})
                
                # Handle different types of inputs
                if processor:
                    # Process with processor for multimodal models
                    processed_inputs = processor(inputs, return_tensors="pt")
                    processed_inputs = {k: v.to(model.device) for k, v in processed_inputs.items()}
                    
                    # Run model inference
                    with torch.no_grad():
                        outputs = model(**processed_inputs)
                        
                    # Convert outputs to native Python types
                    python_outputs = {}
                    for key, value in outputs.items():
                        if hasattr(value, "tolist"):
                            python_outputs[key] = value.tolist()
                        else:
                            python_outputs[key] = value
                    
                    result["outputs"] = python_outputs
                    result["success"] = True
                    
                elif pipeline_obj:
                    # Use pipeline for most models
                    inference_result = pipeline_obj(inputs, **generation_config)
                    result["results"] = inference_result
                    result["success"] = True
                    
                else:
                    # Manual processing with tokenizer and model
                    if isinstance(inputs, str):
                        processed_inputs = tokenizer(inputs, return_tensors="pt")
                    elif isinstance(inputs, list):
                        processed_inputs = tokenizer(
                            inputs, 
                            padding=True, 
                            truncation=True, 
                            return_tensors="pt"
                        )
                    else:
                        processed_inputs = inputs
                        
                    processed_inputs = {k: v.to(model.device) for k, v in processed_inputs.items()}
                    
                    # Run model inference
                    with torch.no_grad():
                        outputs = model(**processed_inputs)
                        
                    # Convert outputs to native Python types
                    python_outputs = {}
                    for key, value in outputs.items():
                        if hasattr(value, "tolist"):
                            python_outputs[key] = value.tolist()
                        else:
                            python_outputs[key] = value
                    
                    result["outputs"] = python_outputs
                    result["success"] = True
                
                # Add input to the result
                result["input"] = inputs
                
                return result
            else:
                logger.error(f"Model {effective_model_id} not available for inference")
                result["error"] = "Model not available for inference"
                return result
                
        except Exception as e:
            logger.error(f"Inference failed: {e}")
            result["error"] = str(e)
            return result
            
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