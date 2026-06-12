"""
IPFS Kit Bridge Module

This module provides a bridge between the Electron application and the ipfs_kit_py library.
It runs in a separate process and communicates with the main application using ZeroRPC.
"""

import os
import sys
import time
import json
import logging
import asyncio
import threading
import traceback
from typing import Dict, Any, List, Union, Optional
from concurrent.futures import ThreadPoolExecutor

import zerorpc
import msgpack
import structlog
from rich.logging import RichHandler

# Import observability module
from hallucinate_app.observability import (
    init_observability, get_observability,
    timer, timed, track_operation, track_error,
    info, warning, error, debug, set_context, context
)

# Try to import ipfs_kit_py (graceful degradation if not available)
try:
    from ipfs_kit_py.ipfs_kit import ipfs_kit
    from ipfs_kit_py.high_level_api import IPFSSimpleAPI
    from ipfs_kit_py.arrow_metadata_index import ArrowMetadataIndex
    HAS_IPFS_KIT = True
except ImportError:
    HAS_IPFS_KIT = False
    print("Warning: ipfs_kit_py not found. Some functionality will be limited.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(rich_tracebacks=True)]
)

log = structlog.get_logger()

class IPFSKitBridge:
    """
    Bridge for communication between Electron and ipfs_kit_py.
    
    This class provides a ZeroRPC interface for the Electron application to
    interact with the ipfs_kit_py library. It handles process lifecycle,
    error management, and efficient data serialization.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize the IPFS Kit Bridge with the given configuration.
        
        Args:
            config: Configuration dictionary for the bridge and ipfs_kit_py
        """
        self.config = config or {}
        self.log = log.bind(component="IPFSKitBridge")
        self.log.info("Initializing IPFS Kit Bridge")
        
        # Initialize state
        self.initialized = False
        self.ipfs_kit_instance = None
        self.ipfs_simple_api = None
        self.metadata_index = None
        self.event_loop = None
        self.thread_pool = ThreadPoolExecutor(
            max_workers=self.config.get("max_workers", 4)
        )
        
        # Metrics and monitoring
        self.operation_count = 0
        self.error_count = 0
        self.last_error = None
        self.start_time = time.time()
        
        # Initialize observability
        self._initialize_observability()
        
        # Initialize ipfs_kit
        self._initialize_ipfs_kit()
    
    def _initialize_observability(self):
        """Initialize the observability module"""
        # Observability configuration
        obs_config = self.config.get("observability", {})
        if not obs_config:
            # Default configuration
            obs_config = {
                "namespace": "ipfs_kit",
                "subsystem": "bridge",
                "logger_name": "ipfs_kit_bridge",
                "collect_system_metrics": True,
                "prometheus": {
                    "enable_server": True,
                    "port": 9090
                }
            }
        
        # Initialize observability
        self.observability = init_observability(obs_config)
        
        # Set global context for all operations
        set_context(component="ipfs_kit_bridge", process_id=os.getpid())
        
        # Log initialization
        info("Observability initialized for IPFS Kit Bridge", config=obs_config)
    
    def _initialize_ipfs_kit(self):
        """Initialize the ipfs_kit_py components"""
        if not HAS_IPFS_KIT:
            self.log.warning("ipfs_kit_py not available, using mock mode")
            return
            
        try:
            # Create ipfs_kit instance with configuration from bridge config
            ipfs_kit_config = self.config.get("ipfs_kit", {})
            self.ipfs_kit_instance = ipfs_kit(metadata=ipfs_kit_config)
            
            # Create high-level API
            self.ipfs_simple_api = IPFSSimpleAPI(
                config_path=ipfs_kit_config.get("config_path"),
                role=ipfs_kit_config.get("role", "leecher")
            )
            
            # Initialize metadata index if enabled
            if ipfs_kit_config.get("enable_metadata_index", True):
                self.metadata_index = self.ipfs_kit_instance.get_metadata_index()
                self.log.info("Metadata index initialized")
            
            self.initialized = True
            self.log.info("IPFS Kit initialized successfully", 
                         role=ipfs_kit_config.get("role", "leecher"))
            
        except Exception as e:
            self.log.error("Failed to initialize IPFS Kit", 
                          error=str(e), traceback=traceback.format_exc())
            self.last_error = {
                "message": str(e),
                "traceback": traceback.format_exc(),
                "timestamp": time.time()
            }
            self.error_count += 1
    
    # ==== API Methods ====
    
    def ping(self):
        """Simple ping method to check connection"""
        return {
            "status": "ok",
            "timestamp": time.time(),
            "uptime": time.time() - self.start_time,
            "initialized": self.initialized,
            "operations": self.operation_count,
            "errors": self.error_count
        }
    
    def get_status(self):
        """Get detailed status of the IPFS Kit Bridge"""
        status = {
            "initialized": self.initialized,
            "uptime": time.time() - self.start_time,
            "operations": self.operation_count,
            "errors": self.error_count,
            "has_ipfs_kit": HAS_IPFS_KIT,
            "metadata_index_enabled": self.metadata_index is not None
        }
        
        # Add ipfs_kit status if available
        if self.ipfs_kit_instance and self.initialized:
            try:
                # Get node information
                node_info = self.ipfs_simple_api.id()
                status["node_info"] = node_info
                
                # Get peer count
                peers = self.ipfs_simple_api.peers()
                status["peer_count"] = peers.get("count", 0)
                
                # Get pin count
                pins = self.ipfs_simple_api.list_pins()
                status["pin_count"] = len(pins.get("pins", []))
            except Exception as e:
                status["ipfs_kit_error"] = str(e)
        
        return status
    
    @timed("execute_command")
    def execute_command(self, command: str, params: Dict[str, Any] = None):
        """
        Execute a command on the ipfs_kit_py instance
        
        Args:
            command: The command to execute
            params: Parameters for the command
            
        Returns:
            Result of the command
        """
        # Increment operation counter
        self.operation_count += 1
        params = params or {}
        
        # Use context for this operation
        with context(operation=command, params=str(params)):
            info(f"Executing command: {command}", params=params)
        
            if not self.initialized:
                error("IPFS Kit not initialized", command=command)
                track_error(command, "not_initialized")
                return {"success": False, "error": "IPFS Kit not initialized"}
            
            try:
                # Check if command exists in IPFSSimpleAPI
                if hasattr(self.ipfs_simple_api, command):
                    method = getattr(self.ipfs_simple_api, command)
                    
                    # Time the actual method execution
                    with timer(f"ipfs_{command}"):
                        result = method(**params)
                    
                    # Track successful operation
                    track_operation(command, status="success")
                    
                    # Log success with limited result information
                    result_log = result
                    if isinstance(result, dict) and 'data' in result:
                        # Don't log potentially large data
                        result_log = {k: v for k, v in result.items() if k != 'data'}
                        result_log['data_size'] = len(result['data']) if isinstance(result['data'], (bytes, str)) else 'complex'
                    
                    info(f"Command {command} executed successfully", result=result_log)
                    
                    # Update metrics
                    if command == "add":
                        # Get observability manager
                        obs = get_observability()
                        obs.inc_counter(
                            name="ipfs_content_added_total",
                            labels={"content_type": params.get("content_type", "unknown")}
                        )
                    elif command == "get":
                        obs = get_observability()
                        obs.inc_counter(
                            name="ipfs_content_retrieved_total",
                            labels={"content_type": "unknown"}
                        )
                    elif command == "pin":
                        obs = get_observability()
                        obs.inc_gauge(name="ipfs_pin_count")
                    elif command == "unpin":
                        obs = get_observability()
                        obs.dec_gauge(name="ipfs_pin_count")
                    
                    return {"success": True, "result": result}
                else:
                    # Track error for unknown command
                    track_error(command, "unknown_command")
                    error(f"Unknown command: {command}")
                    
                    return {
                        "success": False, 
                        "error": f"Unknown command: {command}"
                    }
            except Exception as e:
                # Increment error counter
                self.error_count += 1
                self.last_error = {
                    "command": command,
                    "params": params,
                    "error": str(e),
                    "traceback": traceback.format_exc(),
                    "timestamp": time.time()
                }
                
                # Log and track error
                error(f"Error executing command {command}", 
                     error=str(e), error_type=type(e).__name__)
                track_error(command, error_type=type(e).__name__)
                
                return {
                    "success": False,
                    "error": str(e),
                    "error_type": type(e).__name__
                }
    
    def metadata_query(self, query: Dict[str, Any] = None):
        """
        Query the metadata index
        
        Args:
            query: Query parameters (filter, sort, limit, etc.)
            
        Returns:
            Query results
        """
        self.operation_count += 1
        query = query or {}
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
        
        try:
            # Extract query parameters
            filter_expr = query.get("filter")
            sort_by = query.get("sort_by")
            limit = query.get("limit")
            offset = query.get("offset", 0)
            
            # Execute query
            results = self.metadata_index.query(
                filter_expr=filter_expr,
                sort_by=sort_by,
                limit=limit,
                offset=offset
            )
            
            # Convert results to serializable format
            serializable_results = []
            for record in results:
                # Convert record to dict
                record_dict = {}
                for field in record._fields:
                    value = getattr(record, field)
                    # Handle non-serializable types
                    if hasattr(value, "to_dict"):
                        record_dict[field] = value.to_dict()
                    else:
                        record_dict[field] = value
                serializable_results.append(record_dict)
            
            return {
                "success": True,
                "count": len(serializable_results),
                "results": serializable_results,
                "query": query
            }
            
        except Exception as e:
            self.error_count += 1
            self.log.error("Error querying metadata index", error=str(e))
            
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    def get_metadata_for_cid(self, cid: str):
        """
        Get metadata for a specific CID
        
        Args:
            cid: The Content ID to retrieve metadata for
            
        Returns:
            Metadata for the specified CID
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
        
        try:
            # Query metadata index for the CID
            metadata = self.metadata_index.lookup_by_cid(cid)
            
            if metadata:
                # Convert to serializable format
                if hasattr(metadata, "to_dict"):
                    result = metadata.to_dict()
                else:
                    # Convert to dict if it's a record/namedtuple
                    if hasattr(metadata, "_fields"):
                        result = {}
                        for field in metadata._fields:
                            value = getattr(metadata, field)
                            if hasattr(value, "to_dict"):
                                result[field] = value.to_dict()
                            else:
                                result[field] = value
                    else:
                        result = dict(metadata)
                
                return {
                    "success": True,
                    "cid": cid,
                    "metadata": result
                }
            else:
                return {
                    "success": False,
                    "cid": cid,
                    "error": "CID not found in metadata index"
                }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error getting metadata for CID", 
                          cid=cid, error=str(e))
            
            return {
                "success": False,
                "cid": cid,
                "error": str(e),
                "error_type": type(e).__name__
            }
            
    def get_metadata_for_path(self, path: str):
        """
        Get metadata for a specific path
        
        Args:
            path: The virtual filesystem path to retrieve metadata for
            
        Returns:
            Metadata for the specified path
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
        
        try:
            # Query metadata index for the path
            metadata = self.metadata_index.lookup_by_path(path)
            
            if metadata:
                # Convert to serializable format
                if hasattr(metadata, "to_dict"):
                    result = metadata.to_dict()
                else:
                    # Convert to dict if it's a record/namedtuple
                    if hasattr(metadata, "_fields"):
                        result = {}
                        for field in metadata._fields:
                            value = getattr(metadata, field)
                            if hasattr(value, "to_dict"):
                                result[field] = value.to_dict()
                            else:
                                result[field] = value
                    else:
                        result = dict(metadata)
                
                return {
                    "success": True,
                    "path": path,
                    "metadata": result
                }
            else:
                return {
                    "success": False,
                    "path": path,
                    "error": "Path not found in metadata index"
                }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error getting metadata for path", 
                          path=path, error=str(e))
            
            return {
                "success": False,
                "path": path,
                "error": str(e),
                "error_type": type(e).__name__
            }
            
    def add_metadata_entry(self, entry: Dict[str, Any]):
        """
        Add a new entry to the metadata index
        
        Args:
            entry: Metadata entry to add (must include cid)
            
        Returns:
            Result of the operation
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
            
        if not entry.get('cid'):
            return {"success": False, "error": "Entry must include a CID"}
            
        try:
            # Add the entry to the metadata index
            self.metadata_index.add_entry(
                cid=entry.get('cid'),
                path=entry.get('path'),
                mimetype=entry.get('mimetype'),
                size=entry.get('size'),
                locations=entry.get('locations', {}),
                metadata=entry.get('metadata', {})
            )
            
            # Save the metadata index immediately
            self.metadata_index.save()
            
            return {
                "success": True,
                "cid": entry.get('cid'),
                "message": "Metadata entry added successfully"
            }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error adding metadata entry", 
                          entry=entry, error=str(e))
            
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
            
    def update_metadata_entry(self, cid: str, updates: Dict[str, Any]):
        """
        Update an existing metadata entry
        
        Args:
            cid: CID of the entry to update
            updates: Metadata fields to update
            
        Returns:
            Result of the operation
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
            
        try:
            # Get existing entry
            existing = self.metadata_index.lookup_by_cid(cid)
            
            if not existing:
                return {
                    "success": False,
                    "cid": cid,
                    "error": "CID not found in metadata index"
                }
                
            # Update the entry
            self.metadata_index.update_entry(
                cid=cid,
                updates=updates
            )
            
            # Save the metadata index immediately
            self.metadata_index.save()
            
            return {
                "success": True,
                "cid": cid,
                "message": "Metadata entry updated successfully"
            }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error updating metadata entry", 
                          cid=cid, updates=updates, error=str(e))
            
            return {
                "success": False,
                "cid": cid,
                "error": str(e),
                "error_type": type(e).__name__
            }
            
    def delete_metadata_entry(self, cid: str):
        """
        Delete a metadata entry
        
        Args:
            cid: CID of the entry to delete
            
        Returns:
            Result of the operation
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
            
        try:
            # Delete the entry
            result = self.metadata_index.delete_entry(cid)
            
            if result:
                # Save the metadata index immediately
                self.metadata_index.save()
                
                return {
                    "success": True,
                    "cid": cid,
                    "message": "Metadata entry deleted successfully"
                }
            else:
                return {
                    "success": False,
                    "cid": cid,
                    "error": "CID not found in metadata index"
                }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error deleting metadata entry", 
                          cid=cid, error=str(e))
            
            return {
                "success": False,
                "cid": cid,
                "error": str(e),
                "error_type": type(e).__name__
            }
            
    def get_metadata_stats(self):
        """
        Get statistics about the metadata index
        
        Returns:
            Statistics about the metadata index
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
            
        try:
            # Get statistics
            stats = self.metadata_index.get_statistics()
            
            return {
                "success": True,
                "stats": stats
            }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error getting metadata stats", error=str(e))
            
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
            
    def export_metadata_index(self, format: str = "parquet", path: str = None):
        """
        Export the metadata index to a file
        
        Args:
            format: Export format ('parquet', 'json', or 'csv')
            path: Path to save the export (None for default)
            
        Returns:
            Result of the operation
        """
        self.operation_count += 1
        
        if not self.initialized or not self.metadata_index:
            return {"success": False, "error": "Metadata index not available"}
            
        try:
            # Determine export path if not provided
            if not path:
                export_dir = os.path.join(os.path.expanduser("~"), ".ipfs_kit", "exports")
                os.makedirs(export_dir, exist_ok=True)
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                path = os.path.join(export_dir, f"metadata_index_{timestamp}.{format}")
            
            # Export the index
            if format == "parquet":
                export_path = self.metadata_index.export_to_parquet(path)
            elif format == "json":
                export_path = self.metadata_index.export_to_json(path)
            elif format == "csv":
                export_path = self.metadata_index.export_to_csv(path)
            else:
                return {
                    "success": False,
                    "error": f"Unsupported export format: {format}"
                }
            
            return {
                "success": True,
                "format": format,
                "path": export_path,
                "message": f"Metadata index exported to {export_path}"
            }
                
        except Exception as e:
            self.error_count += 1
            self.log.error("Error exporting metadata index", 
                          format=format, path=path, error=str(e))
            
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    def run_tests(self, module_name: str = None, test_names: List[str] = None):
        """
        Run tests for the specified module
        
        Args:
            module_name: Name of the module to test (None for all)
            test_names: List of specific tests to run (None for all)
            
        Returns:
            Test results
        """
        self.operation_count += 1
        
        if not self.initialized:
            return {"success": False, "error": "IPFS Kit not initialized"}
        
        try:
            # Get the module to test
            if module_name == "ipfs_kit":
                module = self.ipfs_kit_instance
            elif module_name == "metadata_index":
                module = self.metadata_index
            else:
                # Default to ipfs_kit
                module = self.ipfs_kit_instance
                module_name = "ipfs_kit"
            
            # Run tests
            self.log.info(f"Running tests for {module_name}")
            test_results = module.test(verbose=True)
            
            return {
                "success": True,
                "module": module_name,
                "results": test_results
            }
            
        except Exception as e:
            self.error_count += 1
            self.log.error("Error running tests", 
                          module=module_name, error=str(e))
            
            return {
                "success": False,
                "module": module_name,
                "error": str(e),
                "error_type": type(e).__name__
            }

    def _resolve_cleanup_result(self, result: Any) -> Any:
        """Run coroutine cleanup results from this synchronous shutdown path."""
        if not asyncio.iscoroutine(result):
            return result

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(result)

        outcome = {"result": None, "error": None}

        def run_cleanup():
            try:
                outcome["result"] = asyncio.run(result)
            except Exception as cleanup_error:
                outcome["error"] = cleanup_error

        cleanup_thread = threading.Thread(target=run_cleanup, name="ipfs-kit-cleanup")
        cleanup_thread.start()
        cleanup_thread.join()

        if outcome["error"]:
            raise outcome["error"]

        return outcome["result"]

    def _call_first_cleanup_method(
        self,
        resource: Any,
        method_names: List[str],
        resource_name: str,
        warn_if_missing: bool = True,
    ) -> Any:
        """Call the first supported cleanup method on a resource."""
        for method_name in method_names:
            cleanup = getattr(resource, method_name, None)
            if not callable(cleanup):
                continue

            result = self._resolve_cleanup_result(cleanup())
            info(
                "Cleanup method completed",
                resource=resource_name,
                method=method_name,
                result=result,
            )
            return result

        if warn_if_missing:
            warning(
                "No cleanup method available",
                resource=resource_name,
                methods=method_names,
            )
        return None
    
    @timed("shutdown")
    def shutdown(self):
        """Perform clean shutdown of the IPFS Kit Bridge"""
        self.log.info("Shutting down IPFS Kit Bridge")
        info("Shutting down IPFS Kit Bridge")
        
        try:
            # Clean up thread pool
            if self.thread_pool:
                with timer("thread_pool_shutdown"):
                    self.thread_pool.shutdown(wait=True)
                info("Thread pool shut down")
            
            # Cleanup ipfs_kit resources
            if self.ipfs_kit_instance:
                cleanup_errors = []

                # Save and close metadata index resources if available.
                if self.metadata_index:
                    try:
                        with timer("save_metadata_index"):
                            save_metadata_index = getattr(self.metadata_index, "save", None)
                            if callable(save_metadata_index):
                                info("Saving metadata index")
                                self._resolve_cleanup_result(save_metadata_index())
                            else:
                                debug("Metadata index has no save method; skipping save")
                        
                        # Log index statistics
                        get_statistics = getattr(self.metadata_index, "get_statistics", None)
                        if callable(get_statistics):
                            try:
                                index_stats = get_statistics()
                                info("Metadata index saved", stats=index_stats)
                            except Exception as stats_err:
                                warning("Failed to get metadata index statistics", error=str(stats_err))

                        close_metadata_index = getattr(self.metadata_index, "close", None)
                        if callable(close_metadata_index):
                            with timer("close_metadata_index"):
                                self._resolve_cleanup_result(close_metadata_index())
                            info("Metadata index closed")
                    except Exception as e:
                        cleanup_errors.append(f"metadata_index: {e}")
                        error("Error during metadata index cleanup", error=str(e))
                        track_error("metadata_index_cleanup", error_type=type(e).__name__)

                try:
                    if self.ipfs_simple_api and self.ipfs_simple_api is not self.ipfs_kit_instance:
                        with timer("ipfs_simple_api_cleanup"):
                            self._call_first_cleanup_method(
                                self.ipfs_simple_api,
                                ["shutdown", "close", "stop", "cleanup"],
                                "ipfs_simple_api",
                                warn_if_missing=False,
                            )

                except Exception as e:
                    cleanup_errors.append(f"ipfs_simple_api: {e}")
                    error("Error during IPFS Simple API cleanup", error=str(e))
                    track_error("ipfs_simple_api_cleanup", error_type=type(e).__name__)

                try:
                    with timer("ipfs_kit_instance_cleanup"):
                        self._call_first_cleanup_method(
                            self.ipfs_kit_instance,
                            ["stop_daemons", "shutdown", "close", "stop", "stop_daemon", "cleanup"],
                            "ipfs_kit_instance",
                        )
                except Exception as e:
                    cleanup_errors.append(f"ipfs_kit_instance: {e}")
                    error("Error during IPFS Kit cleanup", error=str(e))
                    track_error("ipfs_kit_cleanup", error_type=type(e).__name__)
                finally:
                    self.metadata_index = None
                    self.ipfs_kit_instance = None
                    self.ipfs_simple_api = None
                    self.initialized = False

                if cleanup_errors:
                    warning("IPFS Kit cleanup completed with errors", errors=cleanup_errors)
                else:
                    info("IPFS Kit resources cleaned up")
            
            # Clean up observability resources
            try:
                # Get the observability manager
                obs = get_observability()
                
                # Update final metrics
                uptime = time.time() - self.start_time
                obs.set_gauge("process_uptime_seconds", uptime)
                
                # Log final stats
                info("Final statistics", 
                     operations=self.operation_count,
                     errors=self.error_count,
                     uptime=uptime)
                
                # Stop observability manager
                obs.stop()
                info("Observability manager stopped")
            except Exception as obs_err:
                error("Error stopping observability", error=str(obs_err))
            
            track_operation("shutdown", status="success")
            return {"success": True, "message": "Shutdown complete"}
        except Exception as e:
            error("Error during shutdown", error=str(e), traceback=traceback.format_exc())
            track_error("shutdown", error_type=type(e).__name__)
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }


