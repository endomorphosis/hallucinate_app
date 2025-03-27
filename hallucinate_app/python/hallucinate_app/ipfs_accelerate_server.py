from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import sys
import os
import json
import asyncio

# Add parent directory to path to import ipfs_accelerate_py
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_accelerate_server")

# Try to import ipfs_accelerate_py
try:
    from ipfs_accelerate_py import ipfs_accelerate_py
    logger.info("Successfully imported ipfs_accelerate_py")
except ImportError as e:
    logger.error(f"Failed to import ipfs_accelerate_py: {e}")
    logger.warning("Using mock implementation for ipfs_accelerate_py")
    
    # For testing purposes, we'll create a mock implementation
    class MockAccelerate:
        def __init__(self):
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
            
    # Create a mock module
    ipfs_accelerate_py = MockAccelerate

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
    if isinstance(ipfs_accelerate_py, type):  # It's the mock class
        accelerator = ipfs_accelerate_py()
    else:  # It's the real module
        accelerator = ipfs_accelerate_py()
    logger.info("Accelerator initialized")
except Exception as e:
    logger.error(f"Error initializing accelerator: {e}")
    accelerator = None

# Track loaded models
loaded_models = {}
active_model = None

@app.on_event("startup")
async def startup_event():
    """Initialize on server startup"""
    try:
        if accelerator:
            # Initialize with default models if needed
            await accelerator.init_endpoints()
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
        await accelerator.init_endpoints([model_id])
        
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
        result = await accelerator.process_async(active_model, input_text)
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
        result = accelerator.test()
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
    uvicorn.run(app, host="127.0.0.1", port=8000)