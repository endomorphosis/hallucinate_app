from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import sys
import os
import json
import asyncio
import time
from collections import defaultdict
import inspect
from hallucinate_app.submodule_compat import instantiate_from_candidates, resolve_maybe_awaitable

# Add parent directory to path to import ipfs_accelerate_py
parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(parent_dir)
print(f"Added to path: {parent_dir}")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_accelerate_server")

# Try to import ipfs_accelerate_py
try:
    import ipfs_accelerate_py
    logger.info("Successfully imported ipfs_accelerate_py")
except ImportError as e:
    logger.error(f"Failed to import ipfs_accelerate_py: {e}")
    logger.warning("Using mock implementation for ipfs_accelerate_py")
    
    # For testing purposes, we'll create a mock implementation
    class MockAccelerate:
        def __init__(self, resources=None, metadata=None):
            self.resources = resources or {}
            self.metadata = metadata or {}
            self.loaded_models = {}
            logger.info("Initialized mock ipfs_accelerate")
            
        async def init_endpoints(self, models=None):
            logger.info(f"Mock initializing endpoints for models: {models}")
            return True
            
        async def process_async(self, model_id, input_text):
            logger.info(f"Mock processing with model {model_id}: {input_text}")
            return {
                "model": model_id,
                "input": input_text,
                "output": f"Mock output for input: {input_text}",
                "mock": True
            }
            
        def test(self):
            logger.info("Running mock test")
            return {
                "status": "mock implementation",
                "test_results": {
                    "initialization": True,
                    "model_loading": True,
                    "inference": True
                }
            }
            
    class MockModule:
        ipfs_accelerate_py = MockAccelerate
    ipfs_accelerate_py = MockModule()

# FastAPI models
class ModelRequest(BaseModel):
    model_id: str

class InferenceRequest(BaseModel):
    text: str = None
    image: str = None
    data: dict = None

# Initialize FastAPI app
app = FastAPI(title="IPFS Accelerate Model Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize accelerator
try:
    accelerator = instantiate_from_candidates(
        ipfs_accelerate_py,
        ("ipfs_accelerate_py", "ipfs_accelerate", "AccelerateServer"),
        {},
        {}
    )
    logger.info("Initialized accelerator instance")
    logger.info("Accelerator initialized successfully")
except Exception as e:
    logger.error(f"Error initializing accelerator: {e}")
    accelerator = None

# Track loaded models
loaded_models = {}
active_model = None
integration_metrics = {
    "endpoint_calls": defaultdict(int),
    "endpoint_errors": defaultdict(int),
    "endpoint_retries": defaultdict(int),
    "endpoint_total_ms": defaultdict(float),
}


async def run_with_metrics(endpoint_name, operation, retries=1):
    started = time.perf_counter()
    integration_metrics["endpoint_calls"][endpoint_name] += 1
    attempts = 0
    max_attempts = max(1, retries + 1)
    try:
        while True:
            attempts += 1
            try:
                result = operation()
                if inspect.isawaitable(result):
                    result = await result
                return result
            except Exception:
                if attempts >= max_attempts:
                    integration_metrics["endpoint_errors"][endpoint_name] += 1
                    raise
                integration_metrics["endpoint_retries"][endpoint_name] += 1
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        integration_metrics["endpoint_total_ms"][endpoint_name] += elapsed_ms


@app.get("/integration_metrics")
def get_integration_metrics():
    summary = {}
    for endpoint, calls in integration_metrics["endpoint_calls"].items():
        total_ms = integration_metrics["endpoint_total_ms"][endpoint]
        summary[endpoint] = {
            "calls": calls,
            "errors": integration_metrics["endpoint_errors"][endpoint],
            "retries": integration_metrics["endpoint_retries"][endpoint],
            "avg_latency_ms": round((total_ms / calls), 2) if calls else 0.0
        }
    return {"status": "ok", "metrics": summary}

@app.on_event("startup")
async def startup_event():
    """Initialize on server startup"""
    try:
        if accelerator:
            # Initialize with default models if needed
            await run_with_metrics("startup", lambda: accelerator.init_endpoints(), retries=1)
            logger.info("Accelerator endpoints initialized")
    except Exception as e:
        logger.error(f"Startup initialization failed: {e}")

@app.get("/status")
def get_status():
    """Get server status"""
    return {
        "status": "running",
        "active_model": active_model,
        "loaded_models": list(loaded_models.keys())
    }

@app.post("/load_model")
async def load_model(request: ModelRequest):
    """Load a model by ID"""
    global active_model
    
    if not accelerator:
        raise HTTPException(status_code=500, detail="Accelerator not initialized")
    
    try:
        model_id = request.model_id
        logger.info(f"Loading model: {model_id}")
        
        # Initialize the endpoint for this model if needed
        await run_with_metrics("load_model", lambda: accelerator.init_endpoints([model_id]), retries=1)
        
        # Track the loaded model
        loaded_models[model_id] = {
            "id": model_id,
            "status": "loaded"
        }
        active_model = model_id
        
        return {
            "status": "success", 
            "model": model_id,
            "message": f"Model {model_id} loaded successfully"
        }
    except Exception as e:
        error_msg = f"Failed to load model {request.model_id}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/inference")
async def run_inference(request: InferenceRequest):
    """Run inference with the loaded model"""
    global active_model
    
    if not accelerator:
        raise HTTPException(status_code=500, detail="Accelerator not initialized")
    
    if not active_model:
        raise HTTPException(status_code=400, detail="No model loaded. Call /load_model first.")
    
    try:
        # Convert request to dict for processing
        input_data = request.dict(exclude_unset=True)
        logger.info(f"Running inference with model {active_model}")
        
        # Extract input text
        input_text = input_data.get("text", "")
        if not input_text:
            # Try to get input from data field
            if "data" in input_data and isinstance(input_data["data"], dict):
                input_text = input_data["data"].get("text", "")
        
        if not input_text:
            raise HTTPException(status_code=400, detail="No text input provided")
        
        # Process the input
        result = await run_with_metrics(
            "inference",
            lambda: accelerator.process_async(active_model, input_text),
            retries=1
        )
        return result
    except Exception as e:
        error_msg = f"Inference failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/test")
def run_test():
    """Run accelerator test"""
    if not accelerator:
        raise HTTPException(status_code=500, detail="Accelerator not initialized")
    
    try:
        result = resolve_maybe_awaitable(accelerator.test())
        return result
    except Exception as e:
        error_msg = f"Test failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Start server
    print("Starting IPFS Accelerate server on http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