def start_server(port=4242, config_path=None):
    """Start the ZeroRPC server for the IPFS Kit Bridge"""
    # Load configuration if provided
    config = {}
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
        except Exception as e:
            log.error(f"Error loading configuration: {e}")
    
    # Create bridge instance
    bridge = IPFSKitBridge(config)
    
    # Create and start ZeroRPC server
    server = zerorpc.Server(bridge)
    server.bind(f"tcp://0.0.0.0:{port}")
    
    # Log server start with structured logging
    log.info(f"Starting IPFS Kit Bridge server on port {port}")
    info("Starting IPFS Kit Bridge server", port=port)
    
    # Add Prometheus metrics URL to log if available
    obs = get_observability()
    if hasattr(obs, 'metrics') and obs.metrics.get('port'):
        prometheus_port = obs.metrics.get('port')
        log.info(f"Prometheus metrics available at http://localhost:{prometheus_port}/metrics")
        info("Prometheus metrics available", url=f"http://localhost:{prometheus_port}/metrics")
    
    # Track server start operation
    track_operation("server_start", status="success")
    
    # Run the server
    try:
        server.run()
    except KeyboardInterrupt:
        # Handle graceful shutdown on keyboard interrupt
        info("Server interrupted by keyboard, shutting down gracefully")
        bridge.shutdown()
    except Exception as e:
        # Log unexpected errors
        error("Unexpected server error", error=str(e), traceback=traceback.format_exc())
        track_error("server_run", error_type=type(e).__name__)


if __name__ == "__main__":
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description="IPFS Kit Bridge")
    parser.add_argument("--port", type=int, default=4242, help="Port to listen on")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    args = parser.parse_args()
    
    # Start server
    start_server(port=args.port, config_path=args.config)
