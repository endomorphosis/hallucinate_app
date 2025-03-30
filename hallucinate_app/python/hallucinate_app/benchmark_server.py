"""
Benchmark Server for IPFS Python modules

This module provides API endpoints for benchmarking the IPFS Python modules:
- ipfs_datasets_py
- ipfs_faiss_py
- ipfs_kit_py
- ipfs_accelerate_py
- ipfs_embeddings_py
- ipfs_model_manager_py
"""

import os
import time
import json
import random
import logging
import tempfile
import asyncio
import numpy as np
from typing import Dict, List, Optional, Union, Any
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("benchmark_server")

# Create router
benchmark_router = APIRouter(prefix="/benchmark", tags=["benchmark"])

# Try to import IPFS modules with fallbacks
try:
    import ipfs_kit_py
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import ipfs_kit_py, some benchmarks will be limited")
    has_ipfs_kit = False
    ipfs_kit_py = None

try:
    import ipfs_datasets_py
    has_ipfs_datasets = True
except ImportError:
    logger.warning("Could not import ipfs_datasets_py, some benchmarks will be limited")
    has_ipfs_datasets = False
    ipfs_datasets_py = None

try:
    import ipfs_faiss_py
    has_ipfs_faiss = True
except ImportError:
    logger.warning("Could not import ipfs_faiss_py, some benchmarks will be limited")
    has_ipfs_faiss = False
    ipfs_faiss_py = None

try:
    import ipfs_accelerate_py
    has_ipfs_accelerate = True
except ImportError:
    logger.warning("Could not import ipfs_accelerate_py, some benchmarks will be limited")
    has_ipfs_accelerate = False
    ipfs_accelerate_py = None

try:
    import ipfs_embeddings_py
    has_ipfs_embeddings = True
except ImportError:
    logger.warning("Could not import ipfs_embeddings_py, some benchmarks will be limited")
    has_ipfs_embeddings = False
    ipfs_embeddings_py = None

try:
    import ipfs_model_manager_py
    has_ipfs_model_manager = True
except ImportError:
    logger.warning("Could not import ipfs_model_manager_py, some benchmarks will be limited")
    has_ipfs_model_manager = False
    ipfs_model_manager_py = None

# Dictionary of module availability
module_availability = {
    "ipfs_kit_py": has_ipfs_kit,
    "ipfs_datasets_py": has_ipfs_datasets,
    "ipfs_faiss_py": has_ipfs_faiss,
    "ipfs_accelerate_py": has_ipfs_accelerate,
    "ipfs_embeddings_py": has_ipfs_embeddings,
    "ipfs_model_manager_py": has_ipfs_model_manager
}

