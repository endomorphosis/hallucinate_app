#!/usr/bin/env python3
"""
Enhanced Test Runner for secure_faiss_manager

Demonstrates the enhanced testing framework with diagnostics 
and mock dependency injection.
"""

import os
import sys
import json
import logging
import importlib
import traceback
from datetime import datetime
from pathlib import Path
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("secure_faiss_test_runner")

# Add parent directory to module search path
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

def check_dependencies(required_modules):
    """
    Check status of required dependencies
    
    Args:
        required_modules: List of module names to check
        
    Returns:
        Dict: Status information for each dependency
    """
    results = {}
    for module_name in required_modules:
        try:
            module = importlib.import_module(module_name)
            version = getattr(module, "__version__", "unknown")
            results[module_name] = {
                "available": True,
                "version": version,
                "path": module.__file__ if hasattr(module, "__file__") else "unknown"
            }
        except ImportError as e:
            results[module_name] = {
                "available": False,
                "error": str(e)
            }
    return results

def create_mock_resource_pool():
    """
    Create a resource pool with mock implementations
    
    Returns:
        Dict: Resource pool with mock objects
    """
    from test.ipfs_faiss_mock import ipfs_faiss_mock
    
    # Create mock auth
    class MockAuth:
        """Mock auth implementation"""
        def __init__(self):
            self.initialized = True
            self.principals = {"test-user": {"id": "test-user"}}
            
        async def init(self):
            return True
            
        async def verify_capability(self, token, capability):
            # Always authorize test tokens
            if token.startswith("mock-") or token.startswith("test-"):
                return True
            return False
            
        async def create_principal(self, id):
            self.principals[id] = {"id": id}
            return {"id": id}
            
        async def issue_capability(self, issuer, audience, capability):
            token = f"mock-token-{issuer}-{audience}-{capability['can']}"
            return {"token": token}
    
    # Create the pool
    pool = {
        "auth": MockAuth(),
        "faiss": ipfs_faiss_mock,
    }
    
    return pool

def run_test_with_mocks(verbose=False):
    """
    Run secure_faiss_manager tests with mock dependencies
    
    Args:
        verbose: Whether to enable verbose logging
        
    Returns:
        Dict: Test results
    """
    try:
        # Import the module we want to test
        from secure_faiss_manager import SecureFaissManager
        
        # Create resource pool with mocks
        resources = create_mock_resource_pool()
        
        # Initialize with mocks
        metadata = {"test_mode": True, "verbose": verbose}
        secure_faiss = SecureFaissManager(resources=resources, metadata=metadata)
        
        # Run test method
        result = secure_faiss.test()
        
        # Add dependency information
        if "diagnostics" not in result:
            result["diagnostics"] = {}
            
        # Check all relevant dependencies
        dependencies = ["faiss", "ipfs_kit_py", "ipfs_faiss", "auth"]
        result["diagnostics"]["dependencies"] = check_dependencies(dependencies)
        
        # Add additional test environment information
        result["diagnostics"]["environment"] = {
            "python_version": sys.version,
            "test_runner": "run_secure_faiss_test.py",
            "mock_mode": True
        }
        
        return result
    except Exception as e:
        logger.error(f"Error running test: {e}")
        return {
            "success": False,
            "module": "secure_faiss_manager",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def run_test_without_mocks(verbose=False):
    """
    Run secure_faiss_manager tests with real dependencies
    
    Args:
        verbose: Whether to enable verbose logging
        
    Returns:
        Dict: Test results
    """
    try:
        # Import the module we want to test
        from secure_faiss_manager import secure_faiss_manager
        
        # Run test directly
        result = secure_faiss_manager.test()
        
        # Add dependency information
        if "diagnostics" not in result:
            result["diagnostics"] = {}
            
        # Check all relevant dependencies
        dependencies = ["faiss", "ipfs_kit_py", "ipfs_faiss", "auth"]
        result["diagnostics"]["dependencies"] = check_dependencies(dependencies)
        
        # Add additional test environment information
        result["diagnostics"]["environment"] = {
            "python_version": sys.version,
            "test_runner": "run_secure_faiss_test.py",
            "mock_mode": False
        }
        
        return result
    except Exception as e:
        logger.error(f"Error running test: {e}")
        return {
            "success": False,
            "module": "secure_faiss_manager",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Run secure_faiss_manager tests")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
    parser.add_argument("--mock", "-m", action="store_true", help="Use mock dependencies")
    parser.add_argument("--output", "-o", help="Output file for test results (JSON)")
    args = parser.parse_args()
    
    # Configure logging based on verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
        
    logger.info("Starting secure_faiss_manager test run")
    logger.info(f"Mode: {'Mock' if args.mock else 'Real'} dependencies")
    
    # Run test based on mock flag
    if args.mock:
        logger.info("Using mock implementations for dependencies")
        test_result = run_test_with_mocks(args.verbose)
    else:
        logger.info("Using real implementations for dependencies")
        test_result = run_test_without_mocks(args.verbose)
    
    # Add timestamp to results
    if "timestamp" not in test_result:
        test_result["timestamp"] = datetime.now().isoformat()
    
    # Print results
    result_json = json.dumps(test_result, indent=2)
    print(result_json)
    
    # Write to file if specified
    if args.output:
        try:
            with open(args.output, 'w') as f:
                f.write(result_json)
            logger.info(f"Results written to {args.output}")
        except Exception as e:
            logger.error(f"Error writing results to file: {e}")
    
    # Exit with appropriate code
    sys.exit(0 if test_result.get("success", False) else 1)