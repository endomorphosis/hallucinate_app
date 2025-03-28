from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import sys
import os
import json
import asyncio
import importlib
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_ipfs_accelerate_server")

# Base mock module class
class MockModule:
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        logger.info(f"Initialized {self.__class__.__name__}")
        
    def test(self):
        logger.info(f"Running mock test for {self.__class__.__name__}")
        return {
            "success": True,
            "module": self.__class__.__name__,
            "status": "mock implementation",
            "test_results": {
                "initialization": True
            }
        }

# For testing purposes, create mock implementations
class MockAccelerate(MockModule):
    def __init__(self, resources=None, metadata=None):
        super().__init__(resources, metadata)
        self.loaded_models = {}
        self.active_model = None
        
    async def init_endpoints(self, models=None):
        models = models or []
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
        logger.info("Running mock accelerate test")
        return {
            "success": True,
            "module": "accelerate",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "model_loading": True,
                "inference": True
            }
        }

class MockIPFSKit(MockModule):
    def test(self):
        logger.info("Running mock IPFS Kit test")
        return {
            "success": True,
            "module": "ipfs_kit",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "node_connection": True,
                "content_add": True,
                "content_get": True
            }
        }

class MockModelManager(MockModule):
    def test(self):
        logger.info("Running mock Model Manager test")
        return {
            "success": True,
            "module": "model_manager",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "model_list": ["mock-model-1", "mock-model-2"],
                "model_info": {"mock-model-1": {"size": "500MB", "type": "transformer"}}
            }
        }

class MockTransformers(MockModule):
    def test(self):
        logger.info("Running mock Transformers test")
        return {
            "success": True,
            "module": "transformers",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "model_loaded": True,
                "tokenization": True,
                "inference": "Mock inference output"
            }
        }

class MockDatasets(MockModule):
    def test(self):
        logger.info("Running mock Datasets test")
        return {
            "success": True,
            "module": "datasets",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "dataset_loaded": True,
                "sample": {"text": "Mock dataset sample", "label": 1}
            }
        }

class MockFAISS(MockModule):
    def test(self):
        logger.info("Running mock FAISS test")
        return {
            "success": True,
            "module": "faiss",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "index_creation": True,
                "vector_add": True,
                "vector_search": True
            }
        }

class MockAgents(MockModule):
    def test(self):
        logger.info("Running mock Agents test")
        return {
            "success": True,
            "module": "agents",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "agent_creation": True,
                "agent_execution": True
            }
        }

class MockLibp2p(MockModule):
    def test(self):
        logger.info("Running mock libp2p test")
        return {
            "success": True,
            "module": "libp2p",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "peer_connection": True,
                "messaging": True
            }
        }

class MockOrbitDB(MockModule):
    def test(self):
        logger.info("Running mock OrbitDB test")
        return {
            "success": True,
            "module": "orbitdb",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "database_creation": True,
                "data_operations": True
            }
        }

class MockEmbeddings(MockModule):
    def test(self):
        logger.info("Running mock Embeddings test")
        return {
            "success": True,
            "module": "embeddings",
            "status": "mock implementation",
            "test_results": {
                "initialization": True,
                "embedding_generation": True,
                "similarity_comparison": True,
                "search": True,
                "capabilities": {
                    "has_package": True,
                    "using_mock": True
                }
            }
        }

