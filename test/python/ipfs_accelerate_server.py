from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import sys
import os
import json

# Add parent directory to path to import ipfs_accelerate_py
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import ipfs_accelerate_py
except ImportError:
    print("Error: ipfs_accelerate_py module not found. Make sure it's installed.")
    # For testing purposes, we'll create a mock implementation
    class MockAccelerate:
        def __init__(self, resources, metadata):
            self.resources = resources
            self.metadata = metadata
            self.loaded_models = {}
            
        def test(self):
            return {"status": "mock implementation"}
            
        def load_model(self, model_id):
            self.loaded_models[model_id] = {
                "id": model_id,
                "status": "loaded",
                "mock": True
            }
            return {"status": "success", "model": model_id}
            
        def run_inference(self, input_data):
            return {
                "result": f"Mock inference result for input: {input_data}",
                "mock": True
            }
    
    # Create a mock module
    class MockModule:
        pass
    
    ipfs_accelerate_py = MockModule()
    ipfs_accelerate_py.ipfs_accelerate = MockAccelerate

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

# Initialize resources and metadata
resources = {}
metadata = {}

# Initialize accelerator
try:
    accelerator = ipfs_accelerate_py.ipfs_accelerate(resources, metadata)
except Exception as e:
    print(f"Error initializing accelerator: {e}")
    accelerator = None

@app.get("/status")
def get_status():
    """Get server status"""
    return {"status": "running"}

@app.post("/load_model")
def load_model(request: ModelRequest):
    """Load a model by ID"""
    if not accelerator:
        raise HTTPException(status_code=500, detail="Accelerator not initialized")
    
    try:
        result = accelerator.load_model(request.model_id)
        return {"status": "success", "model": request.model_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/inference")
def run_inference(request: InferenceRequest):
    """Run inference with the loaded model"""
    if not accelerator:
        raise HTTPException(status_code=500, detail="Accelerator not initialized")
    
    try:
        # Convert request to dict for processing
        input_data = request.dict(exclude_unset=True)
        result = accelerator.run_inference(input_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test")
def run_test():
    """Run accelerator test"""
    if not accelerator:
        raise HTTPException(status_code=500, detail="Accelerator not initialized")
    
    try:
        result = accelerator.test()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Start server
    uvicorn.run(app, host="127.0.0.1", port=8000)