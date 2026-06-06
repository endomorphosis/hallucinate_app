"""
IPFS Accelerate module for AI model serving and inference with multi-process architecture
Implements loading and serving models from IPFS with non-blocking operations
"""
import os
import sys
import json
import time
import logging
import asyncio
import threading
from typing import Dict, List, Any, Optional, Union
import multiprocessing as mp
from multiprocessing import Process, Queue, Event
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_accelerate_py")

# Try to import ipfs_kit_server from hallucinate_app
try:
    sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hallucinate_app'))
    from hallucinate_app.ipfs_kit_server import (
        IPFSKitServer, IPFSKitClient, start_plasma_store, PLASMA_STORE_PATH
    )
    HAS_IPFS_KIT_SERVER = True
    logger.info("Successfully imported IPFS Kit Server components")
except ImportError as e:
    HAS_IPFS_KIT_SERVER = False
    logger.warning(f"Failed to import IPFS Kit Server: {e}")

# Try to import transformers and torch
try:
    import torch
    import transformers
    from transformers import AutoTokenizer, AutoModel, pipeline
    HAS_TRANSFORMERS = True
    logger.info("Successfully imported transformers and torch")
except ImportError as e:
    HAS_TRANSFORMERS = False
    logger.warning(f"Could not import transformers or torch: {e}")

# Try to import pyarrow and plasma store
try:
    import pyarrow as pa
    import pyarrow.plasma as plasma
    HAS_PLASMA = True
    logger.info("PyArrow plasma store available for shared memory IPC")
except (ImportError, ModuleNotFoundError):
    HAS_PLASMA = False
    logger.warning("PyArrow plasma store not available. Using Queue-based IPC only.")

