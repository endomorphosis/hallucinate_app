"""
IPFS Transformers Dashboard Panel

Provides a dashboard panel for the IPFS Transformers module with ipfs_accelerate integration.
"""

import os
import json
import time
import asyncio
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_transformers_panel")

# Try to import required modules
try:
    from ..ipfs_transformers import IPFSTransformers, ipfs_transformers
    HAVE_TRANSFORMERS = True
except ImportError:
    logger.warning("Could not import IPFSTransformers, using mock implementation")
    HAVE_TRANSFORMERS = False

# Try to import ipfs_accelerate_py
try:
    import ipfs_accelerate_py
    HAVE_ACCELERATE = True
except ImportError:
    logger.warning("Could not import ipfs_accelerate_py, hardware acceleration will be limited")
    HAVE_ACCELERATE = False


class IPFSTransformersPanel:
    """Dashboard panel for IPFS Transformers with ipfs_accelerate integration"""
    
    def __init__(self, resources=None, config=None):
        """
        Initialize the IPFS Transformers dashboard panel
        
        Args:
            resources (dict): Resources required by the panel
            config (dict): Panel configuration
        """
        self.resources = resources or {}
        self.config = config or {
            "refresh_interval": 5,  # seconds
            "max_history": 50,      # operations to keep in history
            "show_models": True,    # display loaded models
            "auto_refresh": True,   # automatically refresh status
            "stream_buffer_size": 10  # buffer size for streaming responses
        }
        
        # Get transformers module from resources or use the default instance
        if "transformers" in self.resources:
            self.transformers = self.resources["transformers"]
        elif HAVE_TRANSFORMERS:
            self.transformers = ipfs_transformers
        else:
            # No implementation available
            self.transformers = None
            
        # Panel status
        self.status = {
            "connected": False,
            "initialized": False,
            "active_model": None,
            "loaded_models": {},
            "hardware_capabilities": {},
            "last_updated": None,
            "operations": [],
            "inference_history": [],
            "stats": {
                "total_inferences": 0,
                "successful_inferences": 0,
                "failed_inferences": 0,
                "avg_inference_time": 0,
                "accelerated_inferences": 0
            }
        }
        
        # Streaming buffer for model outputs
        self.streaming_buffer = []
        self.streaming_lock = threading.Lock()
        
        # Callback for dashboard updates
        self.update_callback = None
        
        # Threading controls
        self.stop_monitoring = threading.Event()
        self._monitor_thread = None
        
        # Panel is initialized when the transformers module is available
        self.initialized = HAVE_TRANSFORMERS and self.transformers is not None
        
    async def init(self):
        """Initialize the dashboard panel"""
        if not self.initialized:
            if not HAVE_TRANSFORMERS:
                logger.error("Cannot initialize panel: IPFSTransformers not available")
                return False
                
            if not self.transformers:
                logger.error("Cannot initialize panel: No transformers module provided")
                return False
        
        # Make sure transformers module is initialized
        if not self.transformers.initialized:
            try:
                await self.transformers.init()
            except Exception as e:
                logger.error(f"Failed to initialize transformers module: {e}")
                return False
        
        # Initial data refresh
        await self._refresh_data()
        
        # Start monitoring in a background thread if auto-refresh is enabled
        if self.config["auto_refresh"]:
            self._start_monitoring()
        
        self.initialized = True
        return True
        
    def _start_monitoring(self):
        """Start background monitoring thread"""
        if self._monitor_thread and self._monitor_thread.is_alive():
            # Already running
            return
            
        # Clear stop event
        self.stop_monitoring.clear()
        
        # Start thread
        self._monitor_thread = threading.Thread(
            target=self._monitor_thread_func,
            daemon=True
        )
        self._monitor_thread.start()
        logger.info("Transformers monitoring thread started")
        
    def _stop_monitoring(self):
        """Stop background monitoring thread"""
        if not self._monitor_thread or not self._monitor_thread.is_alive():
            # Not running
            return
            
        # Set stop event
        self.stop_monitoring.set()
        
        # Wait for thread to end with timeout
        self._monitor_thread.join(timeout=2.0)
        
        logger.info("Transformers monitoring thread stopped")
        
    def _monitor_thread_func(self):
        """Background thread for monitoring transformers status"""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        while not self.stop_monitoring.is_set():
            try:
                # Refresh data
                loop.run_until_complete(self._refresh_data())
                
                # Update dashboard if callback is set
                if self.update_callback:
                    self.update_callback(self.get_status())
            except Exception as e:
                logger.error(f"Error in transformers monitoring thread: {e}")
            
            # Wait for next refresh interval or until stopped
            self.stop_monitoring.wait(timeout=self.config["refresh_interval"])
            
        loop.close()
            
    async def _refresh_data(self):
        """Refresh dashboard data from transformers module"""
        if not self.transformers or not self.transformers.initialized:
            self.status["connected"] = False
            self.status["initialized"] = False
            return
            
        try:
            # Update basic status
            self.status["connected"] = True
            self.status["initialized"] = self.transformers.initialized
            self.status["active_model"] = self.transformers.active_model_id
            
            # Get loaded models from registry
            if self.config["show_models"]:
                self.status["loaded_models"] = {}
                for model_id, model_info in self.transformers.model_registry.items():
                    # Extract relevant info from model registry
                    model_data = {
                        "id": model_id,
                        "loaded_via": model_info.get("loaded_via", "unknown"),
                        "device": model_info.get("device", "cpu"),
                        "task": model_info.get("task", "unknown"),
                        "accelerated": model_info.get("loaded_via") == "ipfs_accelerate"
                    }
                    self.status["loaded_models"][model_id] = model_data
            
            # Hardware capabilities
            self.status["hardware_capabilities"] = self.transformers.hardware_capabilities
            
            # Add ipfs_accelerate status if available
            if HAVE_ACCELERATE and hasattr(self.transformers, "ipfs_accelerate") and self.transformers.ipfs_accelerate:
                # Include accelerate status
                self.status["ipfs_accelerate"] = {
                    "available": True,
                    "initialized": self.transformers.ipfs_accelerate.initialized if hasattr(self.transformers.ipfs_accelerate, "initialized") else False,
                    "version": getattr(ipfs_accelerate_py, "__version__", "unknown"),
                    "backends": getattr(self.transformers.ipfs_accelerate, "supported_backends", ["cpu"])
                }
            else:
                self.status["ipfs_accelerate"] = {
                    "available": False
                }
            
            self.status["last_updated"] = datetime.now().isoformat()
            
        except Exception as e:
            logger.error(f"Error refreshing transformers data: {e}")
            self.status["connected"] = False
            
    def get_status(self) -> Dict[str, Any]:
        """Get current panel status"""
        return self.status
        
    def set_update_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Set callback for dashboard updates"""
        self.update_callback = callback
        
    def add_to_streaming_buffer(self, data):
        """Add data to streaming buffer with thread safety"""
        with self.streaming_lock:
            self.streaming_buffer.append(data)
            # Trim buffer if needed
            if len(self.streaming_buffer) > self.config["stream_buffer_size"]:
                self.streaming_buffer = self.streaming_buffer[-self.config["stream_buffer_size"]:]
            
    def get_streaming_buffer(self):
        """Get current streaming buffer with thread safety"""
        with self.streaming_lock:
            return list(self.streaming_buffer)
        
    def clear_streaming_buffer(self):
        """Clear streaming buffer with thread safety"""
        with self.streaming_lock:
            self.streaming_buffer.clear()
        
    async def handle_streaming_response(self, stream_generator):
        """Process streaming response from model"""
        if not stream_generator:
            return
            
        # Clear buffer before starting
        self.clear_streaming_buffer()
        
        try:
            async for chunk in stream_generator:
                # Add chunk to buffer
                self.add_to_streaming_buffer(chunk)
                
                # Update dashboard if callback is set
                if self.update_callback:
                    # Create a status update focused on streaming content
                    streaming_status = {
                        "streaming": True,
                        "buffer": self.get_streaming_buffer(),
                        "timestamp": datetime.now().isoformat()
                    }
                    self.update_callback({"streaming": streaming_status})
        except Exception as e:
            logger.error(f"Error processing streaming response: {e}")
            # Add error to buffer
            self.add_to_streaming_buffer({"error": str(e)})
            
            # Final update
            if self.update_callback:
                streaming_status = {
                    "streaming": False,
                    "error": str(e),
                    "buffer": self.get_streaming_buffer(),
                    "timestamp": datetime.now().isoformat()
                }
                self.update_callback({"streaming": streaming_status})
                
    async def execute_operation(self, operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a transformers operation
        
        Args:
            operation (str): Operation to execute
                - load_model: Load a model
                - run_inference: Run inference with a model
                - refresh: Refresh status
            params (dict): Operation parameters
                
        Returns:
            dict: Operation result
        """
        if not self.transformers or not self.transformers.initialized:
            return {
                "success": False,
                "operation": operation,
                "error": "Transformers module not initialized"
            }
            
        try:
            start_time = datetime.now()
            result = None
            
            if operation == "load_model":
                if "model_id" not in params:
                    return {
                        "success": False,
                        "operation": operation,
                        "error": "Missing required parameter: model_id"
                    }
                    
                model_id = params["model_id"]
                task = params.get("task", None)
                options = params.get("options", {})
                
                # Execute the model loading
                result = await self.transformers.load_model(model_id, task, options)
                success = result.get("success", False)
                
            elif operation == "run_inference":
                if "inputs" not in params:
                    return {
                        "success": False,
                        "operation": operation,
                        "error": "Missing required parameter: inputs"
                    }
                    
                inputs = params["inputs"]
                model_id = params.get("model_id", None)
                options = params.get("options", {})
                
                # Check if streaming is requested
                is_streaming = options.get("stream", False)
                
                # Execute the inference
                result = await self.transformers.run_inference(inputs, model_id, options)
                success = result.get("success", False)
                
                # Handle streaming if enabled
                if success and is_streaming and "stream" in result:
                    # Start async task to handle streaming
                    asyncio.create_task(self.handle_streaming_response(result["stream"]))
                    
                # Update statistics
                self.status["stats"]["total_inferences"] += 1
                if success:
                    self.status["stats"]["successful_inferences"] += 1
                    # Check if accelerated
                    if "accelerated" in result and result["accelerated"]:
                        self.status["stats"]["accelerated_inferences"] += 1
                else:
                    self.status["stats"]["failed_inferences"] += 1
                
            elif operation == "refresh":
                await self._refresh_data()
                success = True
                
            else:
                return {
                    "success": False,
                    "operation": operation,
                    "error": f"Unknown operation: {operation}"
                }
                
            # Calculate duration
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            # Format result
            operation_result = {
                "success": success,
                "operation": operation,
                "params": {k: v for k, v in params.items() if k != "auth_token"},  # Don't log auth token
                "timestamp": end_time.isoformat(),
                "duration": duration
            }
            
            # Add result details if available (excluding potentially large model outputs)
            if result and isinstance(result, dict):
                # Filter out large output data to avoid flooding the log
                filtered_result = {k: v for k, v in result.items() 
                                  if k not in ["outputs", "stream", "results"]}
                operation_result["result"] = filtered_result
                
            # Add to operation history
            self.status["operations"].append(operation_result)
            
            # Add to inference history if applicable
            if operation == "run_inference" and success:
                inference_entry = {
                    "timestamp": end_time.isoformat(),
                    "model_id": model_id or self.transformers.active_model_id,
                    "duration": duration,
                    "accelerated": result.get("accelerated", False),
                    "input_preview": str(inputs)[:100] if isinstance(inputs, str) else "non-text input",
                    "streaming": options.get("stream", False)
                }
                self.status["inference_history"].append(inference_entry)
                
                # Update average inference time
                successful = self.status["stats"]["successful_inferences"]
                current_avg = self.status["stats"]["avg_inference_time"]
                new_avg = ((current_avg * (successful - 1)) + duration) / successful
                self.status["stats"]["avg_inference_time"] = new_avg
            
            # Trim histories if needed
            if len(self.status["operations"]) > self.config["max_history"]:
                self.status["operations"] = self.status["operations"][-self.config["max_history"]:]
                
            if len(self.status["inference_history"]) > self.config["max_history"]:
                self.status["inference_history"] = self.status["inference_history"][-self.config["max_history"]:]
                
            # Refresh data
            await self._refresh_data()
            
            # Update dashboard if callback is set
            if self.update_callback:
                self.update_callback(self.get_status())
                
            return operation_result
            
        except Exception as e:
            logger.error(f"Error executing operation {operation}: {e}")
            return {
                "success": False,
                "operation": operation,
                "error": str(e)
            }
    
    def get_html(self):
        """
        Generate HTML representation of the dashboard panel
        
        Returns:
            str: HTML content
        """
        html = """
        <div class="ipfs-transformers-panel panel">
            <div class="panel-header">
                <h2>IPFS Transformers</h2>
                <div class="panel-controls">
                    <button class="refresh-btn" onclick="refreshTransformersPanel()">Refresh</button>
                </div>
            </div>
            
            <div class="panel-status">
                <div class="status-item">
                    <span class="status-label">Status:</span>
                    <span class="status-value status-indicator {status_class}">{status}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Active Model:</span>
                    <span class="status-value">{active_model}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Hardware:</span>
                    <span class="status-value">{hardware}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Accelerate:</span>
                    <span class="status-value {accelerate_class}">{accelerate}</span>
                </div>
            </div>
            
            <div class="panel-tabs">
                <div class="tab-header">
                    <button class="tab-btn active" data-tab="models">Models</button>
                    <button class="tab-btn" data-tab="inference">Inference</button>
                    <button class="tab-btn" data-tab="hardware">Hardware</button>
                    <button class="tab-btn" data-tab="operations">Operations</button>
                </div>
                
                <div class="tab-content active" id="models-tab">
                    <h3>Loaded Models</h3>
                    <div class="models-list">
                        {models_list}
                    </div>
                    
                    <div class="model-actions">
                        <h4>Load Model</h4>
                        <div class="action-form">
                            <input type="text" id="model-id-input" placeholder="Model ID">
                            <select id="model-task-select">
                                <option value="text-generation">Text Generation</option>
                                <option value="feature-extraction">Feature Extraction</option>
                                <option value="token-classification">Token Classification</option>
                                <option value="image-classification">Image Classification</option>
                                <option value="fill-mask">Fill Mask</option>
                            </select>
                            <select id="model-device-select">
                                <option value="cpu">CPU</option>
                                <option value="cuda:0">CUDA (GPU)</option>
                                <option value="openvino:0">OpenVINO</option>
                            </select>
                            <button onclick="loadTransformersModel()">Load Model</button>
                        </div>
                    </div>
                </div>
                
                <div class="tab-content" id="inference-tab">
                    <h3>Run Inference</h3>
                    <div class="inference-form">
                        <textarea id="inference-input" placeholder="Enter input text..."></textarea>
                        <div class="inference-options">
                            <label>
                                <input type="checkbox" id="inference-stream-checkbox"> Enable streaming
                            </label>
                            <label>
                                <input type="checkbox" id="inference-accelerate-checkbox" {accelerate_checkbox}> Use hardware acceleration
                            </label>
                            <label>Model:
                                <select id="inference-model-select">
                                    {model_options}
                                </select>
                            </label>
                        </div>
                        <button onclick="runTransformersInference()">Run Inference</button>
                    </div>
                    
                    <div class="inference-output">
                        <h4>Output</h4>
                        <pre id="inference-output-content">{inference_output}</pre>
                    </div>
                    
                    <div class="inference-history">
                        <h4>History</h4>
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Model</th>
                                    <th>Duration (s)</th>
                                    <th>Input</th>
                                    <th>Accelerated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inference_history}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="tab-content" id="hardware-tab">
                    <h3>Hardware Capabilities</h3>
                    <div class="hardware-capabilities">
                        {hardware_capabilities}
                    </div>
                    
                    <h3>ipfs_accelerate Status</h3>
                    <div class="accelerate-status">
                        {accelerate_status}
                    </div>
                </div>
                
                <div class="tab-content" id="operations-tab">
                    <h3>Operations Log</h3>
                    <table class="operations-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Operation</th>
                                <th>Status</th>
                                <th>Duration (s)</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {operations_log}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        """
        
        # Format status values
        status_class = "status-up" if self.status["connected"] and self.status["initialized"] else "status-down"
        status_text = "Connected" if self.status["connected"] and self.status["initialized"] else "Disconnected"
        
        active_model = self.status["active_model"] or "None"
        
        # Format hardware info
        hardware_info = []
        for hw, available in self.status["hardware_capabilities"].items():
            if available:
                hardware_info.append(hw)
        hardware_text = ", ".join(hardware_info) if hardware_info else "CPU only"
        
        # Format accelerate info
        accelerate_status = self.status.get("ipfs_accelerate", {})
        accelerate_available = accelerate_status.get("available", False)
        accelerate_initialized = accelerate_status.get("initialized", False)
        
        if accelerate_available and accelerate_initialized:
            accelerate_text = "Available & Initialized"
            accelerate_class = "status-up"
            accelerate_checkbox = "checked"
        elif accelerate_available:
            accelerate_text = "Available (Not Initialized)"
            accelerate_class = "status-warning"
            accelerate_checkbox = ""
        else:
            accelerate_text = "Not Available"
            accelerate_class = "status-down"
            accelerate_checkbox = "disabled"
        
        # Format models list
        models_list = ""
        model_options = f'<option value="">Select a model</option>'
        
        if self.status["loaded_models"]:
            for model_id, model_info in self.status["loaded_models"].items():
                model_class = "model-accelerated" if model_info.get("accelerated", False) else ""
                device = model_info.get("device", "cpu")
                task = model_info.get("task", "unknown")
                
                models_list += f"""
                <div class="model-item {model_class}">
                    <div class="model-header">
                        <span class="model-id">{model_id}</span>
                        <span class="model-task">{task}</span>
                    </div>
                    <div class="model-details">
                        <span class="model-device">Device: {device}</span>
                        <span class="model-loader">Loader: {model_info.get("loaded_via", "unknown")}</span>
                    </div>
                </div>
                """
                
                # Add to model select options
                model_options += f'<option value="{model_id}">{model_id}</option>'
        else:
            models_list = "<p>No models loaded</p>"
            
        # Format inference history
        inference_history = ""
        for entry in reversed(self.status["inference_history"]):
            time_str = entry.get("timestamp", "").split("T")[1].split(".")[0]  # Just the time part
            model_id = entry.get("model_id", "unknown")
            duration = f"{entry.get('duration', 0):.3f}"
            input_preview = entry.get("input_preview", "")
            accelerated = "Yes" if entry.get("accelerated", False) else "No"
            
            inference_history += f"""
            <tr>
                <td>{time_str}</td>
                <td>{model_id}</td>
                <td>{duration}</td>
                <td>{input_preview}</td>
                <td>{accelerated}</td>
            </tr>
            """
            
        # Format hardware capabilities
        hardware_capabilities = ""
        for hw, available in self.status["hardware_capabilities"].items():
            status_class = "status-up" if available else "status-down"
            status_text = "Available" if available else "Not Available"
            
            hardware_capabilities += f"""
            <div class="capability-item">
                <span class="capability-name">{hw.upper()}</span>
                <span class="capability-status {status_class}">{status_text}</span>
            </div>
            """
            
        # Format accelerate status
        accelerate_status = ""
        if accelerate_available:
            version = self.status["ipfs_accelerate"].get("version", "unknown")
            backends = ", ".join(self.status["ipfs_accelerate"].get("backends", ["cpu"]))
            
            accelerate_status += f"""
            <div class="accelerate-info">
                <div class="info-item">
                    <span class="info-label">Version:</span>
                    <span class="info-value">{version}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Backends:</span>
                    <span class="info-value">{backends}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Status:</span>
                    <span class="info-value {accelerate_class}">{accelerate_text}</span>
                </div>
            </div>
            """
        else:
            accelerate_status = """
            <div class="accelerate-not-available">
                <p>ipfs_accelerate_py is not available in this environment. Hardware acceleration will be limited.</p>
                <p>Install ipfs_accelerate_py to enable hardware-accelerated inference across multiple backends.</p>
            </div>
            """
            
        # Format operations log
        operations_log = ""
        for op in reversed(self.status["operations"]):
            time_str = op.get("timestamp", "").split("T")[1].split(".")[0]  # Just the time part
            operation = op.get("operation", "unknown")
            status = "Success" if op.get("success", False) else "Failed"
            status_class = "status-up" if op.get("success", False) else "status-down"
            duration = f"{op.get('duration', 0):.3f}"
            
            # Format details
            details = ""
            if "error" in op:
                details = f"Error: {op['error']}"
            elif "result" in op:
                details_items = []
                for k, v in op["result"].items():
                    if k not in ["success", "operation", "error"]:
                        details_items.append(f"{k}: {v}")
                details = ", ".join(details_items)
            
            operations_log += f"""
            <tr>
                <td>{time_str}</td>
                <td>{operation}</td>
                <td class="{status_class}">{status}</td>
                <td>{duration}</td>
                <td>{details}</td>
            </tr>
            """
            
        # Format inference output
        inference_output = "Run inference to see results here"
            
        # Substitute all values
        html = html.format(
            status_class=status_class,
            status=status_text,
            active_model=active_model,
            hardware=hardware_text,
            accelerate=accelerate_text,
            accelerate_class=accelerate_class,
            models_list=models_list,
            model_options=model_options,
            inference_history=inference_history,
            hardware_capabilities=hardware_capabilities,
            accelerate_status=accelerate_status,
            operations_log=operations_log,
            inference_output=inference_output,
            accelerate_checkbox=accelerate_checkbox
        )
        
        return html
            
    def test(self):
        """Test the dashboard panel"""
        try:
            # Run tests
            loop = asyncio.get_event_loop()
            
            # Test initialization
            init_result = loop.run_until_complete(self.init())
            
            # Test data refresh
            if init_result:
                loop.run_until_complete(self._refresh_data())
                
            # Test operation execution with mock
            operations_test = False
            if init_result and self.transformers:
                # Try a simple refresh operation
                refresh_result = loop.run_until_complete(
                    self.execute_operation("refresh", {})
                )
                operations_test = refresh_result.get("success", False)
                
            # Compile results
            results = {
                "success": init_result,
                "module": "ipfs_transformers_panel",
                "initialization": init_result,
                "data_refresh": init_result,
                "operations_test": operations_test,
                "capability_check": {
                    "transformers": self.transformers is not None,
                    "ipfs_accelerate": HAVE_ACCELERATE
                },
                "config": self.config
            }
            
            return results
        except Exception as e:
            logger.error(f"IPFSTransformersPanel test failed: {e}")
            return {
                "success": False,
                "module": "ipfs_transformers_panel",
                "error": str(e)
            }


# Create default instance
ipfs_transformers_panel = IPFSTransformersPanel()