#!/usr/bin/env python3
"""
Error Monitoring System Example

This script demonstrates how to use the comprehensive error monitoring system
with the PyArrow Content Index and Electron integration.
"""

import os
import sys
import asyncio
import argparse
import logging
from pathlib import Path

# Add the parent directory to the path to ensure imports work correctly
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("error_monitoring_example")

# Import required modules
from hallucinate_app.python.hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource
from hallucinate_app.python.hallucinate_app.pyarrow_content_index import (
    PyArrowContentIndex, ContentIndexError, ContentNotFoundError, SchemaValidationError, StorageError
)

class MockElectronBridge:
    """Mock implementation of the Electron bridge for testing"""
    
    def __init__(self):
        self.reported_errors = []
        self.reported_warnings = []
        self.reported_fatal_errors = []
    
    def report_error(self, error_info):
        """Report an error to Electron"""
        logger.info(f"Electron Bridge: Reporting error - {error_info['message']}")
        self.reported_errors.append(error_info)
    
    def report_warning(self, warning_info):
        """Report a warning to Electron"""
        logger.info(f"Electron Bridge: Reporting warning - {warning_info['message']}")
        self.reported_warnings.append(warning_info)
    
    def report_fatal_error(self, error_info):
        """Report a fatal error to Electron"""
        logger.info(f"Electron Bridge: Reporting FATAL error - {error_info['message']}")
        self.reported_fatal_errors.append(error_info)

def create_example_directory():
    """Create a directory for example files"""
    example_dir = Path(os.path.expanduser("~")) / ".hallucinate_app" / "examples"
    os.makedirs(example_dir, exist_ok=True)
    
    # Create subdirectories
    logs_dir = example_dir / "logs"
    os.makedirs(logs_dir, exist_ok=True)
    
    return example_dir

async def setup_error_monitor():
    """Set up the error monitor"""
    # Start the error monitor
    await error_monitor.start()
    
    # Add a simple alert handler
    def alert_handler(error, rule_name):
        logger.warning(f"ALERT from rule {rule_name}: {error.message}")
    
    error_monitor.add_alert_handler(alert_handler)
    
    return error_monitor

async def create_content_index(example_dir, electron_bridge=None):
    """Create a PyArrow Content Index with error monitoring enabled"""
    # Set up resources
    resources = {
        'error_monitor': error_monitor,
        'electron_bridge': electron_bridge
    }
    
    # Set up metadata
    metadata = {
        'index_path': str(example_dir / "content_index.arrow"),
        'enable_error_monitoring': True,
        'enable_electron_error_reporting': electron_bridge is not None,
        'error_log_path': str(example_dir / "logs" / "content_index_errors.log")
    }
    
    # Create the content index
    content_index = PyArrowContentIndex(resources=resources, metadata=metadata)
    
    # Initialize the index
    await content_index.init()
    
    return content_index

async def generate_example_errors(content_index):
    """Generate a variety of example errors"""
    logger.info("Generating example errors...")
    
    # 1. Content not found error
    try:
        non_existent_cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
        result = await content_index.lookup_by_cid(non_existent_cid)
        if result is None:
            raise ContentNotFoundError(f"Content with CID {non_existent_cid} not found", {"cid": non_existent_cid})
    except Exception as e:
        content_index._handle_error("lookup_by_cid", e, {"cid": non_existent_cid})
    
    # 2. Schema validation error
    try:
        invalid_entry = {
            'cid': 'bafybeihykld6qswr5lrwcmcbykjqvwxdeqgvfn5d3yzizeieiwonj4vxgm',
            'path': '/invalid/path',
            'metadata': {
                'invalid_field': 'This field does not exist in the schema',
                'size': 'not a number'  # Should be an integer
            }
        }
        await content_index.add_entry(invalid_entry)
    except Exception as e:
        content_index._handle_error("add_entry", e, {"entry": invalid_entry})
    
    # 3. Storage error (simulated)
    try:
        # Simulate a storage error by attempting to save to a non-writable location
        original_path = content_index.index_path
        content_index.index_path = "/root/invalid/path/content_index.arrow"  # Requires root permissions
        await content_index.save()
    except Exception as e:
        content_index._handle_error("save", e, {"path": content_index.index_path})
        # Restore the original path
        content_index.index_path = original_path
    
    # 4. Fatal initialization error (simulated)
    try:
        # Simulate a fatal initialization error
        raise StorageError("Simulated fatal initialization error", {"fatal": True})
    except Exception as e:
        content_index._handle_error("initialization", e, {"fatal": True})
    
    # 5. General error
    try:
        # Simulate a general error
        raise ContentIndexError("General operation failed", {"operation": "general_operation"})
    except Exception as e:
        content_index._handle_error("general_operation", e)
    
    logger.info("Example errors generated")

