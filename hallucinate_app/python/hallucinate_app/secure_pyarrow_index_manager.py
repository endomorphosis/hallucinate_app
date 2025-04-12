"""
Secure PyArrow Content Index Manager

Provides capability-based secure access to PyArrow Content Index operations
Integrates with UCAN authentication for decentralized auth
Implements proper error handling and access control
"""

import os
import json
import logging
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("secure_pyarrow_index_manager")

# Define capability namespaces for PyArrow Content Index operations
PYARROW_INDEX_CAPABILITIES = {
    "READ": 'pyarrow-index:read',     # Read access to the content index
    "WRITE": 'pyarrow-index:write',   # Write access to the content index
    "SYNC": 'pyarrow-index:sync',     # Sync index with IPFS pinset
    "EXPORT": 'pyarrow-index:export', # Export index to Parquet
    "IMPORT": 'pyarrow-index:import', # Import index from Parquet
    "DELETE": 'pyarrow-index:delete', # Delete entries from the index
    "ADMIN": 'pyarrow-index:admin',   # Administrative operations (all capabilities)
}

class SecurePyArrowIndexManager:
    """
    Secure PyArrow Content Index Manager

    Provides capability-based security for all content index operations
    """

    def __init__(self, resources=None, metadata=None):
        """
        Initialize the secure PyArrow content index manager

        Args:
            resources (dict): Resources including auth manager and integration layer
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}

        # Use resources if provided, otherwise try to import the defaults
        self.auth = self.resources.get('auth')
        if not self.auth:
            try:
                from hallucinate_app.auth import auth_manager
                self.auth = auth_manager
            except ImportError:
                logger.warning("Auth manager not found in resources and could not be imported")
                self.auth = None

        # PyArrow Content Index Integration from resources or import
        self.integration = self.resources.get('content_index_integration')
        if not self.integration:
            try:
                from hallucinate_app.pyarrow_content_index_integration import content_index_integration
                self.integration = content_index_integration
            except ImportError:
                logger.warning("Content index integration not found in resources and could not be imported")
                self.integration = None

        # Flag for initialization
        self.initialized = False

        # Default configurations
        self.config = {
            'index_path': self.metadata.get('index_path'),
            'cache_results': self.metadata.get('cache_results', True),
            'cache_ttl': self.metadata.get('cache_ttl', 300),
            'convert_to_json': self.metadata.get('convert_to_json', True),
            'log_level': self.metadata.get('log_level', 'INFO')
        }

        # Operational stats
        self.stats = {
            'access_granted': 0,
            'access_denied': 0,
            'entries_added': 0,
            'entries_updated': 0,
            'entries_deleted': 0,
            'queries_performed': 0,
            'syncs_performed': 0,
            'imports_performed': 0,
            'exports_performed': 0,
            'last_request': None,
            'start_time': time.time()
        }

        # Initialize observability if available
        self.observability = None
        self.observability_enabled = False
        self._initialize_observability()

        logger.info("Secure PyArrow Content Index Manager initialized")

    def _initialize_observability(self):
        """Initialize observability for metrics tracking if available"""
        try:
            # Try to import observability module
            from hallucinate_app.observability import (
                get_metrics, register_counter, register_gauge, register_histogram
            )

            # Check if metrics are enabled
            metrics = get_metrics()
            if metrics:
                namespace = "pyarrow_index"
                subsystem = "secure_manager"

                # Register metrics
                self.metrics = {
                    "access_requests": register_counter(
                        "pyarrow_index_access_requests_total",
                        "Total number of PyArrow index access requests",
                        ["operation", "status"],
                        namespace,
                        subsystem
                    ),
                    "access_errors": register_counter(
                        "pyarrow_index_access_errors_total",
                        "Total number of PyArrow index access errors",
                        ["operation", "error_type"],
                        namespace,
                        subsystem
                    ),
                    "operation_duration": register_histogram(
                        "pyarrow_index_operation_duration_seconds",
                        "Duration of PyArrow index operations in seconds",
                        ["operation"],
                        [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10],
                        namespace,
                        subsystem
                    ),
                    "index_size": register_gauge(
                        "pyarrow_index_entry_count",
                        "Number of entries in the PyArrow content index",
                        [],
                        namespace,
                        subsystem
                    ),
                    "query_size": register_histogram(
                        "pyarrow_index_query_result_size",
                        "Size of PyArrow index query results",
                        ["query_type"],
                        [0, 1, 10, 50, 100, 500, 1000],
                        namespace,
                        subsystem
                    )
                }

                self.observability_enabled = True
                logger.info("Observability initialized for SecurePyArrowIndexManager")
        except (ImportError, AttributeError):
            logger.info("Observability not available, metrics disabled")
            self.observability_enabled = False

    async def init(self) -> bool:
        """
        Initialize the secure PyArrow content index manager

        Returns:
            bool: Success status
        """
        start_time = time.time()
        try:
            # Ensure auth manager is initialized
            if self.auth and not getattr(self.auth, 'initialized', False):
                if hasattr(self.auth, 'init') and callable(self.auth.init):
                    await self.auth.init()

            # Ensure integration is initialized
            if self.integration and not getattr(self.integration, 'initialized', False):
                if hasattr(self.integration, 'init') and callable(self.integration.init):
                    await self.integration.init()

            # Update metrics if observability is enabled
            if self.observability_enabled:
                try:
                    stats = await self.integration.get_stats()
                    if stats and 'entry_count' in stats:
                        self.metrics['index_size'].set(stats['entry_count'])
                except Exception as e:
                    logger.warning(f"Error updating metrics during initialization: {e}")

            self.initialized = True
            logger.info("Secure PyArrow Content Index Manager initialization complete")
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": "init"}, duration)
            
            return True
        except Exception as e:
            logger.error(f"Error initializing secure PyArrow content index manager: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": "init", 
                    "error_type": e.__class__.__name__
                })
            
            return False

    async def _verify_capability(self, capability_type: str, auth_token: str, resource: str = '*') -> bool:
        """
        Verify the requested capability

        Args:
            capability_type (str): Type of capability required
            auth_token (str): Authentication token
            resource (str, optional): Specific resource identifier. Defaults to '*'.

        Returns:
            bool: True if access is granted, False otherwise

        Raises:
            Exception: If verification fails due to system error
        """
        if not self.initialized:
            raise RuntimeError("Secure PyArrow Content Index Manager not initialized")

        try:
            # Track access request
            self.stats['last_request'] = {
                'capability': capability_type,
                'resource': resource,
                'timestamp': datetime.now().isoformat()
            }

            # Check for admin capability (which grants all access)
            admin_capability = f"{PYARROW_INDEX_CAPABILITIES['ADMIN']}:{resource}"
            has_admin_capability = False
            
            if self.auth and hasattr(self.auth, 'verify_capability'):
                has_admin_capability = await self.auth.verify_capability(
                    auth_token,
                    admin_capability
                )

            if has_admin_capability:
                # Admin capability grants access to everything
                self.stats['access_granted'] += 1

                # Update metrics
                if self.observability_enabled:
                    self.metrics['access_requests'].inc({
                        "operation": capability_type, 
                        "status": "granted_admin"
                    })

                return True

            # Check for specific capability
            capability = f"{capability_type}:{resource}"
            has_capability = False
            
            if self.auth and hasattr(self.auth, 'verify_capability'):
                has_capability = await self.auth.verify_capability(
                    auth_token,
                    capability
                )

            if has_capability:
                self.stats['access_granted'] += 1

                # Update metrics
                if self.observability_enabled:
                    self.metrics['access_requests'].inc({
                        "operation": capability_type, 
                        "status": "granted"
                    })

                return True

            # Access denied
            self.stats['access_denied'] += 1

            # Update metrics
            if self.observability_enabled:
                self.metrics['access_requests'].inc({
                    "operation": capability_type, 
                    "status": "denied"
                })

            return False
        except Exception as e:
            logger.error(f"Error verifying capability {capability_type}: {e}")

            # Update metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": capability_type, 
                    "error_type": e.__class__.__name__
                })

            raise RuntimeError(f"Access verification failed: {str(e)}")

    async def lookup_by_cid(self, cid: str, auth_token: str) -> Dict[str, Any]:
        """
        Look up content by CID with capability verification

        Args:
            cid (str): Content identifier
            auth_token (str): Authentication token

        Returns:
            dict: Content metadata

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "lookup_by_cid"
        
        try:
            # Verify read capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["READ"],
                auth_token,
                cid
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['READ']}:{cid}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.lookup_by_cid(cid)
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def lookup_by_path(self, path: str, auth_token: str) -> Dict[str, Any]:
        """
        Look up content by path with capability verification

        Args:
            path (str): Virtual filesystem path
            auth_token (str): Authentication token

        Returns:
            dict: Content metadata

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "lookup_by_path"
        
        try:
            # Verify read capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["READ"],
                auth_token,
                path
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['READ']}:{path}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.lookup_by_path(path)
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def query(self, query_params: Dict[str, Any], auth_token: str) -> List[Dict[str, Any]]:
        """
        Query the content index with capability verification

        Args:
            query_params (dict): Query parameters
            auth_token (str): Authentication token

        Returns:
            list: Query results

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "query"
        
        try:
            # Verify read capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["READ"],
                auth_token
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['READ']}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            results = await self.integration.query(query_params)
            
            # Update stats
            self.stats['queries_performed'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
                
                # Record query result size
                if isinstance(results, list):
                    self.metrics['query_size'].observe(
                        {"query_type": query_params.get('type', 'general')},
                        len(results)
                    )
            
            return results
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def add_entry(self, entry: Dict[str, Any], auth_token: str) -> Dict[str, Any]:
        """
        Add an entry to the content index with capability verification

        Args:
            entry (dict): Entry to add
            auth_token (str): Authentication token

        Returns:
            dict: Added entry

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "add_entry"
        
        try:
            # Get resource identifier
            resource = entry.get('cid', '*')
            
            # Verify write capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["WRITE"],
                auth_token,
                resource
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['WRITE']}:{resource}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.add_entry(entry)
            
            # Update stats
            self.stats['entries_added'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
                
                # Update index size metric
                try:
                    stats = await self.integration.get_stats()
                    if stats and 'entry_count' in stats:
                        self.metrics['index_size'].set(stats['entry_count'])
                except Exception as e:
                    logger.warning(f"Error updating metrics after add operation: {e}")
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def update_entry(self, cid: str, update_data: Dict[str, Any], auth_token: str) -> Dict[str, Any]:
        """
        Update an entry in the content index with capability verification

        Args:
            cid (str): Content identifier
            update_data (dict): Data to update
            auth_token (str): Authentication token

        Returns:
            dict: Updated entry

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "update_entry"
        
        try:
            # Verify write capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["WRITE"],
                auth_token,
                cid
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['WRITE']}:{cid}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.update_entry(cid, update_data)
            
            # Update stats
            self.stats['entries_updated'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def delete_entry(self, cid: str, auth_token: str) -> bool:
        """
        Delete an entry from the content index with capability verification

        Args:
            cid (str): Content identifier
            auth_token (str): Authentication token

        Returns:
            bool: Success status

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "delete_entry"
        
        try:
            # Verify delete capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["DELETE"],
                auth_token,
                cid
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['DELETE']}:{cid}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.delete_entry(cid)
            
            # Update stats
            self.stats['entries_deleted'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
                
                # Update index size metric
                try:
                    stats = await self.integration.get_stats()
                    if stats and 'entry_count' in stats:
                        self.metrics['index_size'].set(stats['entry_count'])
                except Exception as e:
                    logger.warning(f"Error updating metrics after delete operation: {e}")
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def get_stats(self, auth_token: str) -> Dict[str, Any]:
        """
        Get content index statistics with capability verification

        Args:
            auth_token (str): Authentication token

        Returns:
            dict: Statistics

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "get_stats"
        
        try:
            # Verify read capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["READ"],
                auth_token
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['READ']}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.get_stats()
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
                
                # Update index size metric
                if result and 'entry_count' in result:
                    self.metrics['index_size'].set(result['entry_count'])
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def sync_with_ipfs_pinset(self, include_metadata: bool, auth_token: str) -> Dict[str, Any]:
        """
        Synchronize the content index with IPFS pinset with capability verification

        Args:
            include_metadata (bool): Whether to include detailed metadata
            auth_token (str): Authentication token

        Returns:
            dict: Synchronization results

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "sync_with_ipfs_pinset"
        
        try:
            # Verify sync capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["SYNC"],
                auth_token
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['SYNC']}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.sync_with_ipfs_pinset(include_metadata)
            
            # Update stats
            self.stats['syncs_performed'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
                
                # Update index size metric
                try:
                    stats = await self.integration.get_stats()
                    if stats and 'entry_count' in stats:
                        self.metrics['index_size'].set(stats['entry_count'])
                except Exception as e:
                    logger.warning(f"Error updating metrics after sync operation: {e}")
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def export_to_parquet(self, export_path: str, auth_token: str) -> bool:
        """
        Export content index to Parquet format with capability verification

        Args:
            export_path (str): Path to export the index to
            auth_token (str): Authentication token

        Returns:
            bool: Success status

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "export_to_parquet"
        
        try:
            # Verify export capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["EXPORT"],
                auth_token
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['EXPORT']}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.export_to_parquet(export_path)
            
            # Update stats
            self.stats['exports_performed'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    async def import_from_parquet(self, import_path: str, auth_token: str) -> bool:
        """
        Import content index from Parquet format with capability verification

        Args:
            import_path (str): Path to import the index from
            auth_token (str): Authentication token

        Returns:
            bool: Success status

        Raises:
            Exception: If access is denied or operation fails
        """
        start_time = time.time()
        operation = "import_from_parquet"
        
        try:
            # Verify import capability
            has_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["IMPORT"],
                auth_token
            )

            if not has_access:
                raise RuntimeError(f"Access denied: Missing capability {PYARROW_INDEX_CAPABILITIES['IMPORT']}")

            # Delegate to integration
            if not self.integration:
                raise RuntimeError("Content index integration not available")
                
            result = await self.integration.import_from_parquet(import_path)
            
            # Update stats
            self.stats['imports_performed'] += 1
            
            # Record operation duration
            if self.observability_enabled:
                duration = time.time() - start_time
                self.metrics['operation_duration'].observe({"operation": operation}, duration)
                
                # Update index size metric
                try:
                    stats = await self.integration.get_stats()
                    if stats and 'entry_count' in stats:
                        self.metrics['index_size'].set(stats['entry_count'])
                except Exception as e:
                    logger.warning(f"Error updating metrics after import operation: {e}")
            
            return result
        except Exception as e:
            logger.error(f"Error in {operation}: {e}")
            
            # Record error in metrics
            if self.observability_enabled:
                self.metrics['access_errors'].inc({
                    "operation": operation, 
                    "error_type": e.__class__.__name__
                })
            
            raise

    def get_security_status(self) -> Dict[str, Any]:
        """
        Get security status metrics

        Returns:
            dict: Security status information
        """
        uptime = time.time() - self.stats['start_time']
        
        return {
            "module": "secure_pyarrow_index",
            "initialized": self.initialized,
            "auth_initialized": self.auth and getattr(self.auth, 'initialized', False),
            "integration_initialized": self.integration and getattr(self.integration, 'initialized', False),
            "uptime_seconds": int(uptime),
            "access_stats": {
                "granted": self.stats['access_granted'],
                "denied": self.stats['access_denied'],
                "ratio": self.stats['access_denied'] > 0 ? 
                    (self.stats['access_granted'] / (self.stats['access_granted'] + self.stats['access_denied'])) : 
                    1.0
            },
            "operations": {
                "entries_added": self.stats['entries_added'],
                "entries_updated": self.stats['entries_updated'],
                "entries_deleted": self.stats['entries_deleted'],
                "queries_performed": self.stats['queries_performed'],
                "syncs_performed": self.stats['syncs_performed'],
                "imports_performed": self.stats['imports_performed'],
                "exports_performed": self.stats['exports_performed']
            },
            "last_request": self.stats['last_request'],
            "observability_enabled": self.observability_enabled
        }

    async def test(self, verbose=False) -> Dict[str, Any]:
        """
        Test the secure PyArrow content index manager

        Args:
            verbose (bool): Whether to include detailed logs

        Returns:
            dict: Test results
        """
        logger.info("Testing secure PyArrow content index manager")
        
        # Start with basic test structure
        test_result = {
            "success": False,
            "module": "secure_pyarrow_index_manager",
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
        
        # Add log message if verbose
        if verbose:
            test_result["logs"].append(f"[INFO] Starting test at {datetime.now().isoformat()}")
        
        # Test initialization
        if not self.initialized:
            if verbose:
                test_result["logs"].append("[INFO] Testing initialization")
            
            try:
                init_result = await self.init()
                test_result["steps"]["initialization"] = {
                    "success": init_result,
                    "message": "Successfully initialized" if init_result else "Failed to initialize"
                }
                
                if not init_result:
                    if verbose:
                        test_result["logs"].append("[ERROR] Initialization failed, skipping remaining tests")
                    test_result["success"] = False
                    return test_result
            except Exception as e:
                test_result["steps"]["initialization"] = {
                    "success": False,
                    "message": f"Exception during initialization: {str(e)}"
                }
                if verbose:
                    test_result["logs"].append(f"[ERROR] Initialization failed with exception: {e}")
                test_result["success"] = False
                return test_result
        else:
            test_result["steps"]["initialization"] = {
                "success": True,
                "message": "Already initialized"
            }
        
        # Test dependencies
        if verbose:
            test_result["logs"].append("[INFO] Testing dependencies")
        
        test_result["diagnostics"]["dependencies"]["auth"] = {
            "available": self.auth is not None,
            "initialized": self.auth and getattr(self.auth, 'initialized', False)
        }
        
        test_result["diagnostics"]["dependencies"]["integration"] = {
            "available": self.integration is not None,
            "initialized": self.integration and getattr(self.integration, 'initialized', False)
        }
        
        # Skip remaining tests if dependencies are missing
        if not self.auth or not self.integration:
            missing = []
            if not self.auth:
                missing.append("auth")
            if not self.integration:
                missing.append("integration")
                
            test_result["steps"]["dependencies"] = {
                "success": False,
                "message": f"Missing required dependencies: {', '.join(missing)}"
            }
            
            if verbose:
                test_result["logs"].append(f"[ERROR] Missing required dependencies: {', '.join(missing)}")
            
            test_result["success"] = False
            return test_result
        else:
            test_result["steps"]["dependencies"] = {
                "success": True,
                "message": "All required dependencies available"
            }
        
        # Get auth token for testing (either real or mock)
        try:
            if verbose:
                test_result["logs"].append("[INFO] Testing auth token generation")
                
            auth_token = None
            if hasattr(self.auth, 'get_self_signed_token'):
                auth_token = await self.auth.get_self_signed_token(PYARROW_INDEX_CAPABILITIES["ADMIN"])
            else:
                # Mock token for testing
                auth_token = f"test-token-{PYARROW_INDEX_CAPABILITIES['ADMIN']}-{time.time()}"
                
                # Add a mock verify_capability method if needed for testing
                if not hasattr(self.auth, 'verify_capability'):
                    self.auth.verify_capability = lambda token, capability: True
            
            test_result["steps"]["auth_token"] = {
                "success": auth_token is not None,
                "message": "Successfully got auth token" if auth_token else "Failed to get auth token"
            }
                
            if not auth_token:
                if verbose:
                    test_result["logs"].append("[ERROR] Failed to get auth token, skipping remaining tests")
                test_result["success"] = False
                return test_result
        except Exception as e:
            test_result["steps"]["auth_token"] = {
                "success": False,
                "message": f"Exception getting auth token: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Failed to get auth token: {e}")
            test_result["success"] = False
            return test_result
        
        # Test capability verification
        if verbose:
            test_result["logs"].append("[INFO] Testing capability verification")
            
        try:
            has_admin_access = await self._verify_capability(
                PYARROW_INDEX_CAPABILITIES["ADMIN"],
                auth_token
            )
            
            test_result["steps"]["capability_verification"] = {
                "success": has_admin_access,
                "message": "Successfully verified admin capability" if has_admin_access else "Failed to verify admin capability"
            }
            
            if not has_admin_access:
                if verbose:
                    test_result["logs"].append("[ERROR] Admin capability verification failed, skipping remaining tests")
                test_result["success"] = False
                return test_result
        except Exception as e:
            test_result["steps"]["capability_verification"] = {
                "success": False,
                "message": f"Exception during capability verification: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Capability verification failed with exception: {e}")
            test_result["success"] = False
            return test_result
        
        # Create a test entry
        test_entry = {
            "cid": f"test-cid-{int(time.time())}",
            "path": f"/test/path-{int(time.time())}",
            "size": 1024,
            "mimetype": "text/plain",
            "added_at": datetime.now().isoformat(),
            "metadata": {
                "test": True,
                "timestamp": time.time()
            }
        }
        
        # Test add_entry
        if verbose:
            test_result["logs"].append("[INFO] Testing add_entry")
            
        try:
            add_result = await self.add_entry(test_entry, auth_token)
            
            test_result["steps"]["add_entry"] = {
                "success": bool(add_result) and add_result.get("cid") == test_entry["cid"],
                "message": "Successfully added test entry" if add_result else "Failed to add test entry"
            }
            
            if not add_result:
                if verbose:
                    test_result["logs"].append("[ERROR] Add entry failed, skipping related tests")
        except Exception as e:
            test_result["steps"]["add_entry"] = {
                "success": False,
                "message": f"Exception during add_entry: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Add entry failed with exception: {e}")
        
        # Test lookup_by_cid
        if verbose:
            test_result["logs"].append("[INFO] Testing lookup_by_cid")
            
        try:
            lookup_result = await self.lookup_by_cid(test_entry["cid"], auth_token)
            
            test_result["steps"]["lookup_by_cid"] = {
                "success": bool(lookup_result) and lookup_result.get("cid") == test_entry["cid"],
                "message": "Successfully looked up test entry by CID" if lookup_result else "Failed to look up test entry by CID"
            }
        except Exception as e:
            test_result["steps"]["lookup_by_cid"] = {
                "success": False,
                "message": f"Exception during lookup_by_cid: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Lookup by CID failed with exception: {e}")
        
        # Test lookup_by_path
        if verbose:
            test_result["logs"].append("[INFO] Testing lookup_by_path")
            
        try:
            lookup_result = await self.lookup_by_path(test_entry["path"], auth_token)
            
            test_result["steps"]["lookup_by_path"] = {
                "success": bool(lookup_result) and lookup_result.get("path") == test_entry["path"],
                "message": "Successfully looked up test entry by path" if lookup_result else "Failed to look up test entry by path"
            }
        except Exception as e:
            test_result["steps"]["lookup_by_path"] = {
                "success": False,
                "message": f"Exception during lookup_by_path: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Lookup by path failed with exception: {e}")
        
        # Test update_entry
        if verbose:
            test_result["logs"].append("[INFO] Testing update_entry")
            
        try:
            update_data = {
                "metadata": {
                    "test": True,
                    "updated": True,
                    "timestamp": time.time()
                }
            }
            
            update_result = await self.update_entry(test_entry["cid"], update_data, auth_token)
            
            test_result["steps"]["update_entry"] = {
                "success": bool(update_result) and update_result.get("metadata", {}).get("updated") == True,
                "message": "Successfully updated test entry" if update_result else "Failed to update test entry"
            }
        except Exception as e:
            test_result["steps"]["update_entry"] = {
                "success": False,
                "message": f"Exception during update_entry: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Update entry failed with exception: {e}")
        
        # Test query
        if verbose:
            test_result["logs"].append("[INFO] Testing query")
            
        try:
            query_params = {
                "filter": "test = true",
                "limit": 10
            }
            
            query_result = await self.query(query_params, auth_token)
            
            test_result["steps"]["query"] = {
                "success": isinstance(query_result, list),
                "message": f"Successfully queried entries, found {len(query_result) if isinstance(query_result, list) else 0} results" if isinstance(query_result, list) else "Failed to query entries"
            }
        except Exception as e:
            test_result["steps"]["query"] = {
                "success": False,
                "message": f"Exception during query: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Query failed with exception: {e}")
        
        # Test get_stats
        if verbose:
            test_result["logs"].append("[INFO] Testing get_stats")
            
        try:
            stats_result = await self.get_stats(auth_token)
            
            test_result["steps"]["get_stats"] = {
                "success": isinstance(stats_result, dict),
                "message": "Successfully retrieved stats" if isinstance(stats_result, dict) else "Failed to retrieve stats"
            }
        except Exception as e:
            test_result["steps"]["get_stats"] = {
                "success": False,
                "message": f"Exception during get_stats: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Get stats failed with exception: {e}")
        
        # Test access control with invalid token
        if verbose:
            test_result["logs"].append("[INFO] Testing access control with invalid token")
            
        try:
            invalid_token = "invalid-token-1234"
            
            try:
                # This should fail with access denied
                await self.lookup_by_cid(test_entry["cid"], invalid_token)
                
                # If we get here, access control failed
                test_result["steps"]["access_control"] = {
                    "success": False,
                    "message": "Access control failed: Operation succeeded with invalid token"
                }
                
                if verbose:
                    test_result["logs"].append("[ERROR] Access control test failed: Operation succeeded with invalid token")
            except Exception as e:
                # We expect an access denied error
                if "Access denied" in str(e):
                    test_result["steps"]["access_control"] = {
                        "success": True,
                        "message": "Access control working correctly: Access denied with invalid token"
                    }
                    
                    if verbose:
                        test_result["logs"].append("[INFO] Access control test passed: Invalid token correctly denied")
                else:
                    test_result["steps"]["access_control"] = {
                        "success": False,
                        "message": f"Access control test failed with unexpected error: {str(e)}"
                    }
                    
                    if verbose:
                        test_result["logs"].append(f"[ERROR] Access control test failed with unexpected error: {e}")
            
        except Exception as e:
            test_result["steps"]["access_control"] = {
                "success": False,
                "message": f"Exception during access control test: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Access control test failed with exception: {e}")
        
        # Test delete_entry (cleanup)
        if verbose:
            test_result["logs"].append("[INFO] Testing delete_entry (cleanup)")
            
        try:
            delete_result = await self.delete_entry(test_entry["cid"], auth_token)
            
            test_result["steps"]["delete_entry"] = {
                "success": delete_result is True,
                "message": "Successfully deleted test entry" if delete_result is True else "Failed to delete test entry"
            }
        except Exception as e:
            test_result["steps"]["delete_entry"] = {
                "success": False,
                "message": f"Exception during delete_entry: {str(e)}"
            }
            if verbose:
                test_result["logs"].append(f"[ERROR] Delete entry failed with exception: {e}")
        
        # Calculate overall success
        required_steps = [
            "initialization",
            "dependencies",
            "auth_token",
            "capability_verification",
            "add_entry",
            "lookup_by_cid",
            "lookup_by_path",
            "update_entry",
            "query",
            "get_stats",
            "access_control",
            "delete_entry"
        ]
        
        successful_steps = 0
        for step in required_steps:
            if step in test_result["steps"] and test_result["steps"][step]["success"]:
                successful_steps += 1
        
        test_result["success"] = successful_steps == len(required_steps)
        
        if verbose:
            test_result["logs"].append(f"[INFO] Test completed with status: {'SUCCESS' if test_result['success'] else 'FAILED'}")
            test_result["logs"].append(f"[INFO] Passed {successful_steps} of {len(required_steps)} steps")
        
        return test_result


# Create a singleton instance for easy import
secure_pyarrow_index_manager = SecurePyArrowIndexManager()