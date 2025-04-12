#!/usr/bin/env python3
"""
Runner script for Database Sync Manager Integration Tests

Provides a command-line interface for running the database sync integration tests
"""

import os
import sys
import json
import argparse
import logging
import asyncio
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("run_database_sync_integration_test")

# Ensure parent directory is in path
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(os.path.dirname(script_dir))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)


def parse_args():
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(description="Run Database Sync Manager integration tests")
    
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use mock implementations instead of real secure managers"
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
        help="Output file for test results (JSON format)"
    )
    
    parser.add_argument(
        "--test", "-t",
        type=str,
        default=None,
        help="Run specific test method (e.g. test_bidirectional_sync_with_security)"
    )
    
    return parser.parse_args()


def setup_mock_environment():
    """Set up a mock environment for testing without real implementations"""
    # Import required classes
    try:
        from hallucinate_app.test.test_database_sync_manager import (
            MockOrbitDB, MockFireproofDB, MockDuckDB, MockAuthManager, MockIPFSKit, MockLibp2p
        )
        
        # Create mock objects
        mock_orbit_db = MockOrbitDB()
        mock_fireproof_db = MockFireproofDB()
        mock_duck_db = MockDuckDB()
        mock_auth_manager = MockAuthManager()
        mock_ipfs_kit = MockIPFSKit()
        mock_libp2p = MockLibp2p()
        
        # Monkey patch the module imports
        import sys
        import types
        
        # Create a mock module for each secure manager
        mock_modules = {
            "hallucinate_app.secure_orbitdb_manager": types.ModuleType("secure_orbitdb_manager"),
            "hallucinate_app.secure_fireproofdb_manager": types.ModuleType("secure_fireproofdb_manager"),
            "hallucinate_app.secure_duckdb_ipld_manager": types.ModuleType("secure_duckdb_ipld_manager"),
            "hallucinate_app.auth": types.ModuleType("auth")
        }
        
        # Set up mock secure_orbitdb_manager
        mock_modules["hallucinate_app.secure_orbitdb_manager"].secure_orbitdb_manager = mock_orbit_db
        mock_modules["hallucinate_app.secure_orbitdb_manager"].ORBITDB_CAPABILITIES = {
            "CREATE_DATABASE": "orbitdb:create",
            "WRITE": "orbitdb:write",
            "READ": "orbitdb:read",
            "DELETE": "orbitdb:delete",
            "ADMIN": "orbitdb:admin"
        }
        
        # Set up mock secure_fireproofdb_manager
        mock_modules["hallucinate_app.secure_fireproofdb_manager"].secure_fireproofdb_manager = mock_fireproof_db
        mock_modules["hallucinate_app.secure_fireproofdb_manager"].FIREPROOFDB_CAPABILITIES = {
            "CREATE_DATABASE": "fireproofdb:create",
            "WRITE": "fireproofdb:write",
            "READ": "fireproofdb:read",
            "DELETE": "fireproofdb:delete",
            "ADMIN": "fireproofdb:admin"
        }
        
        # Set up mock secure_duckdb_ipld_manager
        mock_modules["hallucinate_app.secure_duckdb_ipld_manager"].secure_duckdb_ipld_manager = mock_duck_db
        mock_modules["hallucinate_app.secure_duckdb_ipld_manager"].DUCKDB_IPLD_CAPABILITIES = {
            "EXECUTE": "duckdb:execute",
            "QUERY": "duckdb:query",
            "EXPORT_IPLD": "duckdb:export:ipld",
            "IMPORT_IPLD": "duckdb:import:ipld",
            "ADMIN": "duckdb:admin"
        }
        
        # Set up mock auth
        mock_modules["hallucinate_app.auth"].auth_manager = mock_auth_manager
        
        # Add mock modules to sys.modules
        for name, module in mock_modules.items():
            sys.modules[name] = module
        
        logger.info("Mock environment set up successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to set up mock environment: {e}")
        return False


def run_tests(args):
    """Run the database sync integration tests"""
    try:
        # Set up mock environment if requested
        if args.mock:
            if not setup_mock_environment():
                return json.dumps({
                    "success": False,
                    "error": "Failed to set up mock environment",
                    "timestamp": datetime.now().isoformat()
                }, indent=2)
        
        # Import the test module
        from hallucinate_app.test.test_database_sync_manager_integration import (
            TestDatabaseSyncManagerIntegration,
            run_tests as run_all_tests
        )
        
        # If a specific test is requested, run just that test
        if args.test:
            import unittest
            # Create a test suite with just the requested test
            suite = unittest.TestSuite()
            suite.addTest(TestDatabaseSyncManagerIntegration(args.test))
            
            # Run the test
            runner = unittest.TextTestRunner(verbosity=2 if args.verbose else 1)
            result = runner.run(suite)
            
            # Return JSON result
            return json.dumps({
                "success": result.wasSuccessful(),
                "test": args.test,
                "total": result.testsRun,
                "failures": len(result.failures),
                "errors": len(result.errors),
                "timestamp": datetime.now().isoformat()
            }, indent=2)
        else:
            # Run all tests
            return run_all_tests()
    
    except Exception as e:
        import traceback
        logger.error(f"Error running tests: {e}")
        logger.error(traceback.format_exc())
        return json.dumps({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "timestamp": datetime.now().isoformat()
        }, indent=2)


def main():
    """Main entry point"""
    args = parse_args()
    
    logger.info("Running Database Sync Manager integration tests")
    if args.mock:
        logger.info("Using mock implementations")
    if args.test:
        logger.info(f"Running specific test: {args.test}")
    
    # Run the tests
    results = run_tests(args)
    
    # Write results to file if requested
    if args.output:
        with open(args.output, 'w') as f:
            f.write(results)
        logger.info(f"Test results written to {args.output}")
    
    # Print results to stdout
    if args.verbose or not args.output:
        print(results)
    
    # Determine exit code based on success
    try:
        result_dict = json.loads(results)
        if not result_dict.get("success", False):
            sys.exit(1)
    except:
        # If we can't parse results as JSON, assume failure
        sys.exit(1)


if __name__ == "__main__":
    main()