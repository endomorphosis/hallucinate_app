"""
DuckDB-IPLD Manager Module

Provides a high-level manager for DuckDB-IPLD operations with thread pool integration
and database sync capabilities. This is a non-secure wrapper around the DuckDB-IPLD kit
that integrates with the thread pool system.
"""

import os
import json
import time
import threading
import asyncio
import logging
from typing import Dict, List, Any, Optional, Union, Tuple
from datetime import datetime
from enum import Enum, auto
from queue import Queue

# Import thread pool components
try:
    from .thread_pool_manager import ThreadPoolManager, TaskType, TaskPriority
    from .thread_pool_monitor import ThreadPoolMonitor
    HAS_THREAD_POOL = True
except ImportError:
    HAS_THREAD_POOL = False

# Import DuckDB-IPLD components
try:
    from .duckdb_ipld_kit import DuckDBIPLDKit
    HAS_DUCKDB_IPLD_KIT = True
except ImportError:
    HAS_DUCKDB_IPLD_KIT = False

# Import database sync manager
try:
    from .database_sync_manager import DatabaseSyncManager, SYNC_CAPABILITIES
    HAS_DATABASE_SYNC = True
except ImportError:
    HAS_DATABASE_SYNC = False

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("duckdb_ipld_manager")


class OperationType(Enum):
    """Types of DuckDB-IPLD operations for task prioritization"""
    QUERY = auto()
    INSERT = auto()
    UPDATE = auto()
    DELETE = auto()
    EXPORT_IPLD = auto()
    IMPORT_IPLD = auto()
    EXPORT_PARQUET = auto()
    IMPORT_PARQUET = auto()
    EXPORT_ARROW = auto()
    IMPORT_ARROW = auto()
    EXPORT_DATABASE = auto()
    SYNC = auto()


