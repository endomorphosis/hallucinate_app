"""
PyArrow Content Index Integration Module

Provides an integration layer for the ipfs_kit_py.PyArrowContentIndex
Enables efficient content discovery across multiple storage backends
Acts as a bridge between Python and JavaScript components
Follows the integration layer pattern from CLAUDE.md
"""

import os
import json
import logging
import time
import traceback
import sys
from datetime import datetime
from typing import Dict, List, Optional, Union, Any, Tuple
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index_integration")

# Custom error classes for better error handling
class ContentIndexIntegrationError(Exception):
    """Base exception class for PyArrow Content Index Integration errors"""
    def __init__(self, message, details=None):
        self.message = message
        self.details = details or {}
        self.timestamp = datetime.now().isoformat()
        super().__init__(message)
    
    def to_dict(self):
        """Convert error to a dictionary for serialization"""
        return {
            'error': self.__class__.__name__,
            'message': self.message,
            'details': self.details,
            'timestamp': self.timestamp
        }

class PyArrowContentIndexIntegration:
    """
    Integration layer for ipfs_kit_py.PyArrowContentIndex
    
    Provides a bridge between hallucinate_app and the PyArrowContentIndex
    from the ipfs_kit_py package
    """
    
    # Required dependencies for the real implementation
    DEPENDENCIES = ["ipfs_kit_py", "pyarrow"]
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the PyArrow content index integration
        
        Args:
            resources (dict): Resources including ipfs_kit and filesystem provider
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Track initialization state
        self.initialized = False
        
        # Capture start time for performance tracking
        self.start_time = time.time()
        
        # Track if we're using mock implementation
        self.use_mock = False
        
        # Set up logging
        self.log_level = self.metadata.get('log_level', 'INFO')
        numeric_level = getattr(logging, self.log_level.upper(), None)
        if isinstance(numeric_level, int):
            logging.getLogger("pyarrow_content_index_integration").setLevel(numeric_level)
        
        # Initialize the content index - will be set in init()
        self.content_index = None
        
        # Get index path from metadata or use default
        self.index_path = self.metadata.get(
            'index_path', 
            os.path.join(os.path.expanduser("~"), '.hallucinate_app', 'content_index.arrow')
        )
        
        # Store last error for monitoring
        self.last_error = None
        
        # Integration settings
        self.convert_to_json = self.metadata.get('convert_to_json', True)
        self.cache_results = self.metadata.get('cache_results', True)
        self.cache_ttl = self.metadata.get('cache_ttl', 300)  # 5 minutes
        
        # Simple cache for frequent lookups
        self.cache = {}
        self.cache_timestamps = {}
        
        logger.info(f"PyArrowContentIndexIntegration initialized with path={self.index_path}")
    
    def _log_info(self, message):
        """Log an info message"""
        logger.info(message)
    
    def _log_error(self, message, exc_info=False):
        """Log an error message with optional exception info"""
        logger.error(message, exc_info=exc_info)
    
    def _log_warning(self, message):
        """Log a warning message"""
        logger.warning(message)
    
    def _handle_error(self, operation, error, details=None):
        """
        Centralized error handling method
        
        Args:
            operation (str): Name of the operation that caused the error
            error (Exception): The exception that occurred
            details (dict, optional): Additional details about the error context
            
        Returns:
            dict: Error information dictionary
        """
        details = details or {}
        error_type = error.__class__.__name__
        error_msg = str(error)
        stack_trace = traceback.format_exc()
        
        # Create structured error information
        error_info = {
            'operation': operation,
            'error': error_type,
            'message': error_msg,
            'timestamp': datetime.now().isoformat(),
            'details': details,
            'stack_trace': stack_trace,
            'component': 'PyArrowContentIndexIntegration'
        }
        
        # Log the error
        self._log_error(
            f"Error in {operation}: {error_type} - {error_msg}",
            exc_info=True
        )
        
        # Store as last error
        self.last_error = error_info
        
        # Try to report to error monitor if available
        if 'error_monitor' in self.resources:
            try:
                error_monitor = self.resources['error_monitor']
                if hasattr(error_monitor, 'add_error') and callable(error_monitor.add_error):
                    # Convert to ErrorData if the interface exists
                    try:
                        from hallucinate_app.error_monitor import ErrorData, ErrorLevel, ErrorSource
                        error_data = ErrorData(
                            timestamp=error_info['timestamp'],
                            level=ErrorLevel.ERROR,
                            source=ErrorSource.INTEGRATION,
                            component="PyArrowContentIndexIntegration",
                            operation=operation,
                            message=f"{error_type}: {error_msg}",
                            details=details,
                            stack_trace=stack_trace
                        )
                        # Use asyncio to add the error asynchronously
                        try:
                            loop = asyncio.get_running_loop()
                            if loop.is_running():
                                asyncio.create_task(error_monitor.add_error(error_data))
                            else:
                                asyncio.run(error_monitor.add_error(error_data))
                        except RuntimeError:
                            asyncio.run(error_monitor.add_error(error_data))
                    except ImportError:
                        # Just log if error_monitor module not importable
                        self._log_warning("Could not import error_monitor for proper error reporting")
            except Exception as e:
                self._log_error(f"Failed to report error to error monitor: {e}")
        
        # Convert to integration error
        if not isinstance(error, ContentIndexIntegrationError):
            error = ContentIndexIntegrationError(error_msg, details)
        
        return error_info
    
    def _clear_cache(self, key=None):
        """
        Clear the cache completely or for a specific key
        
        Args:
            key (str, optional): Specific cache key to clear
        """
        if key is not None:
            if key in self.cache:
                del self.cache[key]
            if key in self.cache_timestamps:
                del self.cache_timestamps[key]
        else:
            self.cache = {}
            self.cache_timestamps = {}
    
    def _check_cache(self, key):
        """
        Check if a valid cache entry exists for the key
        
        Args:
            key (str): Cache key to check
            
        Returns:
            Any: Cached value or None if not found or expired
        """
        if not self.cache_results:
            return None
        
        if key not in self.cache:
            return None
        
        # Check if the cache entry has expired
        timestamp = self.cache_timestamps.get(key, 0)
        if time.time() - timestamp > self.cache_ttl:
            # Cache expired, remove it
            self._clear_cache(key)
            return None
        
        return self.cache[key]
    
    def _set_cache(self, key, value):
        """
        Set a cache entry
        
        Args:
            key (str): Cache key
            value (Any): Value to cache
        """
        if not self.cache_results:
            return
        
        self.cache[key] = value
        self.cache_timestamps[key] = time.time()
    
    async def init(self):
        """
        Initialize the content index integration
        
        Returns:
            bool: Success status
        """
        if self.initialized:
            return True
        
        try:
            self._log_info("Initializing PyArrow content index integration")
            
            # Check if we need to use mock implementation
            try:
                # Import the PyArrowContentIndex from ipfs_kit_py package
                from ipfs_kit_py import PyArrowContentIndex
                ipfs_client = None
                
                # Get IPFS client from resources
                if 'ipfs_kit' in self.resources:
                    ipfs_kit = self.resources['ipfs_kit']
                    # Extract IPFS client from ipfs_kit if available
                    if hasattr(ipfs_kit, 'ipfs') and ipfs_kit.ipfs is not None:
                        ipfs_client = ipfs_kit.ipfs
                    # Otherwise try to use the ipfs_kit directly
                    else:
                        ipfs_client = ipfs_kit
                
                # Get fs_provider from resources if available
                fs_provider = self.resources.get('fs_provider')
                
                # Create an instance of PyArrowContentIndex from ipfs_kit_py
                self.content_index = PyArrowContentIndex(
                    index_path=self.index_path,
                    ipfs_client=ipfs_client,
                    fs_provider=fs_provider
                )
                
                # Initialize the content index
                await self.content_index.init()
                
                self._log_info("Successfully initialized PyArrowContentIndex from ipfs_kit_py")
                self.use_mock = False
                
            except (ImportError, AttributeError) as e:
                self._log_warning(f"Could not import or initialize PyArrowContentIndex from ipfs_kit_py: {e}")
                self._log_warning("Falling back to mock implementation")
                
                # Initialize mock implementation
                from hallucinate_app.pyarrow_content_index import PyArrowContentIndex as MockPyArrowContentIndex
                
                # Create resources dict with available resources
                mock_resources = {}
                if 'ipfs_kit' in self.resources:
                    mock_resources['ipfs_kit'] = self.resources['ipfs_kit']
                if 'fs_provider' in self.resources:
                    mock_resources['fs_provider'] = self.resources['fs_provider']
                if 'error_monitor' in self.resources:
                    mock_resources['error_monitor'] = self.resources['error_monitor']
                
                # Create an instance of the mock implementation
                self.content_index = MockPyArrowContentIndex(
                    resources=mock_resources,
                    metadata=self.metadata
                )
                
                # Initialize the mock content index
                await self.content_index.init()
                
                self._log_info("Successfully initialized mock PyArrowContentIndex")
                self.use_mock = True
            
            self.initialized = True
            return True
            
        except Exception as e:
            self._handle_error("init", e)
            return False
    
    async def lookup_by_cid(self, cid: str) -> Dict[str, Any]:
        """
        Look up content by CID
        
        Args:
            cid (str): Content identifier
            
        Returns:
            dict: Content metadata
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Check cache first
            cache_key = f"cid:{cid}"
            cached_result = self._check_cache(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Delegate to the content index implementation
            result = await self.content_index.lookup_by_cid(cid)
            
            # Convert to JSON serializable dict if needed
            if self.convert_to_json and hasattr(self.content_index, 'to_json'):
                result = self.content_index.to_json(result)
            
            # Cache the result
            self._set_cache(cache_key, result)
            
            return result
        except Exception as e:
            self._handle_error("lookup_by_cid", e, {"cid": cid})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error looking up CID {cid}: {str(e)}")
    
    async def lookup_by_path(self, path: str) -> Dict[str, Any]:
        """
        Look up content by virtual filesystem path
        
        Args:
            path (str): Virtual filesystem path
            
        Returns:
            dict: Content metadata
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Check cache first
            cache_key = f"path:{path}"
            cached_result = self._check_cache(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Delegate to the content index implementation
            result = await self.content_index.lookup_by_path(path)
            
            # Convert to JSON serializable dict if needed
            if self.convert_to_json and hasattr(self.content_index, 'to_json'):
                result = self.content_index.to_json(result)
            
            # Cache the result
            self._set_cache(cache_key, result)
            
            return result
        except Exception as e:
            self._handle_error("lookup_by_path", e, {"path": path})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error looking up path {path}: {str(e)}")
    
    async def add_entry(self, entry_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add an entry to the content index
        
        Args:
            entry_data (dict): Entry data with CID, path, and metadata
            
        Returns:
            dict: Added entry
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            result = await self.content_index.add_entry(entry_data)
            
            # Clear cache for this entry
            if 'cid' in entry_data:
                self._clear_cache(f"cid:{entry_data['cid']}")
            if 'path' in entry_data:
                self._clear_cache(f"path:{entry_data['path']}")
            
            # Convert to JSON serializable dict if needed
            if self.convert_to_json and hasattr(self.content_index, 'to_json'):
                result = self.content_index.to_json(result)
            
            return result
        except Exception as e:
            self._handle_error("add_entry", e, {"entry_data": entry_data})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error adding entry: {str(e)}")
    
    async def update_entry(self, cid: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an entry in the content index
        
        Args:
            cid (str): Content identifier
            update_data (dict): Data to update
            
        Returns:
            dict: Updated entry
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            result = await self.content_index.update_entry(cid, update_data)
            
            # Clear cache for this entry
            self._clear_cache(f"cid:{cid}")
            if 'path' in update_data:
                self._clear_cache(f"path:{update_data['path']}")
            
            # Convert to JSON serializable dict if needed
            if self.convert_to_json and hasattr(self.content_index, 'to_json'):
                result = self.content_index.to_json(result)
            
            return result
        except Exception as e:
            self._handle_error("update_entry", e, {"cid": cid, "update_data": update_data})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error updating entry {cid}: {str(e)}")
    
    async def delete_entry(self, cid: str) -> bool:
        """
        Delete an entry from the content index
        
        Args:
            cid (str): Content identifier
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Get the entry first to get the path for cache clearing
            try:
                entry = await self.content_index.lookup_by_cid(cid)
                path = entry.get('path')
            except:
                path = None
            
            # Delegate to the content index implementation
            result = await self.content_index.delete_entry(cid)
            
            # Clear cache for this entry
            self._clear_cache(f"cid:{cid}")
            if path:
                self._clear_cache(f"path:{path}")
            
            return result
        except Exception as e:
            self._handle_error("delete_entry", e, {"cid": cid})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error deleting entry {cid}: {str(e)}")
    
    async def query(self, query_params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Query the content index
        
        Args:
            query_params (dict): Query parameters including filters, sorting, pagination
            
        Returns:
            list: Matching entries
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Create cache key from sorted query params
            cache_key = f"query:{json.dumps(query_params, sort_keys=True)}"
            cached_result = self._check_cache(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Delegate to the content index implementation
            result = await self.content_index.query(query_params)
            
            # Convert to JSON serializable dict if needed
            if self.convert_to_json and hasattr(self.content_index, 'to_json'):
                result = [self.content_index.to_json(entry) for entry in result]
            
            # Cache the result
            self._set_cache(cache_key, result)
            
            return result
        except Exception as e:
            self._handle_error("query", e, {"query_params": query_params})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error querying content index: {str(e)}")
    
    async def sync_with_ipfs_pinset(self, include_metadata: bool = True) -> Dict[str, Any]:
        """
        Synchronize the content index with the IPFS pinset
        
        Args:
            include_metadata (bool): Whether to include detailed metadata
            
        Returns:
            dict: Synchronization results
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            result = await self.content_index.sync_with_ipfs_pinset(include_metadata)
            
            # Clear the entire cache since many entries may have changed
            self._clear_cache()
            
            return result
        except Exception as e:
            self._handle_error("sync_with_ipfs_pinset", e, {"include_metadata": include_metadata})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error syncing with IPFS pinset: {str(e)}")
    
    async def save(self) -> bool:
        """
        Save the content index to disk
        
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            return await self.content_index.save()
        except Exception as e:
            self._handle_error("save", e)
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error saving content index: {str(e)}")
    
    async def export_to_parquet(self, export_path: str) -> bool:
        """
        Export the content index to Parquet format
        
        Args:
            export_path (str): Path to export the Parquet file
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            return await self.content_index.export_to_parquet(export_path)
        except Exception as e:
            self._handle_error("export_to_parquet", e, {"export_path": export_path})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error exporting content index to Parquet: {str(e)}")
    
    async def import_from_parquet(self, import_path: str) -> bool:
        """
        Import the content index from Parquet format
        
        Args:
            import_path (str): Path to import the Parquet file from
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            result = await self.content_index.import_from_parquet(import_path)
            
            # Clear the entire cache since many entries may have changed
            self._clear_cache()
            
            return result
        except Exception as e:
            self._handle_error("import_from_parquet", e, {"import_path": import_path})
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error importing content index from Parquet: {str(e)}")
    
    async def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the content index
        
        Returns:
            dict: Statistics including count, size, types, etc.
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Delegate to the content index implementation
            return await self.content_index.get_stats()
        except Exception as e:
            self._handle_error("get_stats", e)
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error getting content index stats: {str(e)}")
            
    async def start_realtime_server(self, host="localhost", port=8765, auth_manager=None):
        """
        Start a WebSocket server for real-time updates
        
        This creates a WebSocket server that clients can connect to in order to
        receive real-time notifications when the content index changes.
        
        Args:
            host (str): Server host
            port (int): Server port
            auth_manager: Optional authentication manager
            
        Returns:
            dict: Server information
        """
        if not self.initialized:
            await self.init()
            
        try:
            # Import the realtime server module
            from hallucinate_app.pyarrow_content_index_realtime_server import (
                PyArrowContentIndexRealtimeServer, start_realtime_server
            )
            
            # Start the server
            server = await start_realtime_server(
                content_index_integration=self,
                host=host,
                port=port,
                auth_manager=auth_manager
            )
            
            # Store the server instance for later use
            self.realtime_server = server
            
            return {
                "success": True,
                "host": host,
                "port": port,
                "websocket_url": f"ws://{host}:{port}/pyarrow-content-index/ws",
                "server_running": server.running
            }
        except Exception as e:
            self._handle_error("start_realtime_server", e)
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error starting real-time server: {str(e)}")
            
    async def stop_realtime_server(self):
        """
        Stop the WebSocket server for real-time updates
        
        Returns:
            bool: Success status
        """
        if not hasattr(self, 'realtime_server') or self.realtime_server is None:
            return False
            
        try:
            # Stop the server
            await self.realtime_server.stop()
            self.realtime_server = None
            return True
        except Exception as e:
            self._handle_error("stop_realtime_server", e)
            # Re-raise as integration error
            raise ContentIndexIntegrationError(f"Error stopping real-time server: {str(e)}")
    
    def test(self, verbose=False) -> Dict[str, Any]:
        """
        Test the content index integration
        
        Args:
            verbose (bool): Whether to include detailed logs
            
        Returns:
            dict: Test results
        """
        # Start with basic test structure
        test_result = {
            "success": False,
            "module": "pyarrow_content_index_integration",
            "timestamp": datetime.now().isoformat(),
            "steps": {},
            "diagnostics": {
                "dependencies": {},
                "environment": {
                    "python_version": sys.version,
                    "platform": sys.platform
                }
            },
            "logs": [] if verbose else None
        }
        
        # Create test entry data
        test_entry = {
            "cid": "QmTestCID12345",
            "path": "/test/path/file.txt",
            "mimetype": "text/plain",
            "size": 1024,
            "tags": ["test", "integration"],
            "description": "Test entry for integration testing"
        }
        
        async def _run_tests():
            """Run the actual tests"""
            if verbose:
                test_result["logs"].append(f"[INFO] Starting test at {datetime.now().isoformat()}")
            
            # Check dependencies
            for dep in self.DEPENDENCIES:
                if verbose:
                    test_result["logs"].append(f"[INFO] Checking dependency: {dep}")
                
                try:
                    if dep == "ipfs_kit_py":
                        __import__("ipfs_kit_py")
                        test_result["diagnostics"]["dependencies"][dep] = {
                            "available": True,
                            "mock_fallback": self.use_mock
                        }
                    elif dep == "pyarrow":
                        import pyarrow
                        test_result["diagnostics"]["dependencies"][dep] = {
                            "available": True,
                            "version": getattr(pyarrow, "__version__", "unknown")
                        }
                    else:
                        __import__(dep)
                        test_result["diagnostics"]["dependencies"][dep] = {
                            "available": True
                        }
                except ImportError as e:
                    test_result["diagnostics"]["dependencies"][dep] = {
                        "available": False,
                        "error": str(e)
                    }
            
            # Test initialization
            if verbose:
                test_result["logs"].append("[INFO] Testing initialization")
            
            try:
                await self.init()
                test_result["steps"]["initialization"] = {
                    "success": True,
                    "message": "Successfully initialized content index integration"
                }
            except Exception as e:
                test_result["steps"]["initialization"] = {
                    "success": False,
                    "message": f"Failed to initialize: {str(e)}"
                }
                # Early return if initialization fails
                return test_result
            
            # Test adding an entry
            if verbose:
                test_result["logs"].append("[INFO] Testing add_entry")
            
            try:
                add_result = await self.add_entry(test_entry)
                test_result["steps"]["add_entry"] = {
                    "success": True,
                    "message": "Successfully added test entry",
                    "data": add_result if verbose else None
                }
            except Exception as e:
                test_result["steps"]["add_entry"] = {
                    "success": False,
                    "message": f"Failed to add entry: {str(e)}"
                }
                # Continue with tests that don't depend on add_entry
            
            # Test lookup by CID
            if verbose:
                test_result["logs"].append("[INFO] Testing lookup_by_cid")
            
            try:
                lookup_result = await self.lookup_by_cid(test_entry["cid"])
                test_result["steps"]["lookup_by_cid"] = {
                    "success": True,
                    "message": "Successfully looked up entry by CID",
                    "data": lookup_result if verbose else None
                }
            except Exception as e:
                test_result["steps"]["lookup_by_cid"] = {
                    "success": False,
                    "message": f"Failed to lookup by CID: {str(e)}"
                }
            
            # Test lookup by path
            if verbose:
                test_result["logs"].append("[INFO] Testing lookup_by_path")
            
            try:
                lookup_result = await self.lookup_by_path(test_entry["path"])
                test_result["steps"]["lookup_by_path"] = {
                    "success": True,
                    "message": "Successfully looked up entry by path",
                    "data": lookup_result if verbose else None
                }
            except Exception as e:
                test_result["steps"]["lookup_by_path"] = {
                    "success": False,
                    "message": f"Failed to lookup by path: {str(e)}"
                }
            
            # Test update entry
            if verbose:
                test_result["logs"].append("[INFO] Testing update_entry")
            
            try:
                update_data = {"description": "Updated test description"}
                update_result = await self.update_entry(test_entry["cid"], update_data)
                test_result["steps"]["update_entry"] = {
                    "success": True,
                    "message": "Successfully updated test entry",
                    "data": update_result if verbose else None
                }
            except Exception as e:
                test_result["steps"]["update_entry"] = {
                    "success": False,
                    "message": f"Failed to update entry: {str(e)}"
                }
            
            # Test query
            if verbose:
                test_result["logs"].append("[INFO] Testing query")
            
            try:
                query_params = {
                    "tags": ["test"],
                    "limit": 10
                }
                query_result = await self.query(query_params)
                test_result["steps"]["query"] = {
                    "success": True,
                    "message": f"Successfully queried entries, found {len(query_result)} results",
                    "data": {"count": len(query_result)} if verbose else None
                }
            except Exception as e:
                test_result["steps"]["query"] = {
                    "success": False,
                    "message": f"Failed to query entries: {str(e)}"
                }
            
            # Test getting stats
            if verbose:
                test_result["logs"].append("[INFO] Testing get_stats")
            
            try:
                stats_result = await self.get_stats()
                test_result["steps"]["get_stats"] = {
                    "success": True,
                    "message": "Successfully retrieved content index stats",
                    "data": stats_result if verbose else None
                }
            except Exception as e:
                test_result["steps"]["get_stats"] = {
                    "success": False,
                    "message": f"Failed to get stats: {str(e)}"
                }
            
            # Test saving the index
            if verbose:
                test_result["logs"].append("[INFO] Testing save")
            
            try:
                save_result = await self.save()
                test_result["steps"]["save"] = {
                    "success": save_result,
                    "message": "Successfully saved content index" if save_result else "Failed to save content index"
                }
            except Exception as e:
                test_result["steps"]["save"] = {
                    "success": False,
                    "message": f"Failed to save content index: {str(e)}"
                }
            
            # Cleanup - delete test entry
            if verbose:
                test_result["logs"].append("[INFO] Cleaning up - deleting test entry")
            
            try:
                delete_result = await self.delete_entry(test_entry["cid"])
                test_result["steps"]["delete_entry"] = {
                    "success": delete_result,
                    "message": "Successfully deleted test entry" if delete_result else "Failed to delete test entry"
                }
            except Exception as e:
                test_result["steps"]["delete_entry"] = {
                    "success": False,
                    "message": f"Failed to delete test entry: {str(e)}"
                }
            
            # Test real-time server (optional)
            if verbose:
                test_result["logs"].append("[INFO] Testing real-time server functionality")
            
            try:
                # Start the real-time server
                realtime_result = await self.start_realtime_server(
                    host="localhost",
                    port=8766  # Use a different port for testing
                )
                
                if realtime_result["success"] and realtime_result["server_running"]:
                    test_result["steps"]["realtime_server"] = {
                        "success": True,
                        "message": "Successfully started real-time server",
                        "data": {
                            "host": realtime_result["host"],
                            "port": realtime_result["port"],
                            "websocket_url": realtime_result["websocket_url"]
                        } if verbose else None
                    }
                    
                    # Stop the server
                    stop_result = await self.stop_realtime_server()
                    test_result["steps"]["stop_realtime_server"] = {
                        "success": stop_result,
                        "message": "Successfully stopped real-time server" if stop_result else "Failed to stop real-time server"
                    }
                else:
                    test_result["steps"]["realtime_server"] = {
                        "success": False,
                        "message": "Failed to start real-time server",
                        "data": realtime_result if verbose else None
                    }
            except Exception as e:
                test_result["steps"]["realtime_server"] = {
                    "success": False,
                    "message": f"Error testing real-time server: {str(e)}"
                }
            
            # Determine overall success
            step_successes = [step["success"] for step in test_result["steps"].values()]
            test_result["success"] = len(step_successes) > 0 and all(step_successes)
            
            if verbose:
                test_result["logs"].append(f"[INFO] Test completed with status: {'SUCCESS' if test_result['success'] else 'FAILED'}")
            
            return test_result
        
        # Run the tests in an event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            test_result = loop.run_until_complete(_run_tests())
        finally:
            loop.close()
        
        return test_result


# Create singleton instance for import
content_index_integration = PyArrowContentIndexIntegration()