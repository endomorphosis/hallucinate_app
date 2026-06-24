"""
IPFS Accelerate Server with Multi-Process Architecture

This module implements a server for machine learning models that uses a multi-process
architecture with Apache Arrow IPC for efficient inter-process communication. It separates
IPFS operations and ML model inference into different processes to avoid blocking.

Key components:
- Main process: Coordinates operations and handles API requests
- IPFS process: Handles IPFS operations in a separate process
- ML process: Handles model loading and inference in a separate process
- IPC: Uses Arrow Plasma store for efficient zero-copy data sharing
"""

import os
import sys
import time
import json
import uuid
import queue
import logging
import tempfile
import multiprocessing as mp
from typing import Dict, List, Any, Optional, Union, Tuple

# Try to import Arrow and Plasma
try:
    import pyarrow as pa
    import pyarrow.plasma as plasma
    from pyarrow.ipc import RecordBatchStreamWriter
    HAS_ARROW = True
except ImportError:
    HAS_ARROW = False
    logging.warning("PyArrow not available, using file-based IPC")

# Try to import ML libraries (fallback to mock if not available)
try:
    import numpy as np
    import torch
    from transformers import AutoModel, AutoTokenizer
    HAS_ML = True
except ImportError:
    HAS_ML = False
    logging.warning("ML libraries not available, using mock implementation")

