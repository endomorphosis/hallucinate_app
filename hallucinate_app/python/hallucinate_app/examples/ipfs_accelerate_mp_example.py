"""
Example of using the multi-process IPFS Accelerate module

This example demonstrates how to use the multi-process architecture
for IPFS Accelerate to achieve parallel processing of IPFS operations
and ML model inference.

Usage:
    python ipfs_accelerate_mp_example.py

The example will:
1. Initialize the IPFS Accelerate module with multi-process architecture
2. Upload a text file to IPFS
3. Load a small test model
4. Perform multiple IPFS operations and model inferences in parallel
5. Demonstrate that IPFS operations don't block ML model execution
"""

import os
import sys
import json
import time
import asyncio
import logging
from pathlib import Path

# Add the parent directory to the path so we can import the modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import the IPFS Accelerate module
try:
    from ipfs_accelerate_py import ipfs_accelerate_py
    HAS_IPFS_ACCELERATE = True
except ImportError as e:
    HAS_IPFS_ACCELERATE = False
    print(f"Error importing ipfs_accelerate_py: {e}")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_accelerate_mp_example")

async def run_example():
    """Run the example demonstrating multi-process architecture"""
    logger.info("Starting IPFS Accelerate MP example")
    
    # Initialize the IPFS Accelerate module
    logger.info("Initializing IPFS Accelerate module")
    accelerator = ipfs_accelerate_py
    await accelerator.init()
    
    try:
        # Create a temporary file to upload to IPFS
        logger.info("Creating test file for IPFS upload")
        test_dir = Path(os.path.expanduser("~/.cache/hallucinate_app/test"))
        test_dir.mkdir(parents=True, exist_ok=True)
        
        test_file = test_dir / "test_file.txt"
        with open(test_file, "w") as f:
            f.write("This is a test file for IPFS Accelerate MP example.\n")
            f.write("It contains some text that will be uploaded to IPFS.\n")
            f.write(f"Timestamp: {time.time()}\n")
        
        # Upload the file to IPFS
        logger.info("Uploading test file to IPFS")
        with open(test_file, "r") as f:
            file_content = f.read()
        
        add_result = await accelerator.ipfs_client.add_to_ipfs(file_content)
        cid = add_result.get("cid")
        logger.info(f"File uploaded to IPFS with CID: {cid}")
        
        # Load a small test model
        logger.info("Loading test model")
        model_id = "hf-internal-testing/tiny-random-bert"
        load_result = await accelerator.load_model_from_ipfs(model_id)
        
        if load_result.get("status") != "success":
            logger.error(f"Failed to load model: {load_result.get('error')}")
            return
        
        logger.info(f"Model {model_id} loaded successfully")
        
        # Demonstrate parallel operations
        logger.info("Demonstrating parallel operations")
        logger.info("This will run IPFS operations and model inferences in parallel")
        
        start_time = time.time()
        
        # Create tasks for IPFS operations and model inferences
        tasks = []
        
        # IPFS operations
        for i in range(5):
            async def ipfs_task(i):
                logger.info(f"IPFS Task {i} starting")
                
                # Add content to IPFS
                content = f"Test content {i} at time {time.time()}"
                add_result = await accelerator.ipfs_client.add_to_ipfs(content)
                task_cid = add_result.get("cid")
                
                # Simulate complex IPFS operation
                await asyncio.sleep(0.5)
                
                # Fetch content from IPFS
                fetch_result = await accelerator.ipfs_client.fetch_from_ipfs(task_cid)
                retrieved = fetch_result.get("data")
                
                logger.info(f"IPFS Task {i} completed: {task_cid[:10]}...")
                return {"task": f"ipfs_{i}", "cid": task_cid, "content": content}
            
            tasks.append(asyncio.create_task(ipfs_task(i)))
        
        # Model inferences
        for i in range(5):
            async def inference_task(i):
                logger.info(f"Inference Task {i} starting")
                
                # Run inference with model
                text = f"This is inference test {i} at time {time.time()}"
                result = await accelerator.process_async(model_id, text)
                
                logger.info(f"Inference Task {i} completed")
                return {"task": f"inference_{i}", "input": text, "status": result.get("status")}
            
            tasks.append(asyncio.create_task(inference_task(i)))
        
        # Wait for all tasks to complete
        results = await asyncio.gather(*tasks)
        
        end_time = time.time()
        elapsed = end_time - start_time
        
        # If operations were truly parallel, elapsed time should be close to
        # the maximum time of any single operation, not the sum of all operations
        logger.info(f"All tasks completed in {elapsed:.2f} seconds")
        logger.info(f"If operations were serial, this would take approximately {10 * 0.5:.2f} seconds")
        
        # Unload the model
        logger.info(f"Unloading model {model_id}")
        unload_result = await accelerator.unload_model(model_id)
        logger.info(f"Model unload result: {unload_result.get('status')}")
        
        # Clean up the test file
        logger.info("Cleaning up test file")
        test_file.unlink()
        
        logger.info("IPFS Accelerate MP example completed successfully")
        
    except Exception as e:
        logger.error(f"Error in IPFS Accelerate MP example: {e}")
    finally:
        # Shut down the accelerator
        logger.info("Shutting down IPFS Accelerate")
        await accelerator.shutdown()

def main():
    """Main entry point for the example"""
    if not HAS_IPFS_ACCELERATE:
        logger.error("IPFS Accelerate module not available, cannot run example")
        return
    
    # Run the example
    asyncio.run(run_example())

if __name__ == "__main__":
    main()