# Setup benchmark endpoint for each module
@benchmark_router.post("/ipfs_datasets_py")
async def benchmark_ipfs_datasets(data: Dict[str, Any] = Body(...)):
    """
    Run benchmarks for IPFS Datasets module
    """
    if not has_ipfs_datasets:
        raise HTTPException(status_code=503, detail="IPFS Datasets module not available")
    
    benchmark_id = data.get("benchmark_id")
    params = data.get("params", {})
    
    try:
        # Initialize module if needed
        if not getattr(ipfs_datasets, "initialized", False):
            await ipfs_datasets.init()
        
        # Run benchmark based on ID
        if benchmark_id == "list_datasets":
            start_time = time.time()
            result = await ipfs_datasets.listDatasets()
            duration = time.time() - start_time
            
            # Include only summary in result to reduce payload size
            if isinstance(result, dict) and "datasets" in result:
                result["count"] = len(result["datasets"])
                result["datasets"] = result["datasets"][:5]  # Include only first 5 datasets
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": result
            }
            
        elif benchmark_id == "load_small_dataset":
            start_time = time.time()
            result = await ipfs_datasets.loadDataset("hf-internal-testing/tiny-random-dataset")
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "dataset_name": "hf-internal-testing/tiny-random-dataset",
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "load_medium_dataset":
            start_time = time.time()
            result = await ipfs_datasets.loadDataset("glue/sst2")
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "dataset_name": "glue/sst2",
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "load_samples":
            start_time = time.time()
            result = await ipfs_datasets.getSamples("hf-internal-testing/tiny-random-dataset", params.get("count", 100))
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "dataset_name": "hf-internal-testing/tiny-random-dataset",
                    "samples_count": len(result.get("samples", []))
                }
            }
            
        else:
            raise HTTPException(status_code=404, detail=f"Unknown benchmark: {benchmark_id}")
            
    except Exception as e:
        logger.exception(f"Error in datasets benchmark {benchmark_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@benchmark_router.post("/ipfs_faiss_py")
async def benchmark_ipfs_faiss(data: Dict[str, Any] = Body(...)):
    """
    Run benchmarks for IPFS FAISS module
    """
    if not has_ipfs_faiss:
        raise HTTPException(status_code=503, detail="IPFS FAISS module not available")
    
    benchmark_id = data.get("benchmark_id")
    params = data.get("params", {})
    
    try:
        # Initialize module if needed
        if not getattr(ipfs_faiss, "initialized", False):
            await ipfs_faiss.init()
        
        # Run benchmark based on ID
        if benchmark_id == "create_index":
            dimensions = params.get("dimensions", 128)
            
            start_time = time.time()
            result = await ipfs_faiss.create_index(dimensions)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": result
            }
            
        elif benchmark_id.startswith("add_vectors"):
            dimensions = params.get("dimensions", 128)
            count = params.get("count", 1000)
            
            # Create index first
            create_result = await ipfs_faiss.create_index(dimensions)
            if not create_result.get("success", False):
                raise Exception("Failed to create index")
            
            index_id = create_result.get("index_id")
            
            # Generate random vectors
            vectors = np.random.rand(count, dimensions).astype(np.float32).tolist()
            
            # Add vectors to index
            start_time = time.time()
            result = await ipfs_faiss.add_vectors(index_id, vectors)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "index_id": index_id,
                    "vectors_added": count,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id.startswith("search"):
            dimensions = params.get("dimensions", 128)
            count = params.get("count", 1000)
            k = params.get("k", 10)
            
            # Create index first
            create_result = await ipfs_faiss.create_index(dimensions)
            if not create_result.get("success", False):
                raise Exception("Failed to create index")
            
            index_id = create_result.get("index_id")
            
            # Generate random vectors
            vectors = np.random.rand(count, dimensions).astype(np.float32).tolist()
            
            # Add vectors to index
            add_result = await ipfs_faiss.add_vectors(index_id, vectors)
            if not add_result.get("success", False):
                raise Exception("Failed to add vectors to index")
            
            # Generate query vector
            query = np.random.rand(dimensions).astype(np.float32).tolist()
            
            # Search the index
            start_time = time.time()
            result = await ipfs_faiss.search(index_id, query, k)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "index_id": index_id,
                    "query_dimensions": dimensions,
                    "results_count": len(result.get("results", [])),
                    "status": result.get("success", False)
                }
            }
            
        else:
            raise HTTPException(status_code=404, detail=f"Unknown benchmark: {benchmark_id}")
            
    except Exception as e:
        logger.exception(f"Error in FAISS benchmark {benchmark_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@benchmark_router.post("/ipfs_accelerate_py")
async def benchmark_ipfs_accelerate(data: Dict[str, Any] = Body(...)):
    """
    Run benchmarks for IPFS Accelerate module
    """
    if not has_ipfs_accelerate:
        raise HTTPException(status_code=503, detail="IPFS Accelerate module not available")
    
    benchmark_id = data.get("benchmark_id")
    params = data.get("params", {})
    
    try:
        # For accelerate, we'll implement benchmarks based on available API
        if benchmark_id == "load_small_model":
            model_id = "hf-internal-testing/tiny-random-bert"
            
            start_time = time.time()
            result = await ipfs_accelerate.load_model(model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "load_medium_model":
            model_id = "prajjwal1/bert-tiny"
            
            start_time = time.time()
            result = await ipfs_accelerate.load_model(model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "inference_small":
            model_id = "hf-internal-testing/tiny-random-bert"
            
            # Ensure model is loaded
            await ipfs_accelerate.load_model(model_id)
            
            # Run inference
            start_time = time.time()
            result = await ipfs_accelerate.run_inference("This is a test.", model_id=model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "inference_medium":
            model_id = "prajjwal1/bert-tiny"
            
            # Ensure model is loaded
            await ipfs_accelerate.load_model(model_id)
            
            # Run inference
            start_time = time.time()
            result = await ipfs_accelerate.run_inference("This is a test.", model_id=model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "batch_inference":
            model_id = "hf-internal-testing/tiny-random-bert"
            batch_size = params.get("batch", 8)
            
            # Ensure model is loaded
            await ipfs_accelerate.load_model(model_id)
            
            # Create batch input
            inputs = ["This is a test sentence " + str(i) for i in range(batch_size)]
            
            # Run inference
            start_time = time.time()
            result = await ipfs_accelerate.run_batch_inference(inputs, model_id=model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "batch_size": batch_size,
                    "status": result.get("success", False)
                }
            }
            
        else:
            raise HTTPException(status_code=404, detail=f"Unknown benchmark: {benchmark_id}")
            
    except Exception as e:
        logger.exception(f"Error in accelerate benchmark {benchmark_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@benchmark_router.post("/ipfs_embeddings_py")
async def benchmark_ipfs_embeddings(data: Dict[str, Any] = Body(...)):
    """
    Run benchmarks for IPFS Embeddings module
    """
    if not has_ipfs_embeddings:
        raise HTTPException(status_code=503, detail="IPFS Embeddings module not available")
    
    benchmark_id = data.get("benchmark_id")
    params = data.get("params", {})
    
    try:
        # Initialize module if needed
        if not getattr(ipfs_embeddings, "initialized", False):
            await ipfs_embeddings.init()
        
        # Generate random text helper
        def generate_random_text(length):
            words = [
                'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I',
                'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
                'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
                'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
                'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me'
            ]
            
            text = ' '.join(random.choices(words, k=length // 4))  # ~4 chars per word
            return text
        
        # Run benchmark based on ID
        if benchmark_id == "generate_embedding":
            # Generate text of specified length
            text_length = params.get("text_length", 100)
            text = generate_random_text(text_length)
            
            # Generate embedding
            start_time = time.time()
            result = await ipfs_embeddings.generate_embedding(text)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "text_length": len(text),
                    "dimensions": result.get("dimensions", 0),
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "generate_batch":
            # Generate texts
            count = params.get("count", 100)
            text_length = params.get("text_length", 100)
            
            texts = [generate_random_text(text_length) for _ in range(count)]
            
            # Generate embeddings
            start_time = time.time()
            result = await ipfs_embeddings.generate_embedding(texts)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "count": count,
                    "text_length": text_length,
                    "dimensions": result.get("dimensions", 0),
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id.startswith("similarity_"):
            # Generate texts
            text_length = params.get("text_length", 100)
            
            text1 = generate_random_text(text_length)
            text2 = generate_random_text(text_length)
            
            # Generate embeddings
            result1 = await ipfs_embeddings.generate_embedding(text1)
            result2 = await ipfs_embeddings.generate_embedding(text2)
            
            if "error" in result1 or "error" in result2:
                raise Exception("Failed to generate embeddings")
            
            # Compare similarity
            start_time = time.time()
            result = await ipfs_embeddings.compare_similarity(
                result1["embedding"],
                result2["embedding"]
            )
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "text_length": text_length,
                    "similarity": result.get("similarity", 0),
                    "metric": result.get("metric", "cosine"),
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "search_similar":
            # Generate texts
            corpus_size = params.get("corpus_size", 1000)
            text_length = params.get("text_length", 100)
            k = params.get("k", 10)
            
            texts = [generate_random_text(text_length) for _ in range(corpus_size)]
            
            # Generate embeddings
            batch_result = await ipfs_embeddings.generate_embedding(texts)
            
            if "error" in batch_result:
                raise Exception(f"Failed to generate embeddings: {batch_result['error']}")
            
            # Create corpus items
            corpus = []
            for i, embedding in enumerate(batch_result["embeddings"]):
                corpus.append({
                    "id": i,
                    "text": texts[i],
                    "embedding": embedding
                })
            
            # Generate query
            query_text = generate_random_text(text_length)
            
            # Search similar
            start_time = time.time()
            result = await ipfs_embeddings.search_similar(query_text, corpus, {"top_k": k})
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "corpus_size": corpus_size,
                    "text_length": text_length,
                    "top_k": k,
                    "results_count": len(result.get("results", [])),
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "save_to_ipfs":
            # For IPFS operations, we need actual ipfs_kit integration
            if not has_ipfs_kit:
                raise HTTPException(status_code=503, detail="IPFS Kit not available")
            
            # Create embeddings to save
            count = params.get("count", 100)
            text_length = params.get("text_length", 100)
            
            texts = [generate_random_text(text_length) for _ in range(count)]
            batch_result = await ipfs_embeddings.generate_embedding(texts)
            
            if "error" in batch_result:
                raise Exception(f"Failed to generate embeddings: {batch_result['error']}")
            
            # Create corpus items
            embeddings_to_save = []
            for i, embedding in enumerate(batch_result["embeddings"]):
                embeddings_to_save.append({
                    "id": i,
                    "text": texts[i],
                    "embedding": embedding
                })
            
            # Save to IPFS
            start_time = time.time()
            result = await ipfs_embeddings.save_embeddings_to_ipfs(embeddings_to_save)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "count": count,
                    "cid": result.get("cid", ""),
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "load_from_ipfs":
            # For IPFS operations, we need actual ipfs_kit integration
            if not has_ipfs_kit:
                raise HTTPException(status_code=503, detail="IPFS Kit not available")
            
            # Create and save embeddings first
            count = params.get("count", 100)
            text_length = params.get("text_length", 100)
            
            texts = [generate_random_text(text_length) for _ in range(count)]
            batch_result = await ipfs_embeddings.generate_embedding(texts)
            
            if "error" in batch_result:
                raise Exception(f"Failed to generate embeddings: {batch_result['error']}")
            
            # Create corpus items
            embeddings_to_save = []
            for i, embedding in enumerate(batch_result["embeddings"]):
                embeddings_to_save.append({
                    "id": i,
                    "text": texts[i],
                    "embedding": embedding
                })
            
            # Save to IPFS
            save_result = await ipfs_embeddings.save_embeddings_to_ipfs(embeddings_to_save)
            
            if "error" in save_result:
                raise Exception(f"Failed to save embeddings to IPFS: {save_result['error']}")
            
            cid = save_result["cid"]
            
            # Load from IPFS
            start_time = time.time()
            result = await ipfs_embeddings.load_embeddings_from_ipfs(cid)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "count": count,
                    "cid": cid,
                    "loaded_count": len(result.get("embeddings", [])),
                    "status": result.get("success", False)
                }
            }
            
        else:
            raise HTTPException(status_code=404, detail=f"Unknown benchmark: {benchmark_id}")
            
    except Exception as e:
        logger.exception(f"Error in embeddings benchmark {benchmark_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@benchmark_router.post("/ipfs_model_manager_py")
async def benchmark_ipfs_model_manager(data: Dict[str, Any] = Body(...)):
    """
    Run benchmarks for IPFS Model Manager module
    """
    if not has_ipfs_model_manager:
        raise HTTPException(status_code=503, detail="IPFS Model Manager module not available")
    
    benchmark_id = data.get("benchmark_id")
    params = data.get("params", {})
    
    try:
        # Initialize module if needed
        if not getattr(ipfs_model_manager, "initialized", False):
            await ipfs_model_manager.init()
        
        # Run benchmark based on ID
        if benchmark_id == "list_models":
            start_time = time.time()
            result = await ipfs_model_manager.listModels()
            duration = time.time() - start_time
            
            # Include only summary in result to reduce payload size
            if isinstance(result, dict) and "models" in result:
                result["count"] = len(result["models"])
                result["models"] = result["models"][:5]  # Include only first 5 models
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": result
            }
            
        elif benchmark_id == "load_small_model":
            model_id = "hf-internal-testing/tiny-random-bert"
            
            start_time = time.time()
            result = await ipfs_model_manager.loadModel(model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "load_medium_model":
            model_id = "prajjwal1/bert-tiny"
            
            start_time = time.time()
            result = await ipfs_model_manager.loadModel(model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "export_small_model":
            model_id = "hf-internal-testing/tiny-random-bert"
            
            # Ensure model is loaded
            await ipfs_model_manager.loadModel(model_id)
            
            # Export model to IPFS
            start_time = time.time()
            result = await ipfs_model_manager.exportModelToIPFS(model_id)
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "model_id": model_id,
                    "cid": result.get("cid", ""),
                    "status": result.get("success", False)
                }
            }
            
        elif benchmark_id == "import_small_model":
            model_id = "hf-internal-testing/tiny-random-bert"
            
            # Make sure model is exported to IPFS first
            export_result = await ipfs_model_manager.exportModelToIPFS(model_id)
            
            if "error" in export_result:
                raise Exception(f"Failed to export model: {export_result['error']}")
            
            cid = export_result["cid"]
            
            # Import model from IPFS
            start_time = time.time()
            result = await ipfs_model_manager.importModelFromIPFS(cid, f"test-import-{time.time()}")
            duration = time.time() - start_time
            
            return {
                "success": True,
                "benchmark": benchmark_id,
                "duration_ms": int((duration) * 1000),
                "result": {
                    "source_model_id": model_id,
                    "cid": cid,
                    "status": result.get("success", False)
                }
            }
            
        else:
            raise HTTPException(status_code=404, detail=f"Unknown benchmark: {benchmark_id}")
            
    except Exception as e:
        logger.exception(f"Error in model manager benchmark {benchmark_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint to get module availability
@benchmark_router.get("/modules")
async def get_module_availability():
    """
    Get availability of IPFS Python modules
    """
    return {
        "modules": module_availability
    }

def init_benchmark_server():
    """
    Initialize benchmark server components
    """
    # Any initialization logic
    logger.info("Benchmark server initialized")

# Export router
__all__ = ["benchmark_router", "init_benchmark_server"]