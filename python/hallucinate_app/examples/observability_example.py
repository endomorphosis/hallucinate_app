"""
Example usage of the Observability module with IPFS Kit integration

This example demonstrates how to use the observability module to monitor
IPFS Kit operations, collect metrics, and log structured data.
"""

import os
import sys
import time
import random
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

# Import observability module
from hallucinate_app.observability import (
    init_observability, get_observability,
    timer, timed, track_operation, track_error,
    info, warning, error, debug, set_context, context
)

# Try to import ipfs_kit_py
try:
    import ipfs_kit_py
    from ipfs_kit_py.ipfs_kit import ipfs_kit
    from ipfs_kit_py.high_level_api import IPFSSimpleAPI
    HAS_IPFS_KIT = True
except ImportError:
    HAS_IPFS_KIT = False
    print("Warning: ipfs_kit_py not found, running in simulation mode")


def initialize_observability():
    """Initialize the observability module with configuration"""
    
    # Configuration for observability
    config = {
        "namespace": "ipfs_kit",
        "subsystem": "example",
        "logger_name": "ipfs_kit_example",
        "collect_system_metrics": True,
        "prometheus": {
            "enable_server": True,
            "port": 9090
        },
        "system_metrics_interval": 5
    }
    
    # Initialize observability
    obs = init_observability(config)
    
    # Log initialization
    info("Observability initialized", config=config)
    
    return obs


def simulate_ipfs_operations(count=10):
    """Simulate IPFS operations for demonstration"""
    
    # Set context for all operations in this function
    with context(source="simulation", component="ipfs_operations"):
        info(f"Starting simulated IPFS operations (count={count})")
        
        # Simulate multiple operations
        for i in range(count):
            # Generate random content
            content = f"Test content {i}"
            content_size = len(content)
            
            # Different operation types
            operations = ["add", "get", "pin", "unpin"]
            operation = random.choice(operations)
            
            # Simulate success or error
            success = random.random() > 0.2  # 80% success rate
            
            # Time the operation
            with timer(operation):
                # Simulate operation delay
                time.sleep(random.uniform(0.1, 0.5))
                
                if success:
                    # Track successful operation
                    track_operation(operation, status="success")
                    info(f"Operation {operation} succeeded", 
                         content_size=content_size, 
                         operation_id=i)
                    
                    # Update metrics
                    if operation == "add":
                        obs = get_observability()
                        obs.inc_counter(
                            name="ipfs_content_added_total",
                            labels={"content_type": "text"}
                        )
                    elif operation == "get":
                        obs = get_observability()
                        obs.inc_counter(
                            name="ipfs_content_retrieved_total",
                            labels={"content_type": "text"}
                        )
                    elif operation == "pin":
                        obs = get_observability()
                        obs.inc_gauge(name="ipfs_pin_count")
                    elif operation == "unpin":
                        obs = get_observability()
                        obs.dec_gauge(name="ipfs_pin_count")
                else:
                    # Simulate errors
                    error_types = ["timeout", "connection", "validation"]
                    error_type = random.choice(error_types)
                    
                    # Track error
                    track_error(operation, error_type)
                    error(f"Operation {operation} failed",
                          error_type=error_type,
                          operation_id=i)