# Local imports
from .ipfs_kit_server import IPFSKitServer, IPFSKitClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PlasmaManager:
    """
    Manager for the Arrow Plasma object store
    
    This class provides shared memory management using Apache Arrow's Plasma store.
    It's used for efficient zero-copy data transfer between processes.
    """
    
    def __init__(self, socket_path: Optional[str] = None, size_gb: float = 1.0):
        """
        Initialize the Plasma manager
        
        Args:
            socket_path: Path to the plasma socket. If None, a default path is used.
            size_gb: Size of the plasma store in gigabytes
        """
        self.has_arrow = HAS_ARROW
        if not self.has_arrow:
            logger.warning("PyArrow not available, using file-based IPC")
            return
        
        # Set up the socket path
        if socket_path is None:
            self.socket_path = "/tmp/plasma_accelerate"
        else:
            self.socket_path = socket_path
        
        # Set up size in bytes
        self.size_bytes = int(size_gb * 1024 * 1024 * 1024)
        
        # Start the plasma store if it's not already running
        self.store_process = None
        self.client = None
        self._startup_error = None
        self._start_store()
    
    def _start_store(self):
        """Start the plasma store process"""
        if not self.has_arrow:
            return
        
        try:
            # Try to connect to an existing store first
            try:
                self.client = plasma.connect(self.socket_path)
                self._startup_error = None
                logger.info(f"Connected to existing plasma store at {self.socket_path}")
                return
            except Exception as connect_err:
                # No existing store found; start a new one
                logger.debug(
                    "Could not connect to existing plasma store at %s (%s); starting a new one",
                    self.socket_path,
                    connect_err,
                )
            
            # Start the plasma store
            from subprocess import Popen
            
            cmd = ["plasma_store", 
                   "-m", str(self.size_bytes),
                   "-s", self.socket_path]
            
            self.store_process = Popen(cmd)
            logger.info(f"Started plasma store at {self.socket_path} with size {self.size_bytes} bytes")
            
            # Connect to the store
            time.sleep(0.1)  # Give it a moment to start
            self.client = plasma.connect(self.socket_path)
            self._startup_error = None
            logger.info("Connected to plasma store")
        except Exception as e:
            self._startup_error = e
            logger.error(f"Failed to start plasma store: {e}")
            if self.store_process:
                self.store_process.terminate()
            self.store_process = None
    
    def shutdown(self):
        """Shutdown the plasma store"""
        if not self.has_arrow:
            return
        
        if self.client:
            self.client.disconnect()
            logger.info("Disconnected from plasma store")
        
        if self.store_process:
            self.store_process.terminate()
            logger.info("Terminated plasma store process")

    def _require_client(self) -> Any:
        """Return the active plasma client or raise a clear runtime error."""
        if self.client is None:
            message = "Plasma store client is not available"
            if self._startup_error is not None:
                message = f"{message}: plasma store failed to start"
            raise RuntimeError(message) from self._startup_error
        return self.client
    
    def put(self, obj: Any) -> bytes:
        """
        Put an object in the plasma store
        
        Args:
            obj: Object to store (must be serializable by pyarrow)
            
        Returns:
            bytes: Object ID that can be used to retrieve the object
            
        Raises:
            Exception: Propagates any plasma or serialization error so callers
                are not silently handed a ``None`` object ID.
        """
        if not self.has_arrow:
            # File-based fallback
            temp_file = tempfile.NamedTemporaryFile(delete=False)
            file_path = temp_file.name
            temp_file.close()
            
            with open(file_path, 'wb') as f:
                f.write(json.dumps(obj).encode())
            
            return file_path.encode()
        
        try:
            client = self._require_client()

            # Generate a random object ID
            object_id = plasma.ObjectID.from_random()
            
            # Serialize the object to Arrow
            serialized = pa.serialize(obj)
            
            # Put the serialized object in the plasma store
            client.put(serialized, object_id)
            
            return object_id.binary()
        except Exception as e:
            logger.error(f"Failed to put object in plasma store: {e}", exc_info=True)
            raise
    
    def get(self, object_id: bytes) -> Any:
        """
        Get an object from the plasma store
        
        Args:
            object_id: Object ID returned by put()
            
        Returns:
            Any: The retrieved object
            
        Raises:
            RuntimeError: If the plasma client is not available.
            Exception: Re-raises any plasma/Arrow exception so callers receive the
                error rather than a confusing None return value.
        """
        if not self.has_arrow:
            # File-based fallback
            file_path = object_id.decode()
            with open(file_path, 'rb') as f:
                obj = json.loads(f.read().decode())
            
            # Clean up the temporary file
            try:
                os.unlink(file_path)
            except OSError as e:
                logger.warning("Failed to clean up temporary file %s: %s", file_path, e)
            
            return obj
        
        try:
            client = self._require_client()

            # Convert the binary ID to a plasma ObjectID
            plasma_id = plasma.ObjectID(object_id)
            
            # Get the object from the plasma store
            serialized = client.get(plasma_id)
            
            # Deserialize the object
            obj = pa.deserialize(serialized)
            
            return obj
        except Exception as e:
            logger.error(f"Failed to get object from plasma store: {e}", exc_info=True)
            return None
    
    def delete(self, object_id: bytes):
        """
        Delete an object from the plasma store
        
        Args:
            object_id: Object ID returned by put()
        """
        if not self.has_arrow:
            # File-based fallback - already deleted in get()
            return
        
        try:
            # Convert the binary ID to a plasma ObjectID
            plasma_id = plasma.ObjectID(object_id)
            
            # Delete the object from the plasma store
            self.client.delete([plasma_id])
        except Exception as e:
            logger.error(f"Failed to delete object from plasma store: {e}", exc_info=True)