async def view_error_analytics():
    """View analytics about the errors"""
    logger.info("Viewing error analytics...")
    
    # Get analytics
    analytics = await error_monitor.get_analytics()
    
    # Display summary
    if 'summary' in analytics:
        summary = analytics['summary']
        logger.info(f"Total errors: {summary.get('total_errors', 0)}")
        
        # Error rates
        if 'error_rates' in summary:
            rates = summary['error_rates']
            logger.info(f"Error rates: hourly={rates.get('hourly', 0)}, daily avg={rates.get('daily_avg', 0)}")
        
        # Top errors
        if 'top_errors' in summary:
            logger.info("Top errors:")
            for i, error in enumerate(summary['top_errors']):
                logger.info(f"  {i+1}. {error.get('message', 'Unknown')[:50]} - {error.get('count', 0)} occurrences")
    
    # Component status
    if 'component_status' in analytics:
        logger.info("Component status:")
        for component, status in analytics['component_status'].items():
            logger.info(f"  {component}: {status.get('status', 'unknown')}")
    
    # Recovery stats
    if 'recovery_stats' in analytics:
        recovery = analytics['recovery_stats']
        logger.info(f"Recovery attempts: {recovery.get('attempts', 0)}")
        logger.info(f"Successful recoveries: {recovery.get('successes', 0)}")
        logger.info(f"Failed recoveries: {recovery.get('failures', 0)}")

async def attempt_error_recovery():
    """Attempt to recover from errors"""
    logger.info("Attempting error recovery...")
    
    # Get unresolved errors
    errors = await error_monitor.get_errors(resolved=False)
    
    for error in errors:
        logger.info(f"Attempting recovery for error: {error.id} - {error.message}")
        
        # Attempt recovery
        success, recovery_info = await error_monitor.recovery_manager.attempt_recovery(error)
        
        if success:
            logger.info(f"Recovery successful: {recovery_info}")
        else:
            logger.info(f"Recovery failed: {recovery_info}")

async def resolve_errors():
    """Manually resolve errors"""
    logger.info("Manually resolving errors...")
    
    # Get unresolved errors
    errors = await error_monitor.get_errors(resolved=False)
    
    for error in errors:
        logger.info(f"Resolving error: {error.id} - {error.message}")
        
        # Resolve the error
        resolved = await error_monitor.mark_resolved(error.id, {
            "notes": "Manually resolved during example run",
            "automatic": False
        })
        
        if resolved:
            logger.info(f"Error {error.id} resolved successfully")
        else:
            logger.info(f"Failed to resolve error {error.id}")

async def clean_up():
    """Clean up resources"""
    logger.info("Cleaning up resources...")
    
    # Stop the error monitor
    await error_monitor.stop()

async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Error Monitoring System Example")
    parser.add_argument("--electron", action="store_true", help="Simulate Electron integration")
    parser.add_argument("--verbose", action="store_true", help="Show verbose output")
    args = parser.parse_args()
    
    # Set log level based on verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Create example directory
        example_dir = create_example_directory()
        
        # Set up mock Electron bridge if requested
        electron_bridge = None
        if args.electron:
            electron_bridge = MockElectronBridge()
        
        # Set up error monitor
        await setup_error_monitor()
        
        # Create content index
        content_index = await create_content_index(example_dir, electron_bridge)
        
        # Generate example errors
        await generate_example_errors(content_index)
        
        # Wait for errors to be processed
        logger.info("Waiting for errors to be processed...")
        await asyncio.sleep(2)
        
        # View error analytics
        await view_error_analytics()
        
        # Attempt error recovery
        await attempt_error_recovery()
        
        # View updated analytics
        await view_error_analytics()
        
        # Resolve remaining errors
        await resolve_errors()
        
        # Clean up
        await clean_up()
        
        # If using mock Electron bridge, show summary
        if args.electron:
            logger.info(f"Electron errors reported: {len(electron_bridge.reported_errors)}")
            logger.info(f"Electron warnings reported: {len(electron_bridge.reported_warnings)}")
            logger.info(f"Electron fatal errors reported: {len(electron_bridge.reported_fatal_errors)}")
        
        logger.info("Example completed successfully")
        
    except Exception as e:
        logger.error(f"Example failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 1
    
    return 0

if __name__ == "__main__":
    asyncio.run(main())