class DuckDBIPLDManager:
    """
    Manager for DuckDB-IPLD operations with thread pool integration
    and database sync capabilities
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the DuckDB-IPLD Manager
        
        Args:
            resources (dict): Shared resources (thread_pool, sync_manager, etc.)
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.initialized = False
        
        # Set up connections to required services
        self.thread_pool = self.resources.get("thread_pool")
        self.sync_manager = self.resources.get("sync_manager")
        self.auth_manager = self.resources.get("auth")
        
        # Create DuckDB-IPLD kit
        if not self.resources.get("duckdb_ipld_kit"):
            self.duckdb_ipld_kit = DuckDBIPLDKit(resources=self.resources, metadata=self.metadata)
        else:
            self.duckdb_ipld_kit = self.resources.get("duckdb_ipld_kit")
        
        # Set default task priorities
        self.task_priorities = {
            OperationType.QUERY: TaskPriority.HIGH,
            OperationType.INSERT: TaskPriority.NORMAL,
            OperationType.UPDATE: TaskPriority.NORMAL,
            OperationType.DELETE: TaskPriority.NORMAL,
            OperationType.EXPORT_IPLD: TaskPriority.LOW,
            OperationType.IMPORT_IPLD: TaskPriority.LOW,
            OperationType.EXPORT_PARQUET: TaskPriority.LOW,
            OperationType.IMPORT_PARQUET: TaskPriority.LOW,
            OperationType.EXPORT_ARROW: TaskPriority.HIGH,  # Arrow exports are typically for memory sharing, so higher priority
            OperationType.IMPORT_ARROW: TaskPriority.HIGH,
            OperationType.EXPORT_DATABASE: TaskPriority.LOW,
            OperationType.SYNC: TaskPriority.LOW
        }
        
        # Override priorities from metadata if provided
        if "taskPriorities" in self.metadata:
            self.task_priorities.update(self.metadata["taskPriorities"])
        
        # Initialize locks and queues
        self.lock = threading.Lock()
        self.query_queue = Queue()
        self.result_queue = Queue()
        
        # Set up monitoring
        self.stats = {
            "queries": 0,
            "exports": 0,
            "imports": 0,
            "sync_operations": 0,
            "errors": 0,
            "last_operation": None
        }
        
        # Set up event loop for async operations
        self.loop = None
        
        # Database schema cache
        self.schema_cache = {}
        
        # Scheduled sync job
        self.sync_timer = None
        self.sync_interval = self.metadata.get("syncInterval", 60000)  # 1 minute by default
        
        # Check dependencies and warn if missing
        if not HAS_DUCKDB_IPLD_KIT:
            logger.warning("DuckDB-IPLD Kit not available. Limited functionality.")
            
        if not HAS_THREAD_POOL:
            logger.warning("Thread Pool components not available. Will run operations synchronously.")
            
        if not HAS_DATABASE_SYNC:
            logger.warning("Database Sync Manager not available. Sync operations disabled.")
    
    async def init(self):
        """
        Initialize the DuckDB-IPLD Manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Initialize the DuckDB-IPLD kit
            await self.duckdb_ipld_kit.init()
            
            # Initialize database sync if available
            if self.sync_manager and not self.sync_manager.initialized:
                await self.sync_manager.init()
            
            # Create event loop for async operations if needed
            if not self.loop:
                try:
                    self.loop = asyncio.get_event_loop()
                except RuntimeError:
                    self.loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(self.loop)
            
            # Start auto-sync if configured
            if self.metadata.get("autoSync", False):
                self.start_auto_sync()
            
            # Cache database schema
            await self._cache_schema()
            
            self.initialized = True
            logger.info("DuckDB-IPLD Manager initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize DuckDB-IPLD Manager: {e}")
            return False
    
    async def execute(self, sql, params=None, options=None):
        """
        Execute a SQL query with thread pool integration
        
        Args:
            sql (str): SQL query to execute
            params (list): Query parameters
            options (dict): Execution options
            
        Returns:
            dict: Query results
        """
        if not self.initialized:
            await self.init()
        
        self.stats["last_operation"] = {
            "type": "execute",
            "sql": sql,
            "timestamp": datetime.now().isoformat()
        }
        
        operation_type = self._get_operation_type(sql)
        
        try:
            if self.thread_pool and HAS_THREAD_POOL:
                # Get appropriate task priority
                priority = self.task_priorities.get(operation_type, TaskPriority.NORMAL)
                
                # Submit to thread pool
                task_type = TaskType.IO if operation_type in [
                    OperationType.EXPORT_IPLD, 
                    OperationType.EXPORT_PARQUET, 
                    OperationType.EXPORT_DATABASE
                ] else TaskType.DB
                
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.duckdb_ipld_kit.execute,
                    sql, params,
                    task_type=task_type,
                    priority=priority
                )
            else:
                # Run directly
                result = await self.duckdb_ipld_kit.execute(sql, params)
            
            # Update statistics
            self.stats["queries"] += 1
            
            # Update schema cache if modifying schema
            if operation_type in [OperationType.INSERT, OperationType.UPDATE, OperationType.DELETE]:
                await self._cache_schema()
            
            return result
        except Exception as e:
            logger.error(f"Error executing SQL: {e}")
            self.stats["errors"] += 1
            raise
    
    async def query(self, sql, params=None, options=None):
        """
        Execute a query and return results
        
        Args:
            sql (str): SQL query to execute
            params (list): Query parameters
            options (dict): Execution options
            
        Returns:
            list: Query results
        """
        result = await self.execute(sql, params, options)
        if result.get("success", False) and "rows" in result:
            return result["rows"]
        return []
    
    async def export_table_to_ipld(self, table_name, options=None):
        """
        Export a table to IPLD with thread pool integration
        
        Args:
            table_name (str): Name of the table to export
            options (dict): Export options
            
        Returns:
            dict: IPLD export results
        """
        if not self.initialized:
            await self.init()
        
        self.stats["last_operation"] = {
            "type": "export_table_to_ipld",
            "table": table_name,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            if self.thread_pool and HAS_THREAD_POOL:
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.duckdb_ipld_kit.export_table_to_ipld,
                    table_name,
                    task_type=TaskType.IO,
                    priority=self.task_priorities.get(OperationType.EXPORT_IPLD)
                )
            else:
                # Run directly
                result = await self.duckdb_ipld_kit.export_table_to_ipld(table_name)
            
            # Update statistics
            self.stats["exports"] += 1
            
            # Notify sync manager if available
            if self.sync_manager and hasattr(self.sync_manager, "_handle_duckdb_change"):
                await self.sync_manager._handle_duckdb_change({
                    "type": "export_ipld",
                    "table": table_name,
                    "cid": result.get("cid"),
                    "timestamp": datetime.now().isoformat()
                })
            
            return result
        except Exception as e:
            logger.error(f"Error exporting table to IPLD: {e}")
            self.stats["errors"] += 1
            raise
    
    async def import_table_from_ipld(self, ipld_data, target_table_name=None, options=None):
        """
        Import a table from IPLD with thread pool integration
        
        Args:
            ipld_data (dict): IPLD data to import
            target_table_name (str): Target table name
            options (dict): Import options
            
        Returns:
            dict: Import results
        """
        if not self.initialized:
            await self.init()
        
        self.stats["last_operation"] = {
            "type": "import_table_from_ipld",
            "target_table": target_table_name,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            if self.thread_pool and HAS_THREAD_POOL:
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.duckdb_ipld_kit.import_table_from_ipld,
                    ipld_data, target_table_name,
                    task_type=TaskType.IO,
                    priority=self.task_priorities.get(OperationType.IMPORT_IPLD)
                )
            else:
                # Run directly
                result = await self.duckdb_ipld_kit.import_table_from_ipld(ipld_data, target_table_name)
            
            # Update statistics
            self.stats["imports"] += 1
            
            # Update schema cache
            await self._cache_schema()
            
            return result
        except Exception as e:
            logger.error(f"Error importing table from IPLD: {e}")
            self.stats["errors"] += 1
            raise
    
    async def export_table_to_parquet(self, table_name, output_path, options=None):
        """
        Export a table to Parquet with thread pool integration
        
        Args:
            table_name (str): Name of the table to export
            output_path (str): Output file path
            options (dict): Export options
            
        Returns:
            dict: Export results
        """
        if not self.initialized:
            await self.init()
        
        self.stats["last_operation"] = {
            "type": "export_table_to_parquet",
            "table": table_name,
            "output_path": output_path,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            if self.thread_pool and HAS_THREAD_POOL:
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.duckdb_ipld_kit.export_table_to_parquet,
                    table_name, output_path,
                    task_type=TaskType.IO,
                    priority=self.task_priorities.get(OperationType.EXPORT_PARQUET)
                )
            else:
                # Run directly
                result = await self.duckdb_ipld_kit.export_table_to_parquet(table_name, output_path)
            
            # Update statistics
            self.stats["exports"] += 1
            
            return result
        except Exception as e:
            logger.error(f"Error exporting table to Parquet: {e}")
            self.stats["errors"] += 1
            raise
    
    async def export_table_to_arrow(self, table_name, options=None):
        """
        Export a table to Arrow format with thread pool integration
        
        Args:
            table_name (str): Name of the table to export
            options (dict): Export options
            
        Returns:
            dict: Export results with Arrow buffer
        """
        if not self.initialized:
            await self.init()
        
        self.stats["last_operation"] = {
            "type": "export_table_to_arrow",
            "table": table_name,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            if self.thread_pool and HAS_THREAD_POOL:
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.duckdb_ipld_kit.export_table_to_arrow,
                    table_name,
                    task_type=TaskType.COMPUTE,  # Arrow conversions are more CPU-bound
                    priority=self.task_priorities.get(OperationType.EXPORT_ARROW)
                )
            else:
                # Run directly
                result = await self.duckdb_ipld_kit.export_table_to_arrow(table_name)
            
            # Update statistics
            self.stats["exports"] += 1
            
            return result
        except Exception as e:
            logger.error(f"Error exporting table to Arrow: {e}")
            self.stats["errors"] += 1
            raise
    
    async def export_database_to_ipld(self, options=None):
        """
        Export the entire database to IPLD with thread pool integration
        
        Args:
            options (dict): Export options
            
        Returns:
            dict: Export results with CIDs
        """
        if not self.initialized:
            await self.init()
        
        self.stats["last_operation"] = {
            "type": "export_database_to_ipld",
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            if self.thread_pool and HAS_THREAD_POOL:
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.duckdb_ipld_kit.export_database_to_ipld,
                    task_type=TaskType.IO,
                    priority=self.task_priorities.get(OperationType.EXPORT_DATABASE)
                )
            else:
                # Run directly
                result = await self.duckdb_ipld_kit.export_database_to_ipld()
            
            # Update statistics
            self.stats["exports"] += 1
            
            return result
        except Exception as e:
            logger.error(f"Error exporting database to IPLD: {e}")
            self.stats["errors"] += 1
            raise
    
    async def sync_with_document_dbs(self, options=None):
        """
        Synchronize data with document databases (OrbitDB and FireproofDB)
        
        Args:
            options (dict): Sync options including auth_token
            
        Returns:
            dict: Sync results
        """
        if not self.initialized:
            await self.init()
        
        if not self.sync_manager or not HAS_DATABASE_SYNC:
            return {
                "success": False,
                "error": "Database Sync Manager not available"
            }
        
        self.stats["last_operation"] = {
            "type": "sync_with_document_dbs",
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            options = options or {}
            auth_token = options.get("auth_token")
            
            # If no auth token provided, try to get a self-signed token
            if not auth_token and self.auth_manager:
                auth_token = self.auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ADMIN"])
            
            if not auth_token:
                return {
                    "success": False,
                    "error": "Authentication token required for sync operations"
                }
            
            if self.thread_pool and HAS_THREAD_POOL:
                # Run in thread pool
                result = await self._run_in_thread_pool(
                    self.sync_manager.sync_all,
                    auth_token=auth_token,
                    task_type=TaskType.IO,
                    priority=self.task_priorities.get(OperationType.SYNC)
                )
            else:
                # Run directly
                result = await self.sync_manager.sync_all(auth_token=auth_token)
            
            # Update statistics
            self.stats["sync_operations"] += 1
            
            return result
        except Exception as e:
            logger.error(f"Error synchronizing with document databases: {e}")
            self.stats["errors"] += 1
            raise
    
    def start_auto_sync(self, interval=None):
        """
        Start automatic synchronization with document databases
        
        Args:
            interval (int): Sync interval in milliseconds (default: from metadata)
            
        Returns:
            dict: Result
        """
        # Cancel existing timer if any
        if self.sync_timer:
            self.sync_timer.cancel()
            self.sync_timer = None
        
        # Use provided interval or default
        if interval is not None:
            self.sync_interval = interval
        
        if not self.sync_manager or not HAS_DATABASE_SYNC:
            return {
                "success": False,
                "error": "Database Sync Manager not available"
            }
        
        # Create sync timer
        def sync_task():
            try:
                # Get a self-signed token if auth manager available
                auth_token = None
                if self.auth_manager:
                    auth_token = self.auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ADMIN"])
                
                # Run sync in a non-blocking way using asyncio
                if self.loop:
                    asyncio.run_coroutine_threadsafe(
                        self.sync_with_document_dbs({"auth_token": auth_token}),
                        self.loop
                    )
            except Exception as e:
                logger.error(f"Auto sync error: {e}")
            finally:
                # Reschedule the task
                self.sync_timer = threading.Timer(self.sync_interval / 1000, sync_task)
                self.sync_timer.daemon = True
                self.sync_timer.start()
        
        # Start the timer
        self.sync_timer = threading.Timer(self.sync_interval / 1000, sync_task)
        self.sync_timer.daemon = True
        self.sync_timer.start()
        
        return {
            "success": True,
            "message": f"Auto sync started with interval {self.sync_interval}ms"
        }
    
    def stop_auto_sync(self):
        """
        Stop automatic synchronization
        
        Returns:
            dict: Result
        """
        if self.sync_timer:
            self.sync_timer.cancel()
            self.sync_timer = None
        
        return {
            "success": True,
            "message": "Auto sync stopped"
        }
    
    async def get_schema(self, table_name=None, refresh=False):
        """
        Get database or table schema
        
        Args:
            table_name (str): Optional table name to get specific schema
            refresh (bool): Whether to refresh the cache
            
        Returns:
            dict: Schema information
        """
        if not self.initialized:
            await self.init()
        
        if refresh or not self.schema_cache:
            await self._cache_schema()
        
        if table_name:
            return self.schema_cache.get(table_name, {})
        
        return self.schema_cache
    
    async def close(self):
        """
        Close the DuckDB-IPLD Manager and release resources
        
        Returns:
            bool: True if closed successfully
        """
        try:
            # Stop auto-sync if enabled
            if self.sync_timer:
                self.stop_auto_sync()
            
            # Close the DuckDB-IPLD kit
            if self.duckdb_ipld_kit:
                await self.duckdb_ipld_kit.close()
            
            # Clear resources
            self.initialized = False
            self.schema_cache = {}
            
            # Close event loop if owned by this instance
            if self.loop and not self.loop.is_closed():
                self.loop.close()
                self.loop = None
            
            return True
        except Exception as e:
            logger.error(f"Error closing DuckDB-IPLD Manager: {e}")
            return False
    
    def get_stats(self):
        """
        Get manager statistics
        
        Returns:
            dict: Statistics
        """
        stats = {
            **self.stats,
            "initialized": self.initialized,
            "thread_pool_available": bool(self.thread_pool and HAS_THREAD_POOL),
            "sync_manager_available": bool(self.sync_manager and HAS_DATABASE_SYNC),
            "auto_sync_enabled": bool(self.sync_timer),
            "tables": len(self.schema_cache)
        }
        
        # Include underlying kit stats if available
        if self.duckdb_ipld_kit and hasattr(self.duckdb_ipld_kit, "get_stats"):
            kit_stats = self.duckdb_ipld_kit.get_stats()
            stats["kit"] = kit_stats
        
        return stats
    
    async def test(self):
        """
        Run tests on the DuckDB-IPLD Manager
        
        Returns:
            dict: Test results
        """
        if not self.initialized:
            await self.init()
        
        test_results = {
            "success": True,
            "module": "duckdb_ipld_manager",
            "tests": {}
        }
        
        # Test SQL execution
        try:
            create_result = await self.execute("CREATE TABLE IF NOT EXISTS test_manager (id INTEGER, value VARCHAR)")
            insert_result = await self.execute("INSERT INTO test_manager VALUES (1, 'test_value')")
            select_result = await self.query("SELECT * FROM test_manager")
            
            test_results["tests"]["sql_execution"] = {
                "success": bool(create_result and insert_result and select_result),
                "row_count": len(select_result)
            }
        except Exception as e:
            test_results["tests"]["sql_execution"] = {
                "success": False,
                "error": str(e)
            }
            test_results["success"] = False
        
        # Test IPLD export
        try:
            ipld_result = await self.export_table_to_ipld("test_manager")
            
            test_results["tests"]["ipld_export"] = {
                "success": bool(ipld_result and ipld_result.get("success")),
                "cid": ipld_result.get("cid") if ipld_result else None
            }
        except Exception as e:
            test_results["tests"]["ipld_export"] = {
                "success": False,
                "error": str(e)
            }
            test_results["success"] = False
        
        # Test schema operations
        try:
            schema = await self.get_schema("test_manager", refresh=True)
            
            test_results["tests"]["schema"] = {
                "success": bool(schema),
                "fields": len(schema.get("fields", [])) if schema else 0
            }
        except Exception as e:
            test_results["tests"]["schema"] = {
                "success": False,
                "error": str(e)
            }
            test_results["success"] = False
        
        # Test sync if available
        if self.sync_manager and HAS_DATABASE_SYNC:
            try:
                # Get a self-signed token if auth manager available
                auth_token = None
                if self.auth_manager:
                    auth_token = self.auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ADMIN"])
                
                sync_result = await self.sync_with_document_dbs({"auth_token": auth_token})
                
                test_results["tests"]["sync"] = {
                    "success": bool(sync_result and sync_result.get("success")),
                    "details": sync_result if sync_result else None
                }
            except Exception as e:
                test_results["tests"]["sync"] = {
                    "success": False,
                    "error": str(e)
                }
                # Don't fail the overall test if just sync fails
        
        # Clean up test table
        await self.execute("DROP TABLE IF EXISTS test_manager")
        
        return test_results
    
    async def _run_in_thread_pool(self, func, *args, task_type=None, priority=None, **kwargs):
        """
        Run a function in the thread pool
        
        Args:
            func (callable): Function to run
            *args: Function arguments
            task_type (TaskType): Type of task
            priority (TaskPriority): Task priority
            **kwargs: Function keyword arguments
            
        Returns:
            Any: Function result
        """
        if not self.thread_pool or not HAS_THREAD_POOL:
            # If no thread pool, run directly
            return await func(*args, **kwargs)
        
        # Set defaults
        if task_type is None:
            task_type = TaskType.DB
        if priority is None:
            priority = TaskPriority.NORMAL
        
        # Create future for result
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        
        # Create task wrapper
        def task_wrapper():
            try:
                # Use an event loop for this thread to run async function
                task_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(task_loop)
                
                try:
                    # Run the async function
                    result = task_loop.run_until_complete(func(*args, **kwargs))
                    
                    # Set result in original event loop
                    loop.call_soon_threadsafe(future.set_result, result)
                finally:
                    task_loop.close()
            except Exception as e:
                # Set exception in original event loop
                loop.call_soon_threadsafe(future.set_exception, e)
        
        # Submit task to thread pool
        task_id, _ = self.thread_pool.submit_task(
            task_wrapper,
            task_type=task_type,
            priority=priority
        )
        
        # Wait for result
        return await future
    
    async def _cache_schema(self):
        """
        Cache database schema for faster access
        """
        try:
            # Get all tables
            tables = await self.query("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'main'
            """)
            
            if not tables:
                self.schema_cache = {}
                return
            
            # Get schema for each table
            for table_info in tables:
                table_name = table_info["table_name"]
                
                # Get columns for the table
                columns = await self.query(f"""
                    SELECT column_name, data_type, column_default
                    FROM information_schema.columns
                    WHERE table_name = '{table_name}'
                    ORDER BY ordinal_position
                """)
                
                # Store in cache
                self.schema_cache[table_name] = {
                    "name": table_name,
                    "fields": columns,
                    "last_updated": datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"Error caching schema: {e}")
    
    def _get_operation_type(self, sql):
        """
        Determine the operation type from SQL
        
        Args:
            sql (str): SQL query
            
        Returns:
            OperationType: Operation type
        """
        sql = sql.strip().upper()
        
        if sql.startswith("SELECT"):
            return OperationType.QUERY
        elif sql.startswith("INSERT"):
            return OperationType.INSERT
        elif sql.startswith("UPDATE"):
            return OperationType.UPDATE
        elif sql.startswith("DELETE"):
            return OperationType.DELETE
        else:
            return OperationType.QUERY  # Default


# Create a singleton instance
duckdb_ipld_manager = DuckDBIPLDManager()