def ipfs_process_fn(command_queue, result_queue, plasma_socket=None):
    """
    IPFS process function
    
    This function runs in a separate process and handles IPFS operations.
    
    Args:
        command_queue: Queue for receiving commands
        result_queue: Queue for sending results
        plasma_socket: Socket for the plasma store
    """
    # Set up logging
    logger = logging.getLogger("ipfs_process")
    
    # Set up IPFS kit
    ipfs_request_queue = mp.Queue()
    ipfs_response_queue = mp.Queue()
    
    server = IPFSKitServer(ipfs_request_queue, ipfs_response_queue, metadata={"use_mock": True})
    server_thread = mp.Process(target=server.start)
    server_thread.daemon = True
    server_thread.start()
    
    ipfs_client = IPFSKitClient(ipfs_request_queue, ipfs_response_queue)
    
    # Set up plasma client if available
    plasma_client = None
    if HAS_ARROW and plasma_socket:
        try:
            plasma_client = plasma.connect(plasma_socket)
            logger.info(f"Connected to plasma store at {plasma_socket}")
        except Exception as e:
            logger.error(f"Failed to connect to plasma store: {e}")
    
    # Process commands
    logger.info("IPFS process started")
    
    try:
        while True:
            # Get a command from the queue
            command = command_queue.get()
            
            # Check if it's a stop command
            if command.get("action") == "exit":
                logger.info("Received exit command")
                break
            
            # Process the command
            command_id = command.get("id")
            action = command.get("action")
            params = command.get("params", {})
            
            logger.debug(f"Processing command: {action} (ID: {command_id})")
            
            try:
                # Execute the command
                if action == "fetch":
                    # Fetch data from IPFS
                    cid = params.get("cid")
                    if not cid:
                        raise ValueError("CID parameter is required for fetch action")
                    
                    # Fetch the data
                    data = ipfs_client.cat(cid)
                    
                    # Store the data in plasma if available, otherwise return directly
                    if plasma_client:
                        # Generate a random object ID
                        object_id = plasma.ObjectID.from_random()
                        
                        # Put the data in the plasma store
                        plasma_client.put(pa.py_buffer(data), object_id)
                        
                        # Return the reference
                        result_queue.put({
                            "id": command_id,
                            "status": "success",
                            "data_ref": object_id.binary().hex()
                        })
                    else:
                        # No plasma store, return the data directly
                        # This could be inefficient for large data
                        result_queue.put({
                            "id": command_id,
                            "status": "success",
                            "data": data
                        })
                elif action == "add":
                    # Add data to IPFS
                    path = params.get("path")
                    if not path:
                        # Check if there's a data reference
                        data_ref_hex = params.get("data_ref")
                        if data_ref_hex and plasma_client:
                            # Get the data from plasma
                            object_id = plasma.ObjectID.from_hex(data_ref_hex)
                            data = plasma_client.get(object_id)
                            
                            # Write to a temporary file
                            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                                tmp.write(data.to_pybytes())
                                path = tmp.name
                        else:
                            raise ValueError("Path or data_ref parameter is required for add action")
                    
                    # Add the data to IPFS
                    result = ipfs_client.add(path)
                    
                    # Clean up temporary file if created
                    if "data_ref" in params and not "path" in params:
                        try:
                            os.unlink(path)
                        except OSError:
                            pass
                    
                    # Return the result
                    result_queue.put({
                        "id": command_id,
                        "status": "success",
                        "result": result
                    })
                elif action == "pin":
                    # Pin content in IPFS
                    cid = params.get("cid")
                    if not cid:
                        raise ValueError("CID parameter is required for pin action")
                    
                    # Pin the content
                    result = ipfs_client.pin_add(cid)
                    
                    # Return the result
                    result_queue.put({
                        "id": command_id,
                        "status": "success",
                        "result": result
                    })
                else:
                    # Unknown command
                    raise ValueError(f"Unknown action: {action}")
            except Exception as e:
                logger.error(f"Error executing action {action}: {e}")
                result_queue.put({
                    "id": command_id,
                    "status": "error",
                    "error": str(e)
                })
    except KeyboardInterrupt:
        logger.info("Interrupted")
    except Exception as e:
        logger.error(f"Error in IPFS process: {e}")
    finally:
        # Clean up
        logger.info("Stopping IPFS process")
        ipfs_client.stop_server()
        server_thread.join(timeout=2)
        
        if plasma_client:
            plasma_client.disconnect()
            logger.info("Disconnected from plasma store")
        
        logger.info("IPFS process stopped")