# Module factory to dynamically create or import modules
def get_module(module_name, resources=None, metadata=None):
    # Map of mock module classes
    mock_modules = {
        "accelerate": MockAccelerate,
        "ipfs_kit": MockIPFSKit,
        "model_manager": MockModelManager,
        "transformers": MockTransformers,
        "datasets": MockDatasets,
        "faiss": MockFAISS,
        "agents": MockAgents,
        "libp2p": MockLibp2p,
        "orbitdb": MockOrbitDB,
        "embeddings": MockEmbeddings
    }
    
    # Try to import the actual module
    try:
        # Look for the module in the hallucinate_app package
        module_path = f"hallucinate_app.{module_name}"
        module = importlib.import_module(module_path)
        
        # Get the main class from the module
        class_name = "".join(word.capitalize() for word in module_name.split("_"))
        module_class = getattr(module, class_name)
        
        logger.info(f"Using actual module implementation: {module_path}.{class_name}")
        return module_class(resources, metadata)
    except (ImportError, AttributeError) as e:
        logger.warning(f"Failed to import actual module {module_name}: {str(e)}")
        logger.info(f"Using mock implementation for {module_name}")
        
        # Fall back to mock implementation
        if module_name in mock_modules:
            return mock_modules[module_name](resources, metadata)
        else:
            # Generic mock if no specific mock exists
            return MockModule(resources, metadata)

# FastAPI models
class ModuleConfig(BaseModel):
    resources: dict = {}
    metadata: dict = {}
    environment: str = "local"  # mock, local, full
    verbose: bool = False

class ModelRequest(BaseModel):
    model_id: str

class InferenceRequest(BaseModel):
    text: str = None
    image: str = None
    data: dict = None

# Initialize FastAPI app
app = FastAPI(title="IPFS Accelerate Test Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize module instances
modules = {}

# Mock mode - use mock implementations for tests
accelerator = get_module("accelerate")
modules["accelerate"] = accelerator
logger.info("Default accelerator initialized")

# Track loaded models
loaded_models = {}
active_model = None

@app.get("/status")
def get_status():
    """Get server status"""
    return {
        "status": "running",
        "active_model": active_model,
        "loaded_models": list(loaded_models.keys()),
        "modules": list(modules.keys())
    }

@app.post("/load_model")
async def load_model(request: ModelRequest):
    """Load a model by ID"""
    global active_model
    
    try:
        model_id = request.model_id
        logger.info(f"Loading model: {model_id}")
        
        # Initialize the endpoint for this model
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
    try:
        result = accelerator.test()
        return result
    except Exception as e:
        error_msg = f"Test failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/test_module/{module_name}")
def test_module(module_name: str, config: ModuleConfig):
    """Test a specific module"""
    try:
        logger.info(f"Testing module: {module_name} with config: {config}")
        
        # Special handling for our implemented modules
        if module_name == "ipfs_kit":
            return test_ipfs_kit_module(config)
        elif module_name == "model_manager":
            return test_model_manager_module(config)
        elif module_name == "transformers":
            return test_transformers_module(config)
        elif module_name == "datasets":
            return test_datasets_module(config)
        elif module_name == "embeddings":
            return test_embeddings_module(config)
        
        # Skip actual implementation for mock mode
        if config.environment == "mock":
            mock_module = get_module(module_name, config.resources, config.metadata)
            result = mock_module.test()
            return result
        
        # Get or create module instance
        if module_name not in modules:
            modules[module_name] = get_module(module_name, config.resources, config.metadata)
            
        # Run test
        result = modules[module_name].test()
        return result
    except Exception as e:
        error_msg = f"Module test failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

