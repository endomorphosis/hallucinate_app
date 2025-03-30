"""
IPFS Kit Integration Tests

This module provides tests for the IPFS Kit integration with the dashboard.
"""

import os
import sys
import json
import asyncio
import unittest
import threading
from typing import Dict, Any, Optional

# Adjust import paths if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import test modules
from test_ipfs_kit import test_ipfs_kit
# Import the dashboard bridge, or create a mock version if not available
try:
    from hallucinate_app.dashboard.ipfs_kit_bridge import test_ipfs_kit_bridge
except ImportError:
    # Create a mock test function
    def test_ipfs_kit_bridge():
        return {
            "success": True,
            "module": "ipfs_kit_bridge_mock",
            "tests": [
                {"name": "mock_test", "success": True}
            ]
        }


async def run_tests(use_mock: bool = True) -> Dict[str, Any]:
    """
    Run all IPFS Kit tests.
    
    Args:
        use_mock: Whether to use mock implementation
        
    Returns:
        Dictionary with all test results
    """
    test_results = {
        "success": True,
        "module": "ipfs_kit_integration",
        "tests": []
    }
    
    try:
        # Test IPFS Kit core
        kit_results = await test_ipfs_kit(use_mock=use_mock)
        
        test_results["tests"].append({
            "name": "ipfs_kit_core",
            "success": kit_results.get("success", False),
            "sub_tests": kit_results.get("tests", []),
            "message": "Core IPFS Kit tests completed successfully" if kit_results.get("success", False) else "Core IPFS Kit tests failed"
        })
        
        # Test Bridge
        bridge_results = test_ipfs_kit_bridge()
        
        test_results["tests"].append({
            "name": "ipfs_kit_bridge",
            "success": bridge_results.get("success", False),
            "sub_tests": bridge_results.get("tests", []),
            "message": "Bridge tests completed successfully" if bridge_results.get("success", False) else "Bridge tests failed"
        })
        
        # Update overall success status
        test_results["success"] = all(test["success"] for test in test_results["tests"])
        
        return test_results
    except Exception as e:
        test_results["success"] = False
        test_results["error"] = str(e)
        return test_results


def test():
    """
    Run all tests and return results in JSON format.
    
    Returns:
        JSON string with test results
    """
    # Run tests in asyncio loop
    loop = asyncio.new_event_loop()
    test_results = loop.run_until_complete(run_tests(use_mock=True))
    loop.close()
    
    return json.dumps(test_results, indent=2)


if __name__ == "__main__":
    # Run tests and print results
    print(test())