class IPFSAccelerateMultiProcess:
    """
    IPFS Accelerate implementation using multi-process architecture
    Runs IPFS operations in a separate process to avoid blocking ML model execution
    """
    
    def __init__(self, resources: Optional[Dict[str, Any]] = None, metadata: Optional[Dict[str, Any]] = None):
        """
        Initialize IPFS Accelerate with resources and metadata
        
        Args:
            resources (dict): Resources required by accelerate
            metadata (dict): Metadata for model operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.loaded_models = {}
        self.model_processes = {}
        self.initialized = False
        
        # IPFS kit server components
        self.ipfs_command_queue = None
        self.ipfs_result_queue = None
        self.ipfs_exit_event = None
        self.ipfs_server = None
        self.ipfs_client = None
        
        # Plasma store process
        self.plasma_process = None
        
        # State management
        self._startup_lock = threading.Lock()
        self._shutting_down = False
        
        logger.info("IPFSAccelerate initialized with multi-process architecture")
    
    async def init(self):
        """
        Initialize the accelerator and start required processes
        
        Returns:
            bool: Success status
        """
        # Use a lock to prevent multiple concurrent initialization
        with self._startup_lock:
            if self.initialized:
                return True
            
            try:
                # Start plasma store if available
                if HAS_PLASMA:
                    size_gb = self.resources.get("plasma_store_size_gb", 2)
                    self.plasma_process = start_plasma_store(size_gb * 1024 * 1024 * 1024)
                    if self.plasma_process:
                        logger.info(f"Plasma store started with {size_gb}GB")
                        # Wait a moment for the plasma store to be ready
                        await asyncio.sleep(1)
                
                # Start IPFS kit server
                if HAS_IPFS_KIT_SERVER:
                    self.ipfs_command_queue = mp.Queue()
                    self.ipfs_result_queue = mp.Queue()
                    self.ipfs_exit_event = Event()
                    
                    self.ipfs_server = IPFSKitServer(
                        self.ipfs_command_queue,
                        self.ipfs_result_queue,
                        self.resources,
                        self.metadata
                    )
                    server_started = self.ipfs_server.start_server()
                    
                    if server_started:
                        # Initialize IPFS client
                        self.ipfs_client = IPFSKitClient(
                            self.ipfs_command_queue,
                            self.ipfs_result_queue,
                            self.resources,
                            self.metadata
                        )
                        
                        # Check if IPFS is ready
                        is_ready = await self.ipfs_client.is_ready()
                        if not is_ready:
                            # Try to start the daemon
                            logger.info("IPFS daemon not running, attempting to start")
                            start_result = await self.ipfs_client.start_daemon()
                            if start_result:
                                logger.info("IPFS daemon started successfully")
                            else:
                                logger.warning("Failed to start IPFS daemon")
                    else:
                        logger.warning("Failed to start IPFS Kit Server")
                else:
                    logger.warning("IPFS Kit Server not available, using fallback implementation")
                    # Create a basic implementation for testing
                    class MockIPFSClient:
                        async def is_ready(self):
                            return True
                            
                        async def fetch_from_ipfs(self, cid, path=None):
                            return {"data": f"Mock data for {cid}", "cid": cid}
                            
                        async def add_to_ipfs(self, data, metadata=None):
                            return {"cid": "QmMockCidForTestingPurposes123456789", "size": len(data)}
                            
                        async def async_download(self, cid, dest_path):
                            future = asyncio.get_event_loop().create_future()
                            # Simulate download
                            await asyncio.sleep(0.1)
                            future.set_result({"success": True, "path": dest_path, "cid": cid})
                            return future
                    
                    self.ipfs_client = MockIPFSClient()
                
                self.initialized = True
                logger.info("IPFSAccelerate initialization complete")
                return True
                
            except Exception as e:
                logger.error(f"Failed to initialize IPFSAccelerate: {e}")
                await self.shutdown()
                raise
    
    async def shutdown(self):
        """
        Shutdown the accelerator and clean up processes
        
        Returns:
            bool: Success status
        """
        if self._shutting_down:
            return True
            
        self._shutting_down = True
        logger.info("Shutting down IPFSAccelerate")
        
        try:
            # Stop model processes
            for model_id, process_info in self.model_processes.items():
                try:
                    process = process_info.get("process")
                    exit_event = process_info.get("exit_event")
                    
                    if exit_event:
                        exit_event.set()
                    
                    if process and process.is_alive():
                        process.join(timeout=2)
                        if process.is_alive():
                            process.terminate()
                            process.join(timeout=1)
                            if process.is_alive():
                                process.kill()
                except Exception as e:
                    logger.warning(f"Error stopping model process {model_id}: {e}")
            
            # Stop IPFS kit server
            if self.ipfs_server:
                self.ipfs_server.stop_server()
            
            # Stop plasma store
            if self.plasma_process and self.plasma_process.is_alive():
                self.plasma_process.terminate()
                self.plasma_process.join(timeout=2)
                if self.plasma_process.is_alive():
                    self.plasma_process.kill()
            
            self.initialized = False
            self._shutting_down = False
            logger.info("IPFSAccelerate shutdown complete")
            return True
            
        except Exception as e:
            logger.error(f"Error during IPFSAccelerate shutdown: {e}")
            self._shutting_down = False
            return False
    
    async def load_model_from_ipfs(self, 
                                  model_id: str, 
                                  cid: Optional[str] = None, 
                                  options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load a model, optionally downloading from IPFS first.
        
        Args:
            model_id: The model identifier
            cid: Optional IPFS content identifier
            options: Additional options for model loading
            
        Returns:
            Dict with status and model information
        """
        if not self.initialized:
            await self.init()
        
        options = options or {}
        try:
            # Check if model is already loaded
            if model_id in self.loaded_models and self.loaded_models[model_id].get("status") == "loaded":
                logger.info(f"Model {model_id} already loaded")
                return {
                    "status": "success",
                    "model_id": model_id,
                    "message": "Model already loaded"
                }
            
            # Update model status
            self.loaded_models[model_id] = {
                "id": model_id,
                "status": "loading",
                "options": options
            }
            
            # If CID is provided, download from IPFS
            model_path = None
            if cid and self.ipfs_client:
                logger.info(f"Downloading model {model_id} from IPFS CID: {cid}")
                
                # Create model directory if it doesn't exist
                model_dir = os.path.expanduser(f"~/.cache/hallucinate_app/models/{model_id}")
                os.makedirs(model_dir, exist_ok=True)
                
                # Start asynchronous download
                download_task = await self.ipfs_client.async_download(cid, model_dir)
                
                # Wait for download to complete
                download_result = await download_task
                
                if hasattr(download_result, "get") and download_result.get("error"):
                    error_msg = f"Failed to download model from IPFS: {download_result['error']}"
                    logger.error(error_msg)
                    self.loaded_models[model_id]["status"] = "error"
                    self.loaded_models[model_id]["error"] = error_msg
                    return {
                        "status": "error",
                        "model_id": model_id,
                        "error": error_msg
                    }
                
                model_path = model_dir
                logger.info(f"Model downloaded to {model_path}")
            
            # Start a separate process for model loading and inference
            model_queue = mp.Queue()
            result_queue = mp.Queue()
            exit_event = Event()
            
            # Create and start the model process
            model_process = Process(
                target=self._run_model_process,
                args=(model_id, model_path or "hub", model_queue, result_queue, exit_event, options),
                daemon=True
            )
            model_process.start()
            
            # Store process info
            self.model_processes[model_id] = {
                "process": model_process,
                "command_queue": model_queue,
                "result_queue": result_queue,
                "exit_event": exit_event
            }
            
            # Send load command to model process
            model_queue.put({
                "action": "load",
                "model_id": model_id,
                "model_path": model_path or "hub",
                "options": options
            })
            
            # Wait for response from model process (with timeout)
            for _ in range(60):  # Wait up to 60 seconds
                try:
                    response = result_queue.get(timeout=1.0)
                    if response.get("action") == "load":
                        if response.get("status") == "success":
                            self.loaded_models[model_id]["status"] = "loaded"
                            self.loaded_models[model_id].update(response.get("model_info", {}))
                            
                            return {
                                "status": "success",
                                "model_id": model_id,
                                "message": "Model loaded successfully",
                                "model_info": response.get("model_info", {})
                            }
                        else:
                            error_msg = response.get("error", "Unknown error loading model")
                            self.loaded_models[model_id]["status"] = "error"
                            self.loaded_models[model_id]["error"] = error_msg
                            
                            # Clean up failed process
                            exit_event.set()
                            model_process.join(timeout=2)
                            if model_process.is_alive():
                                model_process.terminate()
                            
                            return {
                                "status": "error",
                                "model_id": model_id,
                                "error": error_msg
                            }
                    
                except (mp.queues.Empty, TimeoutError):
                    # No response yet, continue waiting
                    await asyncio.sleep(0.1)
            
            # If we get here, we timed out waiting for response
            error_msg = "Timeout waiting for model to load"
            self.loaded_models[model_id]["status"] = "error"
            self.loaded_models[model_id]["error"] = error_msg
            
            # Clean up failed process
            exit_event.set()
            model_process.join(timeout=2)
            if model_process.is_alive():
                model_process.terminate()
            
            return {
                "status": "error",
                "model_id": model_id,
                "error": error_msg
            }
            
        except Exception as e:
            error_msg = f"Error loading model {model_id}: {str(e)}"
            logger.error(error_msg)
            
            if model_id in self.loaded_models:
                self.loaded_models[model_id]["status"] = "error"
                self.loaded_models[model_id]["error"] = error_msg
            
            return {
                "status": "error",
                "model_id": model_id,
                "error": error_msg
            }
    
    @staticmethod
    def _run_model_process(model_id: str, 
                          model_path: str, 
                          command_queue: Queue, 
                          result_queue: Queue, 
                          exit_event: Event, 
                          options: Dict[str, Any]):
        """
        Run a model in a separate process.
        
        Args:
            model_id: Model identifier
            model_path: Path to model files
            command_queue: Queue for receiving commands
            result_queue: Queue for sending results
            exit_event: Event for signaling process to exit
            options: Additional options for model loading
        """
        try:
            logger.info(f"Model process for {model_id} started (PID: {os.getpid()})")
            
            # Initialize model-specific objects
            model = None
            tokenizer = None
            pipeline_obj = None
            
            # Connect to plasma store if available
            p_client = None
            if HAS_PLASMA:
                try:
                    p_client = plasma.connect(PLASMA_STORE_PATH)
                    logger.info(f"Connected to plasma store from model process for {model_id}")
                except Exception as e:
                    logger.warning(f"Model process for {model_id} failed to connect to plasma store: {e}")
            
            # Process commands
            while not exit_event.is_set():
                try:
                    # Get command with timeout to check exit_event periodically
                    try:
                        cmd = command_queue.get(timeout=1.0)
                    except (mp.queues.Empty, TimeoutError):
                        # No command available, check exit_event again
                        continue
                    
                    # Process command
                    if cmd.get("action") == "load":
                        # Load the model
                        try:
                            if not HAS_TRANSFORMERS:
                                raise ImportError("Transformers package not available")
                            
                            # Get model settings
                            model_from_path = model_path != "hub"
                            load_options = cmd.get("options", {})
                            model_type = load_options.get("model_type", "auto")
                            
                            logger.info(f"Loading model {model_id}" + 
                                        (f" from path: {model_path}" if model_from_path else " from hub"))
                            
                            # Load tokenizer
                            if model_from_path:
                                tokenizer = AutoTokenizer.from_pretrained(model_path)
                            else:
                                tokenizer = AutoTokenizer.from_pretrained(model_id)
                            
                            # Load model
                            if model_type == "auto":
                                if model_from_path:
                                    model = AutoModel.from_pretrained(model_path)
                                else:
                                    model = AutoModel.from_pretrained(model_id)
                            elif model_type == "pipeline":
                                # Load as pipeline
                                task = load_options.get("task", "text-generation")
                                if model_from_path:
                                    pipeline_obj = pipeline(task, model=model_path)
                                else:
                                    pipeline_obj = pipeline(task, model=model_id)
                            
                            # Get device info
                            device = "cpu"
                            if torch.cuda.is_available() and load_options.get("use_gpu", True):
                                device = "cuda"
                                # Move model to GPU if not a pipeline
                                if model and not pipeline_obj:
                                    model = model.to(device)
                            
                            # Send success response
                            result_queue.put({
                                "action": "load",
                                "status": "success",
                                "model_info": {
                                    "model_id": model_id,
                                    "device": device,
                                    "model_type": model_type,
                                    "loaded_from_path": model_from_path
                                }
                            })
                            
                        except Exception as e:
                            logger.error(f"Error loading model {model_id}: {e}")
                            result_queue.put({
                                "action": "load",
                                "status": "error",
                                "error": str(e)
                            })
                    
                    elif cmd.get("action") == "inference":
                        # Run inference
                        try:
                            input_data = cmd.get("input_data", {})
                            inference_options = cmd.get("options", {})
                            
                            if not model and not pipeline_obj:
                                raise ValueError("Model not loaded")
                            
                            if pipeline_obj:
                                # Run inference with pipeline
                                if "text" in input_data:
                                    # Run on text input
                                    output = pipeline_obj(input_data["text"], **inference_options)
                                else:
                                    output = pipeline_obj(input_data, **inference_options)
                                
                                # Send success response
                                result_queue.put({
                                    "action": "inference",
                                    "status": "success",
                                    "result": output
                                })
                            else:
                                # Run inference with model and tokenizer
                                if "text" in input_data:
                                    # Tokenize input
                                    inputs = tokenizer(input_data["text"], return_tensors="pt")
                                    
                                    # Move inputs to GPU if model is on GPU
                                    if hasattr(model, 'device') and 'cuda' in str(model.device):
                                        inputs = {k: v.to(model.device) for k, v in inputs.items()}
                                    
                                    # Run model
                                    with torch.no_grad():
                                        outputs = model(**inputs)
                                    
                                    # Convert outputs to dict for JSON serialization
                                    result = {}
                                    for key, tensor in outputs.items():
                                        if hasattr(tensor, 'cpu') and hasattr(tensor, 'numpy'):
                                            # Convert tensor to numpy and then to list
                                            result[key] = tensor.cpu().numpy().tolist()
                                    
                                    # Send success response
                                    result_queue.put({
                                        "action": "inference",
                                        "status": "success",
                                        "result": result
                                    })
                                else:
                                    # Unsupported input type
                                    result_queue.put({
                                        "action": "inference",
                                        "status": "error",
                                        "error": "Unsupported input type"
                                    })
                        except Exception as e:
                            logger.error(f"Error running inference with model {model_id}: {e}")
                            result_queue.put({
                                "action": "inference",
                                "status": "error",
                                "error": str(e)
                            })
                    
                    elif cmd.get("action") == "unload":
                        # Unload the model
                        try:
                            # Delete model and tokenizer to free memory
                            if model:
                                del model
                            if tokenizer:
                                del tokenizer
                            if pipeline_obj:
                                del pipeline_obj
                            
                            # Force garbage collection
                            import gc
                            gc.collect()
                            
                            if torch.cuda.is_available():
                                torch.cuda.empty_cache()
                            
                            # Send success response
                            result_queue.put({
                                "action": "unload",
                                "status": "success"
                            })
                            
                            # Exit the process
                            break
                        except Exception as e:
                            logger.error(f"Error unloading model {model_id}: {e}")
                            result_queue.put({
                                "action": "unload",
                                "status": "error",
                                "error": str(e)
                            })
                    
                    elif cmd.get("action") == "exit":
                        # Exit the process
                        logger.info(f"Received exit command for model {model_id}")
                        break
                    
                    else:
                        # Unknown command
                        result_queue.put({
                            "action": cmd.get("action", "unknown"),
                            "status": "error",
                            "error": f"Unknown command: {cmd.get('action', 'unknown')}"
                        })
                
                except Exception as e:
                    logger.error(f"Error processing command in model process for {model_id}: {e}")
                    try:
                        result_queue.put({
                            "action": "error",
                            "status": "error",
                            "error": str(e)
                        })
                    except Exception as queue_err:
                        logger.warning(f"Failed to send error to result queue for {model_id}: {queue_err}")
            
            # Clean up
            logger.info(f"Model process for {model_id} shutting down")
            try:
                # Delete model and tokenizer to free memory
                if model:
                    del model
                if tokenizer:
                    del tokenizer
                if pipeline_obj:
                    del pipeline_obj
                
                # Force garbage collection
                import gc
                gc.collect()
                
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                # Disconnect from plasma store
                if p_client:
                    del p_client
            except Exception as e:
                logger.warning(f"Error during model process cleanup for {model_id}: {e}")
            
        except Exception as e:
            logger.error(f"Unhandled exception in model process for {model_id}: {e}")
        finally:
            logger.info(f"Model process for {model_id} exited")
    
    async def process_async(self, 
                          model_id: str, 
                          input_text: str, 
                          options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Process input with a loaded model asynchronously
        
        Args:
            model_id (str): Model identifier
            input_text (str): Text input for inference
            options (dict, optional): Additional options for inference
            
        Returns:
            dict: Inference results
        """
        if not self.initialized:
            await self.init()
        
        options = options or {}
        
        try:
            logger.info(f"Processing with model {model_id}: {input_text[:30]}...")
            
            # Check if model is loaded
            if model_id not in self.loaded_models or self.loaded_models[model_id].get("status") != "loaded":
                logger.info(f"Model {model_id} not loaded, attempting to load")
                load_result = await self.load_model_from_ipfs(model_id)
                if load_result.get("status") != "success":
                    return {
                        "status": "error",
                        "error": f"Failed to load model: {load_result.get('error', 'Unknown error')}"
                    }
            
            # Get model process info
            process_info = self.model_processes.get(model_id)
            if not process_info:
                return {
                    "status": "error",
                    "error": f"Model process for {model_id} not found"
                }
            
            command_queue = process_info.get("command_queue")
            result_queue = process_info.get("result_queue")
            
            # Send inference command to model process
            command_queue.put({
                "action": "inference",
                "input_data": {"text": input_text},
                "options": options
            })
            
            # Wait for response (with timeout)
            for _ in range(30):  # Wait up to 30 seconds
                try:
                    response = result_queue.get(timeout=1.0)
                    if response.get("action") == "inference":
                        if response.get("status") == "success":
                            # Add model_id to result
                            result = response.get("result", {})
                            return {
                                "status": "success",
                                "model_id": model_id,
                                "input": input_text,
                                "output": result,
                                "processing_time": time.time()
                            }
                        else:
                            return {
                                "status": "error",
                                "error": response.get("error", "Unknown error during inference")
                            }
                    
                except (mp.queues.Empty, TimeoutError):
                    # No response yet, continue waiting
                    await asyncio.sleep(0.1)
            
            # If we get here, we timed out waiting for response
            return {
                "status": "error",
                "error": "Timeout waiting for inference result"
            }
            
        except Exception as e:
            logger.error(f"Error processing with model {model_id}: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def process(self, model_id: str, input_text: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Synchronous wrapper for process_async
        
        Args:
            model_id (str): Model identifier
            input_text (str): Text input for inference
            options (dict, optional): Additional options for inference
            
        Returns:
            dict: Inference results
        """
        return asyncio.run(self.process_async(model_id, input_text, options))
    
    async def unload_model(self, model_id: str) -> Dict[str, Any]:
        """
        Unload a model from memory
        
        Args:
            model_id (str): Model identifier
            
        Returns:
            dict: Unload result
        """
        if not self.initialized:
            await self.init()
        
        try:
            logger.info(f"Unloading model {model_id}")
            
            # Check if model is loaded
            if model_id not in self.loaded_models:
                return {
                    "status": "warning",
                    "message": f"Model {model_id} not loaded"
                }
            
            # Get model process info
            process_info = self.model_processes.get(model_id)
            if not process_info:
                # Update model state
                if model_id in self.loaded_models:
                    del self.loaded_models[model_id]
                
                return {
                    "status": "warning",
                    "message": f"Model process for {model_id} not found"
                }
            
            command_queue = process_info.get("command_queue")
            result_queue = process_info.get("result_queue")
            exit_event = process_info.get("exit_event")
            process = process_info.get("process")
            
            # Send unload command to model process
            command_queue.put({
                "action": "unload"
            })
            
            # Wait for response (with timeout)
            for _ in range(5):  # Wait up to 5 seconds
                try:
                    response = result_queue.get(timeout=1.0)
                    if response.get("action") == "unload":
                        break
                except (mp.queues.Empty, TimeoutError):
                    # No response yet, continue waiting
                    await asyncio.sleep(0.1)
            
            # Signal process to exit and wait for it to terminate
            if exit_event:
                exit_event.set()
            
            if process and process.is_alive():
                process.join(timeout=3)
                if process.is_alive():
                    process.terminate()
                    process.join(timeout=1)
                    if process.is_alive():
                        process.kill()
            
            # Update internal state
            if model_id in self.model_processes:
                del self.model_processes[model_id]
            
            if model_id in self.loaded_models:
                del self.loaded_models[model_id]
            
            logger.info(f"Model {model_id} unloaded")
            return {
                "status": "success",
                "message": f"Model {model_id} unloaded successfully"
            }
            
        except Exception as e:
            logger.error(f"Error unloading model {model_id}: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def get_models(self) -> Dict[str, Any]:
        """
        Get the list of loaded models
        
        Returns:
            dict: Model status information
        """
        return {
            "models": self.loaded_models,
            "count": len(self.loaded_models)
        }
    
    async def test(self) -> Dict[str, Any]:
        """
        Run tests for the accelerator
        
        Returns:
            dict: Test results
        """
        if not self.initialized:
            await self.init()
        
        try:
            test_results = {}
            
            # Test IPFS connectivity
            if self.ipfs_client:
                try:
                    # Check if IPFS is ready
                    is_ready = await self.ipfs_client.is_ready()
                    
                    if not is_ready:
                        # Try to start the daemon
                        logger.info("IPFS daemon not running, attempting to start for test")
                        start_result = await self.ipfs_client.start_daemon()
                        is_ready = start_result
                    
                    if is_ready:
                        # Test adding and retrieving content
                        test_data = f"IPFS test data: {time.time()}"
                        add_result = await self.ipfs_client.add_to_ipfs(test_data)
                        
                        if "error" in add_result:
                            test_results["ipfs"] = {
                                "success": False,
                                "error": f"Failed to add test data to IPFS: {add_result['error']}"
                            }
                        else:
                            cid = add_result.get("cid", "")
                            
                            if not cid:
                                test_results["ipfs"] = {
                                    "success": False,
                                    "error": "Failed to get CID from add result"
                                }
                            else:
                                # Try to retrieve the content
                                fetch_result = await self.ipfs_client.fetch_from_ipfs(cid)
                                
                                if "error" in fetch_result:
                                    test_results["ipfs"] = {
                                        "success": False,
                                        "error": f"Failed to fetch test data from IPFS: {fetch_result['error']}"
                                    }
                                else:
                                    # Verify the content
                                    retrieved_data = fetch_result.get("data", "")
                                    
                                    if retrieved_data != test_data and isinstance(retrieved_data, str):
                                        test_results["ipfs"] = {
                                            "success": False,
                                            "error": "Retrieved data does not match test data"
                                        }
                                    else:
                                        test_results["ipfs"] = {
                                            "success": True,
                                            "message": "IPFS test passed",
                                            "cid": cid
                                        }
                    else:
                        test_results["ipfs"] = {
                            "success": False,
                            "error": "IPFS daemon not ready"
                        }
                except Exception as e:
                    test_results["ipfs"] = {
                        "success": False,
                        "error": f"IPFS test failed: {str(e)}"
                    }
            else:
                test_results["ipfs"] = {
                    "success": False,
                    "error": "IPFS client not initialized"
                }
            
            # Test model loading
            test_model_id = "hf-internal-testing/tiny-random-bert"
            try:
                # Load the model
                load_result = await self.load_model_from_ipfs(test_model_id)
                
                if load_result.get("status") != "success":
                    test_results["model_loading"] = {
                        "success": False,
                        "error": f"Failed to load model: {load_result.get('error', 'Unknown error')}"
                    }
                else:
                    test_results["model_loading"] = {
                        "success": True,
                        "message": "Model loaded successfully",
                        "model_id": test_model_id
                    }
                    
                    # Test inference
                    try:
                        test_input = "This is a test."
                        inference_result = await self.process_async(test_model_id, test_input)
                        
                        if inference_result.get("status") == "error":
                            test_results["inference"] = {
                                "success": False,
                                "error": inference_result.get("error", "Unknown error during inference")
                            }
                        else:
                            test_results["inference"] = {
                                "success": True,
                                "message": "Inference test passed",
                                "model_id": test_model_id
                            }
                    except Exception as e:
                        test_results["inference"] = {
                            "success": False,
                            "error": f"Inference test failed: {str(e)}"
                        }
                    
                    # Unload the model
                    await self.unload_model(test_model_id)
            except Exception as e:
                test_results["model_loading"] = {
                    "success": False,
                    "error": f"Model loading test failed: {str(e)}"
                }
            
            # Add memory usage info
            try:
                import psutil
                process = psutil.Process(os.getpid())
                memory_info = process.memory_info()
                memory_mb = memory_info.rss / (1024 * 1024)
                
                test_results["resources"] = {
                    "memory_mb": memory_mb,
                    "cpu_percent": process.cpu_percent(),
                    "thread_count": process.num_threads()
                }
            except:
                pass
            
            # Determine overall status
            all_success = all(result.get("success", False) for result in test_results.values())
            
            return {
                "status": "success" if all_success else "partial",
                "tests": test_results,
                "message": "All tests passed" if all_success else "Some tests failed",
                "multi_process": True,
                "timestamp": time.time()
            }
            
        except Exception as e:
            logger.error(f"IPFS Accelerate test failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def __del__(self):
        """Clean up resources when object is garbage collected"""
        if hasattr(self, 'initialized') and self.initialized:
            try:
                asyncio.run(self.shutdown())
            except Exception as e:
                logger.error(f"Error during cleanup in __del__: {e}")

# Create singleton instance for import
ipfs_accelerate_py = IPFSAccelerateMultiProcess()