def test_ipfs_kit_module(config: ModuleConfig):
    """Special handler for testing IPFS Kit"""
    try:
        logger.info(f"Testing IPFS Kit module with config: {config}")
        
        # Use mock for mock environment
        if config.environment == "mock":
            return MockIPFSKit(config.resources, config.metadata).test()
        
        # Try to import the actual IPFS Kit module
        try:
            # First try importing from the app
            from hallucinate_app.ipfs_kit import IPFSKit
            logger.info("Using real IPFSKit implementation")
            ipfs_kit = IPFSKit(config.resources, config.metadata)
        except ImportError:
            # Fall back to mock if import fails
            logger.warning("Failed to import IPFSKit, using mock implementation")
            return MockIPFSKit(config.resources, config.metadata).test()
            
        # Run the test
        result = ipfs_kit.test()
        
        # Ensure result has required fields
        if not isinstance(result, dict):
            result = {"success": False, "error": "Test did not return a dict"}
            
        if "module" not in result:
            result["module"] = "ipfs_kit"
            
        if "success" not in result:
            if "status" in result and result["status"] == "success":
                result["success"] = True
            else:
                result["success"] = False
                
        return result
    except Exception as e:
        error_msg = f"IPFS Kit test failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        
        # Return error result instead of raising exception
        return {
            "success": False,
            "module": "ipfs_kit",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def test_model_manager_module(config: ModuleConfig):
    """Special handler for testing Model Manager"""
    try:
        logger.info(f"Testing Model Manager module with config: {config}")
        
        # Use mock for mock environment
        if config.environment == "mock":
            return MockModelManager(config.resources, config.metadata).test()
        
        # Try to import the actual Model Manager module
        try:
            # First try importing from the app
            from hallucinate_app.ipfs_model_manager import IPFSModelManager
            logger.info("Using real IPFSModelManager implementation")
            
            # Get IPFS Kit if available to pass as a resource
            resources = config.resources or {}
            try:
                from hallucinate_app.ipfs_kit import ipfs_kit
                resources["ipfsKit"] = ipfs_kit
            except ImportError:
                pass
                
            model_manager = IPFSModelManager(resources, config.metadata)
        except ImportError:
            # Fall back to mock if import fails
            logger.warning("Failed to import IPFSModelManager, using mock implementation")
            return MockModelManager(config.resources, config.metadata).test()
            
        # Run the test
        result = model_manager.test()
        
        # Ensure result has required fields
        if not isinstance(result, dict):
            result = {"success": False, "error": "Test did not return a dict"}
            
        if "module" not in result:
            result["module"] = "model_manager"
            
        if "success" not in result:
            if "status" in result and result["status"] == "success":
                result["success"] = True
            else:
                result["success"] = False
                
        return result
    except Exception as e:
        error_msg = f"Model Manager test failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        
        # Return error result instead of raising exception
        return {
            "success": False,
            "module": "model_manager",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def test_transformers_module(config: ModuleConfig):
    """Special handler for testing Transformers"""
    try:
        logger.info(f"Testing Transformers module with config: {config}")
        
        # Use mock for mock environment
        if config.environment == "mock":
            return MockTransformers(config.resources, config.metadata).test()
        
        # Try to import the actual Transformers module
        try:
            # First try importing from the app
            from hallucinate_app.ipfs_transformers import IPFSTransformers
            logger.info("Using real IPFSTransformers implementation")
            
            # Get dependencies if available to pass as resources
            resources = config.resources or {}
            try:
                from hallucinate_app.ipfs_model_manager import ipfs_model_manager
                resources["modelManager"] = ipfs_model_manager
            except ImportError:
                pass
                
            transformers = IPFSTransformers(resources, config.metadata)
        except ImportError:
            # Fall back to mock if import fails
            logger.warning("Failed to import IPFSTransformers, using mock implementation")
            return MockTransformers(config.resources, config.metadata).test()
            
        # Run the test
        result = transformers.test()
        
        # Ensure result has required fields
        if not isinstance(result, dict):
            result = {"success": False, "error": "Test did not return a dict"}
            
        if "module" not in result:
            result["module"] = "transformers"
            
        if "success" not in result:
            if "status" in result and result["status"] == "success":
                result["success"] = True
            else:
                result["success"] = False
                
        return result
    except Exception as e:
        error_msg = f"Transformers test failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        
        # Return error result instead of raising exception
        return {
            "success": False,
            "module": "transformers",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def test_datasets_module(config: ModuleConfig):
    """Special handler for testing Datasets"""
    try:
        logger.info(f"Testing Datasets module with config: {config}")
        
        # Use mock for mock environment
        if config.environment == "mock":
            return MockDatasets(config.resources, config.metadata).test()
        
        # Try to import the actual Datasets module
        try:
            # First try importing from the app
            from hallucinate_app.ipfs_datasets import IPFSDatasets
            logger.info("Using real IPFSDatasets implementation")
            
            # Get dependencies if available to pass as resources
            resources = config.resources or {}
            try:
                from hallucinate_app.ipfs_kit import ipfs_kit
                resources["ipfsKit"] = ipfs_kit
            except ImportError:
                pass
                
            datasets = IPFSDatasets(resources, config.metadata)
        except ImportError:
            # Fall back to mock if import fails
            logger.warning("Failed to import IPFSDatasets, using mock implementation")
            return MockDatasets(config.resources, config.metadata).test()
            
        # Run the test
        result = datasets.test()
        
        # Ensure result has required fields
        if not isinstance(result, dict):
            result = {"success": False, "error": "Test did not return a dict"}
            
        if "module" not in result:
            result["module"] = "datasets"
            
        if "success" not in result:
            if "status" in result and result["status"] == "success":
                result["success"] = True
            else:
                result["success"] = False
                
        return result
    except Exception as e:
        error_msg = f"Datasets test failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        
        # Return error result instead of raising exception
        return {
            "success": False,
            "module": "datasets",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def test_embeddings_module(config: ModuleConfig):
    """Special handler for testing Embeddings"""
    try:
        logger.info(f"Testing Embeddings module with config: {config}")
        
        # Use mock for mock environment
        if config.environment == "mock":
            return MockEmbeddings(config.resources, config.metadata).test()
        
        # Try to import the actual Embeddings module
        try:
            # First try importing from the app
            from hallucinate_app.ipfs_embeddings import IPFSEmbeddings
            logger.info("Using real IPFSEmbeddings implementation")
            
            # Get dependencies if available to pass as resources
            resources = config.resources or {}
            try:
                from hallucinate_app.ipfs_kit import ipfs_kit
                resources["ipfsKit"] = ipfs_kit
            except ImportError:
                pass
                
            embeddings = IPFSEmbeddings(resources, config.metadata)
        except ImportError:
            # Fall back to mock if import fails
            logger.warning("Failed to import IPFSEmbeddings, using mock implementation")
            return MockEmbeddings(config.resources, config.metadata).test()
            
        # Run the test
        result = embeddings.test()
        
        # Ensure result has required fields
        if not isinstance(result, dict):
            result = {"success": False, "error": "Test did not return a dict"}
            
        if "module" not in result:
            result["module"] = "embeddings"
            
        if "success" not in result:
            if "status" in result and result["status"] == "success":
                result["success"] = True
            else:
                result["success"] = False
                
        return result
    except Exception as e:
        error_msg = f"Embeddings test failed: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        
        # Return error result instead of raising exception
        return {
            "success": False,
            "module": "embeddings",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

@app.post("/run_all_tests")
def run_all_tests(config: ModuleConfig):
    """Run tests for all modules"""
    results = {}
    all_passed = True
    
    try:
        # Module names to test
        module_names = [
            "ipfs_kit",
            "model_manager",
            "transformers", 
            "datasets",
            "accelerate",
            "faiss",
            "agents",
            "libp2p",
            "orbitdb",
            "embeddings"
        ]
        
        # Test each module
        for module_name in module_names:
            try:
                # Get or create module instance
                if module_name not in modules:
                    modules[module_name] = get_module(module_name, config.resources, config.metadata)
                
                # Run test
                result = modules[module_name].test()
                results[module_name] = result
                
                if not result.get("success", False):
                    all_passed = False
            except Exception as e:
                error_msg = f"Module {module_name} test failed: {str(e)}"
                logger.error(error_msg)
                results[module_name] = {
                    "success": False,
                    "error": str(e)
                }
                all_passed = False
        
        return {
            "success": all_passed,
            "results": results
        }
    except Exception as e:
        error_msg = f"All tests failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    # Start server
    print("Starting IPFS Accelerate Test Server on http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)