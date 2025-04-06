#!/usr/bin/env python3
"""
Runner for Secure PyArrow Index Manager tests

Provides a simple command-line interface for running the tests
Supports both unit tests and integration tests
"""

import argparse
import asyncio
import json
import sys
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("run_secure_pyarrow_index_test")

def parse_args():
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(description="Run Secure PyArrow Index Manager tests")
    
    parser.add_argument(
        "--mock", 
        action="store_true", 
        help="Use mock implementations for dependencies"
    )
    
    parser.add_argument(
        "--integration", 
        action="store_true", 
        help="Run integration tests with real implementations"
    )
    
    parser.add_argument(
        "--verbose", "-v", 
        action="store_true", 
        help="Enable verbose output"
    )
    
    parser.add_argument(
        "--output", "-o", 
        type=str, 
        default=None, 
        help="Output file for test results"
    )
    
    return parser.parse_args()


def run_tests(use_mock=False, run_integration=False, verbose=False):
    """Run the tests"""
    try:
        if run_integration:
            # Import the integration test module
            from hallucinate_app.test.test_secure_pyarrow_index_manager_integration import run_tests as run_integration_tests
            
            # Run integration tests
            logger.info("Running Secure PyArrow Index Manager integration tests...")
            results = run_integration_tests()
            
            return results
        else:
            # Import the test module
            from hallucinate_app.test.test_secure_pyarrow_index_manager import TestSecurePyArrowIndexManager
            
            # Override dependencies if mock is requested
            if use_mock:
                logger.info("Using mock implementations for dependencies")
                # Import mock implementations
                from hallucinate_app.test.ipfs_faiss_mock import MockAuthManager
                
                # Create a mock class for content index integration
                class MockPyArrowContentIndexIntegration:
                    """Mock implementation of PyArrow Content Index Integration"""
                    
                    def __init__(self):
                        self.initialized = False
                        self.mock_data = {}
                    
                    async def init(self):
                        self.initialized = True
                        return True
                    
                    async def lookup_by_cid(self, cid):
                        if cid in self.mock_data:
                            return self.mock_data[cid]
                        return {"cid": cid, "path": f"/mock/path/{cid}", "size": 1024}
                    
                    async def lookup_by_path(self, path):
                        # Simple mock implementation
                        cid = f"mock-cid-{hash(path)}"
                        return {"cid": cid, "path": path, "size": 1024}
                    
                    async def add_entry(self, entry):
                        cid = entry.get("cid", f"mock-cid-{len(self.mock_data)}")
                        self.mock_data[cid] = entry
                        return entry
                    
                    async def update_entry(self, cid, update_data):
                        if cid in self.mock_data:
                            entry = self.mock_data[cid]
                            if "metadata" in update_data and "metadata" in entry:
                                entry["metadata"].update(update_data["metadata"])
                            else:
                                entry.update(update_data)
                            return entry
                        return {"cid": cid, "updated": False, "error": "Entry not found"}
                    
                    async def delete_entry(self, cid):
                        if cid in self.mock_data:
                            del self.mock_data[cid]
                            return True
                        return False
                    
                    async def query(self, query_params):
                        # Simple mock implementation
                        limit = query_params.get("limit", 10)
                        return list(self.mock_data.values())[:limit]
                    
                    async def get_stats(self):
                        return {
                            "entry_count": len(self.mock_data),
                            "total_size": sum(entry.get("size", 0) for entry in self.mock_data.values()),
                            "mock": True
                        }
                    
                    async def sync_with_ipfs_pinset(self, include_metadata):
                        return {
                            "added": 0,
                            "removed": 0,
                            "updated": 0,
                            "total": len(self.mock_data),
                            "mock": True
                        }
                    
                    async def export_to_parquet(self, export_path):
                        # Just pretend to export
                        return True
                    
                    async def import_from_parquet(self, import_path):
                        # Just pretend to import
                        return True
                
                # Create mock instances
                mock_auth = MockAuthManager()
                mock_integration = MockPyArrowContentIndexIntegration()
                
                # Create test resources
                test_resources = {
                    "auth": mock_auth,
                    "content_index_integration": mock_integration
                }
                
                # Import the secure manager
                from hallucinate_app.secure_pyarrow_index_manager import SecurePyArrowIndexManager
                
                # Create an instance with mock resources
                secure_manager = SecurePyArrowIndexManager(resources=test_resources)
                
                # Initialize in a new event loop
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(secure_manager.init())
                    
                    # Run the test
                    test_result = loop.run_until_complete(secure_manager.test(verbose=verbose))
                    
                    # Format the result as JSON
                    return json.dumps(test_result, indent=2)
                finally:
                    loop.close()
            else:
                # Run with actual implementations
                logger.info("Running Secure PyArrow Index Manager tests with actual implementations...")
                
                # Import the secure manager
                from hallucinate_app.secure_pyarrow_index_manager import secure_pyarrow_index_manager
                
                # Initialize in a new event loop
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(secure_pyarrow_index_manager.init())
                    
                    # Run the test
                    test_result = loop.run_until_complete(secure_pyarrow_index_manager.test(verbose=verbose))
                    
                    # Format the result as JSON
                    return json.dumps(test_result, indent=2)
                finally:
                    loop.close()
    
    except Exception as e:
        logger.error(f"Error running tests: {e}", exc_info=True)
        return json.dumps({
            "success": False,
            "module": "secure_pyarrow_index_manager",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, indent=2)


def main():
    """Main function"""
    args = parse_args()
    
    # Run the tests
    results = run_tests(
        use_mock=args.mock,
        run_integration=args.integration,
        verbose=args.verbose
    )
    
    # Output results
    if args.output:
        with open(args.output, 'w') as f:
            f.write(results)
        logger.info(f"Test results written to {args.output}")
    else:
        print(results)
    
    # Determine exit code based on test success
    try:
        result_dict = json.loads(results)
        if not result_dict.get("success", False):
            sys.exit(1)
    except:
        # If we can't parse the result as JSON, assume failure
        sys.exit(1)


if __name__ == "__main__":
    main()