def ml_process_fn(command_queue, result_queue, plasma_socket=None):
    """
    Machine Learning process function
    
    This function runs in a separate process and handles ML operations.
    
    Args:
        command_queue: Queue for receiving commands
        result_queue: Queue for sending results
        plasma_socket: Socket for the plasma store
    """
    # Set up logging
    logger = logging.getLogger("ml_process")
    
    # Set up ML models
    models = {}
    tokenizers = {}
    
    # Set up plasma client if available
    plasma_client = None
    if HAS_ARROW and plasma_socket:
        try:
            plasma_client = plasma.connect(plasma_socket)
            logger.info(f"Connected to plasma store at {plasma_socket}")
        except Exception as e:
            logger.error(f"Failed to connect to plasma store: {e}")
    
    # Process commands
    logger.info("ML process started")
    
    try:
        while True:
            # Get a command from the queue
            command = command_queue.get()
            
            # Check if it's a stop command
            if command.get("action") == "exit":
                logger.info("Received exit command")
                break
            
            # Process the command
            command_id = command.get("id")
            action = command.get("action")
            params = command.get("params", {})
            
            logger.debug(f"Processing command: {action} (ID: {command_id})")
            
            try:
                # Execute the command
                if action == "load_model":
                    # Load a model
                    model_id = params.get("model_id")
                    model_path = params.get("model_path")
                    
                    if not model_id:
                        raise ValueError("model_id parameter is required for load_model action")
                    
                    if HAS_ML:
                        # Load the real model
                        if model_path:
                            model = AutoModel.from_pretrained(model_path)
                            tokenizer = AutoTokenizer.from_pretrained(model_path)
                        else:
                            # Use model_id as the model name
                            model = AutoModel.from_pretrained(model_id)
                            tokenizer = AutoTokenizer.from_pretrained(model_id)
                        
                        models[model_id] = model
                        tokenizers[model_id] = tokenizer
                    else:
                        # Mock implementation
                        logger.info(f"Mock loading model: {model_id}")
                        models[model_id] = {"name": model_id, "mock": True}
                        tokenizers[model_id] = {"name": model_id, "mock": True}
                    
                    # Return success
                    result_queue.put({
                        "id": command_id,
                        "status": "success",
                        "model_id": model_id
                    })
                elif action == "infer":
                    # Run inference
                    model_id = params.get("model_id")
                    inputs = params.get("inputs")
                    
                    # Check if there's a data reference
                    data_ref_hex = params.get("data_ref")
                    if data_ref_hex and plasma_client:
                        # Get the data from plasma
                        object_id = plasma.ObjectID.from_hex(data_ref_hex)
                        inputs = plasma_client.get(object_id).to_pybytes().decode()
                    
                    if not model_id or not inputs:
                        raise ValueError("model_id and inputs parameters are required for infer action")
                    
                    # Check if the model is loaded
                    if model_id not in models:
                        raise ValueError(f"Model {model_id} not loaded")
                    
                    if HAS_ML:
                        # Run real inference
                        model = models[model_id]
                        tokenizer = tokenizers[model_id]
                        
                        # Tokenize inputs
                        tokens = tokenizer(inputs, return_tensors="pt")
                        
                        # Run inference
                        with torch.no_grad():
                            outputs = model(**tokens)
                        
                        # Convert to numpy for easier serialization
                        results = {
                            "last_hidden_state": outputs.last_hidden_state.numpy().tolist(),
                            "model_id": model_id,
                            "inputs": inputs
                        }
                    else:
                        # Mock implementation
                        logger.info(f"Mock inference with model: {model_id}")
                        results = {
                            "last_hidden_state": [[0.1, 0.2, 0.3] for _ in range(10)],
                            "model_id": model_id,
                            "inputs": inputs,
                            "mock": True
                        }
                    
                    # Store the results in plasma if available, otherwise return directly
                    if plasma_client:
                        # Generate a random object ID
                        object_id = plasma.ObjectID.from_random()
                        
                        # Serialize the results to Arrow
                        serialized = pa.serialize(results)
                        
                        # Put the serialized results in the plasma store
                        plasma_client.put(serialized, object_id)
                        
                        # Return the reference
                        result_queue.put({
                            "id": command_id,
                            "status": "success",
                            "result_ref": object_id.binary().hex()
                        })
                    else:
                        # No plasma store, return the results directly
                        result_queue.put({
                            "id": command_id,
                            "status": "success",
                            "results": results
                        })
                elif action == "unload_model":
                    # Unload a model
                    model_id = params.get("model_id")
                    
                    if not model_id:
                        raise ValueError("model_id parameter is required for unload_model action")
                    
                    # Check if the model is loaded
                    if model_id not in models:
                        raise ValueError(f"Model {model_id} not loaded")
                    
                    # Unload the model
                    del models[model_id]
                    if model_id in tokenizers:
                        del tokenizers[model_id]
                    
                    # Return success
                    result_queue.put({
                        "id": command_id,
                        "status": "success",
                        "model_id": model_id
                    })
                else:
                    # Unknown command
                    raise ValueError(f"Unknown action: {action}")
            except Exception as e:
                logger.error(f"Error executing action {action}: {e}")
                result_queue.put({
                    "id": command_id,
                    "status": "error",
                    "error": str(e)
                })
    except KeyboardInterrupt:
        logger.info("Interrupted")
    except Exception as e:
        logger.error(f"Error in ML process: {e}")
    finally:
        # Clean up
        logger.info("Stopping ML process")
        models.clear()
        tokenizers.clear()
        
        if plasma_client:
            plasma_client.disconnect()
            logger.info("Disconnected from plasma store")
        
        logger.info("ML process stopped")