def simulate_metadata_operations(count=5):
    """Simulate metadata index operations for demonstration"""
    
    # Set context for all operations in this function
    with context(source="simulation", component="metadata_index"):
        info(f"Starting simulated metadata index operations (count={count})")
        
        # Get observability manager
        obs = get_observability()
        
        # Initialize metadata index size
        obs.set_gauge(name="metadata_index_entries", value=0)
        
        # Simulate multiple operations
        for i in range(count):
            # Different operation types
            operations = ["add", "update", "query", "delete"]
            operation = random.choice(operations)
            
            # Simulate success or error
            success = random.random() > 0.1  # 90% success rate
            
            # Time the operation
            with timer(f"metadata_{operation}"):
                # Simulate operation delay
                time.sleep(random.uniform(0.05, 0.3))
                
                if success:
                    # Track successful operation
                    obs.inc_counter(
                        name="metadata_index_operations_total",
                        labels={"operation": operation, "status": "success"}
                    )
                    
                    info(f"Metadata operation {operation} succeeded", operation_id=i)
                    
                    # Update metrics based on operation
                    if operation == "add":
                        obs.inc_gauge(name="metadata_index_entries")
                    elif operation == "delete":
                        obs.dec_gauge(name="metadata_index_entries")
                else:
                    # Simulate errors
                    error_types = ["not_found", "invalid_data", "conflict"]
                    error_type = random.choice(error_types)
                    
                    # Track error
                    obs.inc_counter(
                        name="metadata_index_operations_total",
                        labels={"operation": operation, "status": "error"}
                    )
                    
                    error(f"Metadata operation {operation} failed",
                          error_type=error_type,
                          operation_id=i)


@timed("example_run")
def run_example():
    """Run the complete example"""
    
    # Initialize observability
    obs = initialize_observability()
    
    try:
        # Set context for the entire run
        set_context(environment="example", session_id="12345")
        
        # Log the start of the example
        info("Starting observability example", has_ipfs_kit=HAS_IPFS_KIT)
        
        # Simulate IPFS operations
        simulate_ipfs_operations(count=15)
        
        # Simulate metadata operations
        simulate_metadata_operations(count=8)
        
        # Simulate real IPFS operations if available
        if HAS_IPFS_KIT:
            with context(component="real_ipfs"):
                info("Using real IPFS Kit for operations")
                
                # Initialize IPFS Kit
                ipfs = ipfs_kit()
                api = IPFSSimpleAPI()
                
                # Add content to IPFS
                with timer("real_add"):
                    content = "Real IPFS Kit content"
                    result = api.add(content)
                    cid = result.get("cid")
                    
                    track_operation("real_add", status="success")
                    info("Added content to IPFS", cid=cid, size=len(content))
                
                # Get content from IPFS
                with timer("real_get"):
                    retrieved = api.get(cid)
                    
                    track_operation("real_get", status="success")
                    info("Retrieved content from IPFS", size=len(retrieved))
                
                # Test metadata index if available
                try:
                    metadata_index = ipfs.get_metadata_index()
                    
                    # Add metadata entry
                    with timer("real_metadata_add"):
                        metadata_index.add_entry(
                            cid=cid,
                            path="/test/example.txt",
                            mimetype="text/plain",
                            size=len(content)
                        )
                        
                        obs.inc_counter(
                            name="metadata_index_operations_total",
                            labels={"operation": "add", "status": "success"}
                        )
                        
                        obs.inc_gauge(name="metadata_index_entries")
                        
                        info("Added metadata entry", cid=cid)
                except Exception as e:
                    track_error("real_metadata", error_type=type(e).__name__)
                    error("Failed to use metadata index", error=str(e))
        
        # Log the end of the example
        info("Observability example completed successfully")
        
        # Display Prometheus metrics access information
        if obs.metrics["port"]:
            print(f"\nPrometheus metrics accessible at: http://localhost:{obs.metrics['port']}/metrics")
            print("Metrics will be available for 60 seconds. Press Ctrl+C to exit sooner.")
            
            # Keep the metrics server running for a short time
            for i in range(12):
                time.sleep(5)
                print(f"Metrics server running ({(i+1)*5}/60 seconds)...")
    
    except Exception as e:
        # Log any unexpected errors
        error("Unexpected error in example", 
              error=str(e), 
              error_type=type(e).__name__,
              traceback=traceback.format_exc())
    
    finally:
        # Clean up resources
        info("Cleaning up resources")
        
        # Stop observability manager
        obs.stop()


if __name__ == "__main__":
    import traceback
    print("=== IPFS Kit Observability Example ===")
    
    # Run the example
    try:
        run_example()
    except KeyboardInterrupt:
        print("\nExample interrupted by user")
    finally:
        print("\nExample completed")