class IPFSAccelerateServer:
    """
    IPFS Accelerate Server with multi-process architecture
    
    This class coordinates operations between the IPFS process and ML process.
    It provides a high-level API for model loading, inference, and IPFS operations.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Accelerate Server
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "plasma_socket": self.metadata.get("plasma_socket", "/tmp/plasma_accelerate"),
            "plasma_size_gb": self.metadata.get("plasma_size_gb", 1.0),
            "use_mock": self.metadata.get("use_mock", not (HAS_ML and HAS_ARROW))
        }
        
        # State
        self.running = False
        self.plasma_manager = None
        self.ipfs_process = None
        self.ml_process = None
        self.ipfs_command_queue = None
        self.ipfs_result_queue = None
        self.ml_command_queue = None
        self.ml_result_queue = None
        self.command_id = 0
        
        # Loaded models
        self.models = {}
        
        logger.info(f"IPFSAccelerateServer initialized with config: {self.config}")
    
    def start(self):
        """
        Start the IPFS Accelerate Server
        
        This starts the plasma store, IPFS process, and ML process.
        """
        if self.running:
            logger.warning("IPFS Accelerate Server already running")
            return
        
        # Start the plasma store
        if HAS_ARROW:
            self.plasma_manager = PlasmaManager(
                socket_path=self.config["plasma_socket"],
                size_gb=self.config["plasma_size_gb"]
            )
        
        # Set up queues
        self.ipfs_command_queue = mp.Queue()
        self.ipfs_result_queue = mp.Queue()
        self.ml_command_queue = mp.Queue()
        self.ml_result_queue = mp.Queue()
        
        # Start the processes
        self.ipfs_process = mp.Process(
            target=ipfs_process_fn,
            args=(self.ipfs_command_queue, self.ipfs_result_queue, self.config["plasma_socket"])
        )
        self.ipfs_process.daemon = True
        self.ipfs_process.start()
        
        self.ml_process = mp.Process(
            target=ml_process_fn,
            args=(self.ml_command_queue, self.ml_result_queue, self.config["plasma_socket"])
        )
        self.ml_process.daemon = True
        self.ml_process.start()
        
        self.running = True
        logger.info("IPFS Accelerate Server started")
    
    def stop(self):
        """
        Stop the IPFS Accelerate Server
        
        This stops the ML process, IPFS process, and plasma store.
        """
        if not self.running:
            logger.warning("IPFS Accelerate Server not running")
            return
        
        # Stop the processes
        if self.ml_process:
            self.ml_command_queue.put({"action": "exit"})
            self.ml_process.join(timeout=5)
            if self.ml_process.is_alive():
                self.ml_process.terminate()
            self.ml_process = None
        
        if self.ipfs_process:
            self.ipfs_command_queue.put({"action": "exit"})
            self.ipfs_process.join(timeout=5)
            if self.ipfs_process.is_alive():
                self.ipfs_process.terminate()
            self.ipfs_process = None
        
        # Stop the plasma store
        if self.plasma_manager:
            self.plasma_manager.shutdown()
            self.plasma_manager = None
        
        self.running = False
        logger.info("IPFS Accelerate Server stopped")
    
    def _get_next_command_id(self) -> str:
        """Get the next command ID"""
        self.command_id += 1
        return f"cmd_{self.command_id}"
    
    async def load_model_from_ipfs(self, model_id: str, cid: str) -> Dict[str, Any]:
        """
        Load a model from IPFS
        
        This combines IPFS and ML operations to load a model from IPFS.
        
        Args:
            model_id: Identifier for the model
            cid: IPFS content ID of the model
            
        Returns:
            Dict[str, Any]: Result of the operation
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Server not running")
        
        # Create a command ID
        command_id = self._get_next_command_id()
        
        # First, fetch the model from IPFS
        self.ipfs_command_queue.put({
            "id": command_id,
            "action": "fetch",
            "params": {
                "cid": cid
            }
        })
        
        # Wait for the result
        while True:
            try:
                result = self.ipfs_result_queue.get(timeout=60)
                if result.get("id") == command_id:
                    break
                else:
                    # Not our result, put it back
                    self.ipfs_result_queue.put(result)
            except Exception as e:
                logger.error(f"Error waiting for IPFS result: {e}")
                raise ValueError(f"Failed to fetch model from IPFS: {e}")
        
        if result.get("status") != "success":
            raise ValueError(f"Failed to fetch model from IPFS: {result.get('error')}")
        
        # Get the data reference or data
        data_ref = result.get("data_ref")
        data = result.get("data")
        
        # Create a temporary directory for the model
        with tempfile.TemporaryDirectory() as model_dir:
            # Write the model data to a file
            if data_ref:
                # Get the data from plasma
                object_id = plasma.ObjectID.from_hex(data_ref)
                data = self.plasma_manager.client.get(object_id).to_pybytes()
            
            model_path = os.path.join(model_dir, "model")
            with open(model_path, "wb") as f:
                f.write(data)
            
            # Now, load the model in the ML process
            ml_command_id = self._get_next_command_id()
            self.ml_command_queue.put({
                "id": ml_command_id,
                "action": "load_model",
                "params": {
                    "model_id": model_id,
                    "model_path": model_path
                }
            })
            
            # Wait for the result
            while True:
                try:
                    ml_result = self.ml_result_queue.get(timeout=60)
                    if ml_result.get("id") == ml_command_id:
                        break
                    else:
                        # Not our result, put it back
                        self.ml_result_queue.put(ml_result)
                except Exception as e:
                    logger.error(f"Error waiting for ML result: {e}")
                    raise ValueError(f"Failed to load model: {e}")
            
            if ml_result.get("status") != "success":
                raise ValueError(f"Failed to load model: {ml_result.get('error')}")
            
            # Store the model in our models dictionary
            self.models[model_id] = {
                "cid": cid,
                "loaded_at": time.time()
            }
            
            return {
                "status": "success",
                "model_id": model_id,
                "cid": cid
            }
    
    async def run_inference(self, model_id: str, inputs: str) -> Dict[str, Any]:
        """
        Run inference with a loaded model
        
        Args:
            model_id: Identifier for the model
            inputs: Input text for the model
            
        Returns:
            Dict[str, Any]: Result of the inference operation
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Server not running")
        
        # Check if the model is loaded
        if model_id not in self.models:
            raise ValueError(f"Model {model_id} not loaded")
        
        # Create a command ID
        command_id = self._get_next_command_id()
        
        # Use plasma store if available
        if HAS_ARROW and self.plasma_manager and self.plasma_manager.client:
            # Store inputs in plasma
            object_id = plasma.ObjectID.from_random()
            serialized = pa.serialize(inputs)
            self.plasma_manager.client.put(serialized, object_id)
            
            # Run inference with the reference
            self.ml_command_queue.put({
                "id": command_id,
                "action": "infer",
                "params": {
                    "model_id": model_id,
                    "data_ref": object_id.binary().hex()
                }
            })
        else:
            # Run inference with direct inputs
            self.ml_command_queue.put({
                "id": command_id,
                "action": "infer",
                "params": {
                    "model_id": model_id,
                    "inputs": inputs
                }
            })
        
        # Wait for the result
        while True:
            try:
                result = self.ml_result_queue.get(timeout=60)
                if result.get("id") == command_id:
                    break
                else:
                    # Not our result, put it back
                    self.ml_result_queue.put(result)
            except Exception as e:
                logger.error(f"Error waiting for ML result: {e}")
                raise ValueError(f"Failed to run inference: {e}")
        
        if result.get("status") != "success":
            raise ValueError(f"Failed to run inference: {result.get('error')}")
        
        # Get the result
        if "result_ref" in result:
            # Get the result from plasma
            object_id = plasma.ObjectID.from_hex(result["result_ref"])
            inference_result = pa.deserialize(self.plasma_manager.client.get(object_id))
        else:
            # Direct result
            inference_result = result.get("results")
        
        return {
            "status": "success",
            "model_id": model_id,
            "results": inference_result
        }
    
    async def unload_model(self, model_id: str) -> Dict[str, Any]:
        """
        Unload a model
        
        Args:
            model_id: Identifier for the model
            
        Returns:
            Dict[str, Any]: Result of the operation
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Server not running")
        
        # Check if the model is loaded
        if model_id not in self.models:
            raise ValueError(f"Model {model_id} not loaded")
        
        # Create a command ID
        command_id = self._get_next_command_id()
        
        # Unload the model
        self.ml_command_queue.put({
            "id": command_id,
            "action": "unload_model",
            "params": {
                "model_id": model_id
            }
        })
        
        # Wait for the result
        while True:
            try:
                result = self.ml_result_queue.get(timeout=60)
                if result.get("id") == command_id:
                    break
                else:
                    # Not our result, put it back
                    self.ml_result_queue.put(result)
            except Exception as e:
                logger.error(f"Error waiting for ML result: {e}")
                raise ValueError(f"Failed to unload model: {e}")
        
        if result.get("status") != "success":
            raise ValueError(f"Failed to unload model: {result.get('error')}")
        
        # Remove the model from our models dictionary
        del self.models[model_id]
        
        return {
            "status": "success",
            "model_id": model_id
        }
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing IPFS Accelerate Server")
        
        test_results = {
            "success": False,
            "module": "ipfs_accelerate_server_mp",
            "steps": {},
            "diagnostics": {
                "dependencies": {
                    "pyarrow": {"available": HAS_ARROW},
                    "ml": {"available": HAS_ML}
                },
                "plasma_store": {"available": HAS_ARROW and bool(self.plasma_manager)},
                "multi_process": {"available": True},
                "config": self.config
            }
        }
        
        try:
            # Test 1: Start the server
            if not self.running:
                self.start()
            
            test_results["steps"]["start_server"] = {
                "success": self.running,
                "message": "Server started successfully" if self.running else "Failed to start server"
            }
            
            if not self.running:
                test_results["success"] = False
                return test_results
            
            # Test 2: Load a mock model
            model_id = f"test_model_{int(time.time())}"
            cid = "QmTestModelCID"
            
            # We'll use a mock implementation for the test
            command_id = self._get_next_command_id()
            self.ml_command_queue.put({
                "id": command_id,
                "action": "load_model",
                "params": {
                    "model_id": model_id
                }
            })
            
            # Wait for the result
            result = None
            while True:
                try:
                    result = self.ml_result_queue.get(timeout=10)
                    if result.get("id") == command_id:
                        break
                    else:
                        # Not our result, put it back
                        self.ml_result_queue.put(result)
                except queue.Empty:
                    logger.error("Timed out waiting for ML result (load_model)")
                    break
                except Exception:
                    logger.exception("Unexpected error waiting for ML result (load_model)")
                    raise
            
            # Store the model in our models dictionary
            if result and result.get("status") == "success":
                self.models[model_id] = {
                    "cid": cid,
                    "loaded_at": time.time()
                }
                
                test_results["steps"]["load_model"] = {
                    "success": True,
                    "message": f"Model {model_id} loaded successfully"
                }
            else:
                test_results["steps"]["load_model"] = {
                    "success": False,
                    "message": f"Failed to load model: {result.get('error') if result else 'Timeout'}"
                }
                test_results["success"] = False
                return test_results
            
            # Test 3: Run inference
            inputs = "This is a test input for inference."
            
            command_id = self._get_next_command_id()
            self.ml_command_queue.put({
                "id": command_id,
                "action": "infer",
                "params": {
                    "model_id": model_id,
                    "inputs": inputs
                }
            })
            
            # Wait for the result
            result = None
            while True:
                try:
                    result = self.ml_result_queue.get(timeout=10)
                    if result.get("id") == command_id:
                        break
                    else:
                        # Not our result, put it back
                        self.ml_result_queue.put(result)
                except queue.Empty:
                    logger.error("Timed out waiting for ML result (infer)")
                    break
                except Exception:
                    logger.exception("Unexpected error waiting for ML result (infer)")
                    raise
            
            if result and result.get("status") == "success":
                test_results["steps"]["inference"] = {
                    "success": True,
                    "message": f"Inference with model {model_id} successful"
                }
            else:
                test_results["steps"]["inference"] = {
                    "success": False,
                    "message": f"Failed to run inference: {result.get('error') if result else 'Timeout'}"
                }
                test_results["success"] = False
                return test_results
            
            # Test 4: Unload the model
            command_id = self._get_next_command_id()
            self.ml_command_queue.put({
                "id": command_id,
                "action": "unload_model",
                "params": {
                    "model_id": model_id
                }
            })
            
            # Wait for the result
            result = None
            while True:
                try:
                    result = self.ml_result_queue.get(timeout=10)
                    if result.get("id") == command_id:
                        break
                    else:
                        # Not our result, put it back
                        self.ml_result_queue.put(result)
                except queue.Empty:
                    logger.error("Timed out waiting for ML result (unload_model)")
                    break
                except Exception:
                    logger.exception("Unexpected error waiting for ML result (unload_model)")
                    raise
            
            if result and result.get("status") == "success":
                # Remove the model from our models dictionary
                if model_id in self.models:
                    del self.models[model_id]
                
                test_results["steps"]["unload_model"] = {
                    "success": True,
                    "message": f"Model {model_id} unloaded successfully"
                }
            else:
                test_results["steps"]["unload_model"] = {
                    "success": False,
                    "message": f"Failed to unload model: {result.get('error') if result else 'Timeout'}"
                }
                test_results["success"] = False
                return test_results
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        except Exception as e:
            logger.error(f"Error in IPFS Accelerate Server test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import asyncio
    
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Create server
    server = IPFSAccelerateServer(metadata={"use_mock": True})
    
    async def test_server():
        try:
            # Start the server
            server.start()
            
            # Run tests
            test_results = await server.test()
            print(f"Test results: {json.dumps(test_results, indent=2)}")
            
            # Stop the server
            server.stop()
        except Exception as e:
            print(f"Error: {e}")
    
    # Run the test
    asyncio.run(test_server())
