"""
PyArrow Content Index Module

Provides a content index for the hallucinate_app using PyArrow
Enables efficient content discovery across multiple storage backends
Acts as a shared data structure between Python and JavaScript components
Implements the comprehensive metadata schema from CLAUDE.md
"""

import os
import json
import logging
import time
import tempfile
import hashlib
import re
import traceback
import sys
from datetime import datetime
from typing import Dict, List, Optional, Union, Any, Tuple, NamedTuple
from pathlib import Path
import uuid
import concurrent.futures

# Initialize optional dependencies - we'll handle ImportError gracefully
try:
    import pyarrow as pa
    import pyarrow.compute as pc
    from pyarrow import parquet
    from pyarrow import csv
    PYARROW_AVAILABLE = True
except ImportError:
    PYARROW_AVAILABLE = False
    # Create minimal mock PA for schema definition
    class MockPA:
        @staticmethod
        def string(): return "string"
        @staticmethod
        def int64(): return "int64"
        @staticmethod
        def binary(size): return f"binary({size})"
        @staticmethod
        def timestamp(unit): return f"timestamp({unit})"
        @staticmethod
        def list_(type_): return f"list({type_})"
        @staticmethod
        def struct(fields): return f"struct({fields})"
        @staticmethod
        def map_(key_type, value_type): return f"map({key_type}, {value_type})"
        @staticmethod
        def schema(fields): return fields
        
        class compute:
            @staticmethod
            def index_filter(mask): return []
    pa = MockPA()
    pc = pa.compute

# Custom error classes for better error handling
class ContentIndexError(Exception):
    """Base exception class for PyArrow Content Index errors"""
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

class ContentNotFoundError(ContentIndexError):
    """Raised when content with a given CID or path is not found"""
    pass

class SchemaValidationError(ContentIndexError):
    """Raised when input data fails schema validation"""
    pass

class StorageError(ContentIndexError):
    """Raised when there's an error saving or loading the index"""
    pass

class IPFSError(ContentIndexError):
    """Raised when there's an error communicating with IPFS"""
    pass

class QueryError(ContentIndexError):
    """Raised when there's an error executing a query"""
    pass

# Error tracking
class ErrorRecord(NamedTuple):
    timestamp: str
    operation: str
    error_type: str
    message: str
    details: dict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index")

# Define the metadata schema as specified in CLAUDE.md
metadata_schema = pa.schema([
    # Primary Key - Content-addressable identifier
    ('cid', pa.string()),                  # Content identifier (primary key)
    
    # Secondary Key - Virtual filesystem path
    ('path', pa.string()),                 # Virtual filesystem path (secondary key)
    
    # Content Metadata
    ('mimetype', pa.string()),             # Content MIME type
    ('size', pa.int64()),                  # Size in bytes
    ('md5', pa.binary(16)),                # MD5 hash
    ('sha256', pa.binary(32)),             # SHA-256 hash
    ('created_at', pa.timestamp('us')),    # Creation timestamp
    ('updated_at', pa.timestamp('us')),    # Last update timestamp
    
    # Storage Locations
    ('locations', pa.struct([
        # Decentralized Storage
        ('filecoin', pa.list_(pa.string())),  # Filecoin storage locations
        ('storacha', pa.string()),            # Storacha W3UP location
        ('libp2p', pa.list_(pa.string())),    # libp2p peer IDs storing content
        ('ipfs', pa.list_(pa.string())),      # IPFS gateway URLs
        ('ipfs_cluster', pa.list_(pa.string())), # IPFS cluster pins
        
        # Cloud Storage
        ('s3', pa.struct([                    # S3-compatible storage
            ('bucket', pa.string()),
            ('key', pa.string()),
            ('region', pa.string()),
            ('endpoint', pa.string())
        ])),
        
        # Model Repository Storage
        ('huggingface', pa.struct([           # Hugging Face Hub storage
            ('repo_id', pa.string()),
            ('path', pa.string()),
            ('revision', pa.string())
        ]))
    ])),
    
    # Extended Metadata
    ('tags', pa.list_(pa.string())),       # User-defined tags for categorization
    ('description', pa.string()),          # Human-readable description
    ('content_type', pa.string()),         # High-level content type (model, dataset, etc.)
    ('license', pa.string()),              # Content license information
    
    # Model-specific Metadata (when content_type is 'model')
    ('model_info', pa.struct([
        ('framework', pa.string()),        # Model framework (PyTorch, TensorFlow, etc.)
        ('task', pa.string()),             # Model task (text-generation, image-classification, etc.)
        ('architecture', pa.string()),     # Model architecture
        ('parameters', pa.int64()),        # Number of parameters
        ('quantization', pa.string()),     # Quantization format (if any)
        ('metrics', pa.map_(pa.string(), pa.float64())), # Performance metrics
        ('training_dataset', pa.string())  # Dataset used for training
    ])),
    
    # Dataset-specific Metadata (when content_type is 'dataset')
    ('dataset_info', pa.struct([
        ('format', pa.string()),           # Dataset format (CSV, Parquet, etc.)
        ('records', pa.int64()),           # Number of records/samples
        ('features', pa.list_(pa.string())), # List of features/columns
        ('splits', pa.map_(pa.string(), pa.int64())), # Dataset splits with sizes
        ('license', pa.string()),          # Dataset license
        ('source', pa.string())            # Original source of the dataset
    ]))
])

class PyArrowContentIndex:
    """
    PyArrow-based content index for hallucinate_app
    
    Provides a comprehensive index for content across multiple storage backends
    Acts as a bridge between JavaScript and Python components
    Implements the schema from CLAUDE.md with enhanced functionality
    Includes robust error handling for Electron app integration
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the PyArrow content index
        
        Args:
            resources (dict): Resources including ipfs_kit and filesystem provider
            metadata (dict): Configuration metadata
        """
        # Error handling and tracking
        self.error_history = []  # List of ErrorRecord objects
        self.max_error_history = 100  # Maximum number of errors to keep
        self.last_error = None  # Last error that occurred
        
        try:
            self.resources = resources or {}
            self.metadata = metadata or {}
            
            # Set up error reporting to Electron
            self.electron_bridge = self.resources.get('electron_bridge', None)
            self.enable_electron_error_reporting = self.metadata.get('enable_electron_error_reporting', True)
            
            # Error logging configuration
            self.error_log_path = self.metadata.get(
                'error_log_path',
                os.path.join(os.path.expanduser("~"), '.hallucinate_app', 'logs', 'content_index_errors.log')
            )
            os.makedirs(os.path.dirname(self.error_log_path), exist_ok=True)
            
            # Set up error monitor integration
            self.error_monitor = self.resources.get('error_monitor', None)
            self.enable_error_monitoring = self.metadata.get('enable_error_monitoring', True)
            
            # If error monitor not provided but enabled, try to import
            if self.enable_error_monitoring and not self.error_monitor:
                try:
                    from hallucinate_app.error_monitor import error_monitor
                    self.error_monitor = error_monitor
                except ImportError:
                    self._log_warning("Error monitor not available, continuing without advanced error tracking")
            
            # Get the index path from metadata or use default
            self.index_path = self.metadata.get(
                'index_path', 
                os.path.join(os.path.expanduser("~"), '.hallucinate_app', 'content_index.arrow')
            )
            
            # Get batch size for operations
            self.batch_size = self.metadata.get('batch_size', 100)
            
            # Get execution concurrency
            self.max_workers = self.metadata.get('max_workers', 4)
            
            # Get resources for content operations
            self.ipfs = self.resources.get('ipfs_kit', None)
            self.fs_provider = self.resources.get('fs_provider', None)
            self.database_sync = self.resources.get('database_sync_manager', None)
            
            # Initialize indexes for faster lookups
            self.cid_index = {}  # Maps CID to row index
            self.path_index = {}  # Maps path to row index
            
            # Track if we're using mock mode (no PyArrow)
            self.mock_mode = not PYARROW_AVAILABLE
            if self.mock_mode:
                self._log_warning("PyArrow not available, running in mock mode")
                
                # Create a simple in-memory store for mock mode
                self.mock_store = []
            else:
                # Initialize PyArrow table
                self.table = None
                
                # Initialize index accessor helpers for efficient lookups
                self.cid_accessor = None
                self.path_accessor = None
                
            # Create index directory if it doesn't exist
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            
            # Track initialization state
            self.initialized = False
            
            # Setup thread pool for batch operations
            self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers)
            
            # Set up error handling for thread exceptions
            self.executor.submit(lambda: None).result()  # Force executor initialization
            
            self._log_info(f"PyArrowContentIndex initialized with path={self.index_path}, mock_mode={self.mock_mode}, batch_size={self.batch_size}, max_workers={self.max_workers}")
        except Exception as e:
            self._handle_error("initialization", e, {"resources": str(resources), "metadata": str(metadata)})
    
    def _log_error(self, message, exc_info=False):
        """Log an error message with optional exception info"""
        logger.error(message, exc_info=exc_info)
        # Also write to error log file
        try:
            with open(self.error_log_path, 'a') as f:
                timestamp = datetime.now().isoformat()
                f.write(f"{timestamp} ERROR: {message}\n")
                if exc_info:
                    f.write(f"{traceback.format_exc()}\n")
        except Exception as e:
            # If we can't write to the error log, just log to console
            logger.error(f"Failed to write to error log: {e}")
    
    def _log_warning(self, message):
        """Log a warning message"""
        logger.warning(message)
        # Also write to error log file
        try:
            with open(self.error_log_path, 'a') as f:
                timestamp = datetime.now().isoformat()
                f.write(f"{timestamp} WARNING: {message}\n")
        except Exception as e:
            # If we can't write to the error log, just log to console
            logger.warning(f"Failed to write to error log: {e}")
    
    def _log_info(self, message):
        """Log an info message"""
        logger.info(message)
    
    def _handle_error(self, operation, error, details=None):
        """
        Centralized error handling method with comprehensive error monitor integration
        
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
            'id': f"err_{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}",
            'error': error_type,
            'message': error_msg,
            'operation': operation,
            'timestamp': datetime.now().isoformat(),
            'details': details,
            'stack_trace': stack_trace,
            'component': 'PyArrowContentIndex',
            'source': 'python'
        }
        
        # Add system information to details for better debugging
        sys_info = {
            'python_version': sys.version,
            'platform': sys.platform,
            'pyarrow_available': PYARROW_AVAILABLE,
            'mock_mode': self.mock_mode
        }
        error_info['system_info'] = sys_info
        
        # Log the error
        self._log_error(
            f"Error in {operation}: {error_type} - {error_msg}",
            exc_info=True
        )
        
        # Add to error history
        record = ErrorRecord(
            timestamp=error_info['timestamp'],
            operation=operation,
            error_type=error_type,
            message=error_msg,
            details=details
        )
        self.error_history.append(record)
        if len(self.error_history) > self.max_error_history:
            self.error_history.pop(0)  # Remove oldest error
        
        # Store as last error
        self.last_error = error_info
        
        # Report to Electron if enabled and bridge available
        if self.enable_electron_error_reporting and self.electron_bridge:
            try:
                self.electron_bridge.report_error(error_info)
            except Exception as e:
                self._log_error(f"Failed to report error to Electron: {e}")
        
        # Convert to content index error if needed
        if not isinstance(error, ContentIndexError):
            # Categorize error based on message content for better monitoring
            if "not found" in error_msg.lower() or "no such" in error_msg.lower():
                error = ContentNotFoundError(error_msg, details)
                error_info['category'] = 'not_found'
            elif "schema" in error_msg.lower() or "validation" in error_msg.lower() or "type" in error_msg.lower():
                error = SchemaValidationError(error_msg, details)
                error_info['category'] = 'validation'
            elif "save" in error_msg.lower() or "load" in error_msg.lower() or "file" in error_msg.lower():
                error = StorageError(error_msg, details)
                error_info['category'] = 'storage'
            elif "ipfs" in error_msg.lower():
                error = IPFSError(error_msg, details)
                error_info['category'] = 'ipfs'
            elif "query" in error_msg.lower():
                error = QueryError(error_msg, details)
                error_info['category'] = 'query'
            else:
                error = ContentIndexError(error_msg, details)
                error_info['category'] = 'general'
        else:
            # Get category from error class name
            error_info['category'] = error.__class__.__name__.replace('Error', '').lower()
        
        # Determine fatality of the error
        is_fatal = (
            'init' in operation.lower() or 
            operation == 'initialization' or
            details.get('fatal', False) or
            isinstance(error, (StorageError, IPFSError)) and 'fatal' in error_msg.lower()
        )
        error_info['fatal'] = is_fatal
        
        # Add tags for easier filtering and analysis
        tags = [
            error_info['category'],
            'pyarrow_content_index',
            operation.replace(' ', '_').lower()
        ]
        
        # Add additional context-specific tags
        if 'cid' in details:
            tags.append('cid_operation')
        if 'path' in details:
            tags.append('path_operation')
        if is_fatal:
            tags.append('fatal')
        
        error_info['tags'] = tags
        
        # Send to error monitor if available and enabled
        if self.enable_error_monitoring and self.error_monitor:
            try:
                # Import error monitor types
                from hallucinate_app.error_monitor import ErrorData, ErrorLevel, ErrorSource, RecoveryStrategy
                
                # Determine severity level based on error type
                if isinstance(error, ContentNotFoundError):
                    level = ErrorLevel.INFO  # Not found is informational
                elif isinstance(error, (SchemaValidationError, QueryError)):
                    level = ErrorLevel.WARNING  # Validation issues are warnings
                elif is_fatal:
                    level = ErrorLevel.FATAL  # Fatal errors
                else:
                    level = ErrorLevel.ERROR  # Default to ERROR level
                
                # Create error data for monitor with enhanced metadata
                error_data = ErrorData(
                    id=error_info['id'],
                    timestamp=error_info['timestamp'],
                    level=level,
                    source=ErrorSource.CONTENT_INDEX,
                    component="PyArrowContentIndex",
                    operation=operation,
                    message=f"{error_type}: {error_msg}",
                    details={
                        **details,
                        'system_info': sys_info,
                        'category': error_info['category'],
                        'tags': tags
                    },
                    stack_trace=stack_trace,
                    metadata={
                        'is_mock_mode': self.mock_mode,
                        'index_path': getattr(self, 'index_path', None),
                        'error_class': error.__class__.__name__
                    }
                )
                
                # Add recovery strategies based on error type
                recovery_strategies = []
                
                if isinstance(error, ContentNotFoundError):
                    # For content not found, suggest refreshing the index
                    recovery_strategies.append(RecoveryStrategy(
                        name="Sync IPFS Pinset",
                        description="Synchronize content index with IPFS pinset to update content references",
                        method_name="sync_with_ipfs_pinset",
                        is_automatic=False
                    ))
                
                elif isinstance(error, StorageError):
                    # For storage errors, suggest repair strategies
                    recovery_strategies.append(RecoveryStrategy(
                        name="Repair Index",
                        description="Repair content index by loading from backup or recreating missing structures",
                        method_name="_repair_index",
                        is_automatic=False
                    ))
                    
                    # For corruption, suggest creating from scratch
                    if "corrupt" in error_msg.lower():
                        recovery_strategies.append(RecoveryStrategy(
                            name="Recreate Index",
                            description="Create a new content index from scratch by scanning available content",
                            method_name="_recreate_index",
                            is_automatic=False
                        ))
                
                elif isinstance(error, SchemaValidationError):
                    # For schema validation, suggest migration
                    recovery_strategies.append(RecoveryStrategy(
                        name="Migrate Schema",
                        description="Migrate existing data to the current schema version",
                        method_name="_migrate_schema",
                        is_automatic=False
                    ))
                
                # Add recovery strategies to error data
                error_data.recovery_strategies = recovery_strategies
                
                # Use asyncio to add the error to the monitor
                # Determine if we're in an event loop
                import asyncio
                try:
                    loop = asyncio.get_running_loop()
                    if loop.is_running():
                        # We're in an event loop, create a task
                        asyncio.create_task(self.error_monitor.add_error(error_data))
                    else:
                        # No running loop, run until complete
                        asyncio.run(self.error_monitor.add_error(error_data))
                except RuntimeError:
                    # No running event loop, create a new one
                    asyncio.run(self.error_monitor.add_error(error_data))
                except Exception as e:
                    self._log_error(f"Failed to add error to monitor: {e}")
            except Exception as e:
                self._log_error(f"Failed to report error to error monitor: {e}")
        
        return error_info
    
    async def get_error_history(self):
        """
        Get the error history
        
        Returns:
            list: List of error records
        """
        return [record._asdict() for record in self.error_history]
    
    async def get_last_error(self):
        """
        Get the last error that occurred
        
        Returns:
            dict: Last error information or None if no errors have occurred
        """
        return self.last_error
    
    async def clear_error_history(self):
        """
        Clear the error history
        
        Returns:
            bool: Success status
        """
        self.error_history = []
        self.last_error = None
        return True
    
    async def init(self):
        """
        Initialize the content index
        
        Loads the content index from disk or creates a new one if it doesn't exist.
        Builds lookup indexes for faster access and registers with the database sync manager.
        
        Returns:
            bool: Success status
        """
        try:
            self._log_info("Initializing content index")
            
            if self.mock_mode:
                # Load mock data from JSON if available
                json_path = self.index_path.replace('.arrow', '.json')
                if os.path.exists(json_path):
                    try:
                        with open(json_path, 'r') as f:
                            self.mock_store = json.load(f)
                        self._log_info(f"Loaded {len(self.mock_store)} entries from mock store")
                        
                        # Build mock indexes for faster lookups
                        self._build_mock_indexes()
                    except Exception as e:
                        self._handle_error("load_mock_store", e, {"json_path": json_path})
                        self.mock_store = []
            else:
                # Load real PyArrow table
                await self._load_table()
                
                # Build lookup indexes for faster access
                self._build_indexes()
            
            self.initialized = True
            
            # Register with database sync manager if available
            if self.database_sync:
                try:
                    await self.database_sync.register_content_index(self)
                    self._log_info("Registered with database sync manager")
                except Exception as e:
                    error_info = self._handle_error("database_sync_registration", e)
                    # Report to Electron if enabled
                    if self.enable_electron_error_reporting and self.electron_bridge:
                        try:
                            self.electron_bridge.report_warning({
                                "message": "Database synchronization may be degraded",
                                "details": "Could not register content index with database sync manager",
                                "error_info": error_info
                            })
                        except Exception as e2:
                            self._log_error(f"Failed to report warning to Electron: {e2}")
            
            return True
        except Exception as e:
            error_info = self._handle_error("initialization", e)
            
            # Report fatal initialization error to Electron
            if self.enable_electron_error_reporting and self.electron_bridge:
                try:
                    self.electron_bridge.report_fatal_error({
                        "component": "PyArrow Content Index",
                        "message": "Failed to initialize content index",
                        "error_info": error_info
                    })
                except Exception as e2:
                    self._log_error(f"Failed to report fatal error to Electron: {e2}")
            
            return False
    
    def _build_mock_indexes(self):
        """Build indexes for mock store for faster lookups"""
        # Reset indexes
        self.cid_index = {}
        self.path_index = {}
        
        # Build indexes
        for i, entry in enumerate(self.mock_store):
            cid = entry.get('cid')
            path = entry.get('path')
            
            if cid:
                self.cid_index[cid] = i
            if path:
                self.path_index[path] = i
        
        logger.debug(f"Built mock indexes with {len(self.cid_index)} CIDs and {len(self.path_index)} paths")
    
    def _build_indexes(self):
        """Build in-memory indexes for faster lookups"""
        if self.mock_mode or self.table is None:
            return
        
        # Reset indexes
        self.cid_index = {}
        self.path_index = {}
        
        # Get column accessors for efficient access
        self.cid_accessor = self.table['cid']
        self.path_accessor = self.table['path']
        
        # Build indexes
        for i in range(len(self.table)):
            cid = self.cid_accessor[i].as_py()
            path = self.path_accessor[i].as_py()
            
            self.cid_index[cid] = i
            self.path_index[path] = i
        
        logger.debug(f"Built indexes with {len(self.cid_index)} CIDs and {len(self.path_index)} paths")
    
    async def _load_table(self):
        """Load the PyArrow table from disk or create a new one"""
        if self.mock_mode:
            return
            
        try:
            if os.path.exists(self.index_path):
                # Load table with memory-mapped access for large tables
                self.table = parquet.read_table(
                    self.index_path,
                    memory_map=True  # Memory-map the input file for better performance with large tables
                )
                logger.info(f"Loaded content index with {len(self.table)} entries")
            else:
                # Create an empty table with the full schema
                empty_table_dict = {
                    # Primary Key fields
                    'cid': [],
                    'path': [],
                    
                    # Content Metadata
                    'mimetype': [],
                    'size': [],
                    'md5': [],
                    'sha256': [],
                    'created_at': [],
                    'updated_at': [],
                    
                    # Storage Locations
                    'locations': [],
                    
                    # Extended Metadata
                    'tags': [],
                    'description': [],
                    'content_type': [],
                    'license': [],
                    
                    # Model-specific Metadata
                    'model_info': [],
                    
                    # Dataset-specific Metadata
                    'dataset_info': []
                }
                
                self.table = pa.Table.from_pydict(empty_table_dict, schema=metadata_schema)
                logger.info("Created new empty content index with full schema")
                
                # Save the empty table
                await self.save()
        except Exception as e:
            logger.error(f"Error loading PyArrow table: {e}")
            # Create empty table on error with full schema
            empty_table_dict = {
                # Primary Key fields
                'cid': [],
                'path': [],
                
                # Content Metadata
                'mimetype': [],
                'size': [],
                'md5': [],
                'sha256': [],
                'created_at': [],
                'updated_at': [],
                
                # Storage Locations
                'locations': [],
                
                # Extended Metadata
                'tags': [],
                'description': [],
                'content_type': [],
                'license': [],
                
                # Model-specific Metadata
                'model_info': [],
                
                # Dataset-specific Metadata
                'dataset_info': []
            }
            
            self.table = pa.Table.from_pydict(empty_table_dict, schema=metadata_schema)
    
    async def save(self):
        """Save the content index to disk with backup and versioning"""
        if not self.initialized:
            await self.init()
            
        try:
            # Create a backup of the current file if it exists
            if os.path.exists(self.index_path):
                backup_path = f"{self.index_path}.bak"
                try:
                    import shutil
                    shutil.copy2(self.index_path, backup_path)
                    logger.debug(f"Created backup at {backup_path}")
                except Exception as e:
                    logger.warning(f"Failed to create backup: {e}")
            
            if self.mock_mode:
                # Save mock data to JSON
                json_path = self.index_path.replace('.arrow', '.json')
                with open(json_path, 'w') as f:
                    json.dump(self.mock_store, f)
                logger.info(f"Saved {len(self.mock_store)} entries to mock store")
                
                # Rebuild mock indexes
                self._build_mock_indexes()
                return True
            else:
                # Save real PyArrow table with compression
                parquet.write_table(
                    self.table,
                    self.index_path,
                    compression='snappy',  # Use Snappy compression for good balance of speed and size
                    row_group_size=100000  # Optimize row groups for faster random access
                )
                logger.info(f"Saved content index with {len(self.table)} entries")
                
                # Create a timestamped copy if configured
                if self.metadata.get('enable_versioning', False):
                    version_dir = os.path.join(os.path.dirname(self.index_path), 'versions')
                    os.makedirs(version_dir, exist_ok=True)
                    
                    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                    version_path = os.path.join(version_dir, f"content_index_{timestamp}.parquet")
                    
                    parquet.write_table(self.table, version_path, compression='snappy')
                    logger.debug(f"Created versioned copy at {version_path}")
                
                # Rebuild indexes
                self._build_indexes()
                return True
        except Exception as e:
            logger.error(f"Failed to save content index: {e}")
            return False
    
    async def lookup_by_cid(self, cid):
        """
        Look up content by CID (primary key)
        
        Args:
            cid (str): The Content ID to look up
            
        Returns:
            dict: The content entry or None if not found
        """
        if not self.initialized:
            await self.init()
        
        try:
            if self.mock_mode:
                # Use index for faster lookup
                if cid in self.cid_index:
                    index = self.cid_index[cid]
                    return self.mock_store[index]
                return None
            else:
                # Use index for faster lookup if available
                if cid in self.cid_index:
                    index = self.cid_index[cid]
                    # Convert the row to a dictionary
                    row = self.table.slice(index, 1)
                    return self._convert_table_to_dict(row)
                
                # Fallback to PyArrow filtering
                mask = self.table['cid'] == cid
                result = self.table.filter(mask)
                
                if len(result) > 0:
                    return self._convert_table_to_dict(result)
                return None
        except Exception as e:
            logger.error(f"Error looking up CID {cid}: {e}")
            logger.error(traceback.format_exc())
            return None
    
    def _convert_table_to_dict(self, table):
        """
        Convert a PyArrow table or slice to a Python dictionary
        with proper handling of complex types
        
        Args:
            table: PyArrow Table or TableSlice
            
        Returns:
            dict: Python dictionary representation
        """
        if self.mock_mode or table is None:
            return None
            
        # Convert to dictionary of arrays
        py_dict = table.to_pydict()
        
        # If the table has only one row, convert arrays to values
        if len(table) == 1:
            result = {}
            for key, value in py_dict.items():
                if isinstance(value, list) and len(value) == 1:
                    result[key] = value[0]
                else:
                    result[key] = value
            return result
            
        # Return the dictionary of arrays for multiple rows
        return py_dict
    
    async def lookup_by_path(self, path):
        """
        Look up content by virtual filesystem path (secondary key)
        
        Args:
            path (str): The virtual filesystem path
            
        Returns:
            dict: The content entry or None if not found
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Normalize path for consistent lookups
            normalized_path = self._normalize_path(path)
            
            if self.mock_mode:
                # Use index for faster lookup
                if normalized_path in self.path_index:
                    index = self.path_index[normalized_path]
                    return self.mock_store[index]
                    
                # Try prefix matching if exact match not found
                for entry_path, index in self.path_index.items():
                    if entry_path.startswith(normalized_path):
                        return self.mock_store[index]
                        
                return None
            else:
                # Use index for faster lookup if available
                if normalized_path in self.path_index:
                    index = self.path_index[normalized_path]
                    # Convert the row to a dictionary
                    row = self.table.slice(index, 1)
                    return self._convert_table_to_dict(row)
                
                # Try prefix matching with PyArrow compute
                path_match = pc.starts_with(self.table['path'], normalized_path)
                result = self.table.filter(path_match)
                
                if len(result) > 0:
                    return self._convert_table_to_dict(result.slice(0, 1))
                
                return None
        except Exception as e:
            logger.error(f"Error looking up path {path}: {e}")
            logger.error(traceback.format_exc())
            raise
            
    def _normalize_path(self, path):
        """Normalize filesystem path for consistent lookups"""
        # Remove trailing slash except for root
        if path != '/' and path.endswith('/'):
            path = path[:-1]
        
        # Ensure path starts with /
        if not path.startswith('/'):
            path = '/' + path
            
        return path
    
    async def query(self, query_params):
        """
        Query content by metadata attributes with advanced filtering
        
        Args:
            query_params (dict): Query parameters including:
                - filter (str): SQL-like filter expression
                - sort (str): Sort expression with field and direction
                - limit (int): Maximum results to return
                - offset (int): Offset for pagination
                - fields (list): Specific fields to return
                - content_type (str): Filter by content type (model, dataset, etc.)
                - tag (str): Filter by tag
                - mimetype (str): Filter by mimetype
                - size_min/size_max (int): Filter by size range
                - storage (str): Filter by storage backend
                
        Returns:
            list: Matching content entries
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Extract query parameters
            filter_expr = query_params.get('filter', '')
            sort_expr = query_params.get('sort', '')
            limit = query_params.get('limit', 100)
            offset = query_params.get('offset', 0)
            fields = query_params.get('fields', None)  # Specific fields to return
            
            # Specific filters that can be combined
            content_type = query_params.get('content_type', None)
            tag = query_params.get('tag', None)
            mimetype = query_params.get('mimetype', None)
            size_min = query_params.get('size_min', None)
            size_max = query_params.get('size_max', None)
            storage = query_params.get('storage', None)
            
            if self.mock_mode:
                # Basic filtering in mock mode
                results = self.mock_store
                
                # Apply specific filters
                if content_type:
                    results = [e for e in results if e.get('content_type') == content_type]
                
                if tag and isinstance(tag, str):
                    results = [e for e in results if tag in e.get('tags', [])]
                
                if mimetype:
                    if mimetype.endswith('%'):
                        prefix = mimetype[:-1]
                        results = [e for e in results if e.get('mimetype', '').startswith(prefix)]
                    else:
                        results = [e for e in results if e.get('mimetype') == mimetype]
                
                if size_min is not None:
                    results = [e for e in results if e.get('size', 0) >= size_min]
                
                if size_max is not None:
                    results = [e for e in results if e.get('size', 0) <= size_max]
                
                if storage:
                    results = [e for e in results if 
                             (storage == 'ipfs' and e.get('locations', {}).get('ipfs')) or
                             (storage == 'filecoin' and e.get('locations', {}).get('filecoin')) or
                             (storage == 's3' and e.get('locations', {}).get('s3', {}).get('bucket')) or
                             (storage == 'huggingface' and e.get('locations', {}).get('huggingface', {}).get('repo_id'))]
                
                # Apply general filter expression
                if filter_expr:
                    if 'mimetype LIKE' in filter_expr:
                        mime_prefix = filter_expr.split("'")[1].replace('%', '')
                        results = [e for e in results if e.get('mimetype', '').startswith(mime_prefix)]
                    elif 'size >' in filter_expr:
                        size_value = int(filter_expr.split('>')[1].strip())
                        results = [e for e in results if e.get('size', 0) > size_value]
                    elif 'size <' in filter_expr:
                        size_value = int(filter_expr.split('<')[1].strip())
                        results = [e for e in results if e.get('size', 0) < size_value]
                
                # Apply basic sorting
                if sort_expr:
                    reverse = 'DESC' in sort_expr.upper()
                    if 'size' in sort_expr:
                        results = sorted(results, key=lambda e: e.get('size', 0), reverse=reverse)
                    elif 'created_at' in sort_expr:
                        results = sorted(results, key=lambda e: e.get('created_at', ''), reverse=reverse)
                    elif 'updated_at' in sort_expr:
                        results = sorted(results, key=lambda e: e.get('updated_at', ''), reverse=reverse)
                
                # Apply pagination
                if offset > 0:
                    results = results[offset:]
                    
                if limit > 0:
                    results = results[:limit]
                
                # Apply field selection if specified
                if fields and isinstance(fields, list):
                    filtered_results = []
                    for entry in results:
                        filtered_entry = {k: v for k, v in entry.items() if k in fields}
                        filtered_results.append(filtered_entry)
                    return filtered_results
                
                return results
            else:
                # In real mode, use PyArrow compute functions for filtering
                result = self.table
                filter_conditions = []
                
                # Apply specific filters
                if content_type:
                    filter_conditions.append(self.table['content_type'] == content_type)
                
                if tag and isinstance(tag, str):
                    # This is simplified; properly handling list containment would require custom logic
                    tag_contains = pc.match_substring(pc.cast(self.table['tags'], pa.string()), tag)
                    filter_conditions.append(tag_contains)
                
                if mimetype:
                    if mimetype.endswith('%'):
                        prefix = mimetype[:-1]
                        filter_conditions.append(pc.starts_with(self.table['mimetype'], prefix))
                    else:
                        filter_conditions.append(self.table['mimetype'] == mimetype)
                
                if size_min is not None:
                    filter_conditions.append(self.table['size'] >= size_min)
                
                if size_max is not None:
                    filter_conditions.append(self.table['size'] <= size_max)
                
                # Apply all filter conditions
                for condition in filter_conditions:
                    result = result.filter(condition)
                
                # Apply general filter expression (would require more complex parsing in a real system)
                if filter_expr:
                    if 'mimetype LIKE' in filter_expr:
                        mime_prefix = filter_expr.split("'")[1].replace('%', '')
                        mime_filter = pc.starts_with(result['mimetype'], mime_prefix)
                        result = result.filter(mime_filter)
                    elif 'size >' in filter_expr:
                        size_value = int(filter_expr.split('>')[1].strip())
                        size_filter = result['size'] > size_value
                        result = result.filter(size_filter)
                    elif 'size <' in filter_expr:
                        size_value = int(filter_expr.split('<')[1].strip())
                        size_filter = result['size'] < size_value
                        result = result.filter(size_filter)
                
                # Sort the results
                if sort_expr:
                    field = sort_expr.split()[0]
                    if field in result.column_names:
                        # Sort the table if the field exists
                        sort_options = pa.compute.SortOptions(descending='DESC' in sort_expr.upper())
                        indices = pa.compute.sort_indices(result[field], options=sort_options)
                        result = result.take(indices)
                
                # Apply pagination
                if offset > 0:
                    result = result.slice(offset)
                    
                if limit > 0 and limit < len(result):
                    result = result.slice(0, limit)
                
                # Apply field selection if specified
                if fields and isinstance(fields, list):
                    # Filter columns based on the fields list
                    # Only keep columns that are in the fields list
                    field_indices = [i for i, field in enumerate(result.column_names) if field in fields]
                    if field_indices:
                        result = result.select(field_indices)
                
                return self._convert_table_to_dict(result)
        except Exception as e:
            logger.error(f"Error querying content: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []
    
    async def add_entry(self, entry):
        """
        Add a new content entry to the index
        
        Args:
            entry (dict): Content entry with cid, path, and metadata
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            cid = entry.get('cid')
            path = entry.get('path')
            
            if not cid:
                logger.error("Cannot add entry without CID")
                return False
            
            # Check if entry already exists
            existing = await self.lookup_by_cid(cid)
            if existing:
                # Update existing entry
                return await self.update_entry(cid, entry)
            
            # Normalize path
            normalized_path = self._normalize_path(path or f"/content/{cid}")
            
            # Prepare timestamps
            now = datetime.now()
            if self.mock_mode:
                timestamp = now.isoformat()
            else:
                timestamp = now
            
            # Extract metadata
            metadata = entry.get('metadata', {})
            
            # Handle hashes (convert to binary for PyArrow)
            md5_hash = metadata.get('md5')
            if md5_hash and isinstance(md5_hash, str) and not self.mock_mode:
                try:
                    md5_hash = bytes.fromhex(md5_hash)
                except ValueError:
                    md5_hash = b'0' * 16
            elif not md5_hash:
                md5_hash = b'0' * 16 if not self.mock_mode else '0' * 32
                
            sha256_hash = metadata.get('sha256')
            if sha256_hash and isinstance(sha256_hash, str) and not self.mock_mode:
                try:
                    sha256_hash = bytes.fromhex(sha256_hash)
                except ValueError:
                    sha256_hash = b'0' * 32
            elif not sha256_hash:
                sha256_hash = b'0' * 32 if not self.mock_mode else '0' * 64
            
            # Prepare locations with defaults
            locations = metadata.get('locations', {})
            default_locations = {
                'filecoin': [],
                'storacha': '',
                'libp2p': [],
                'ipfs': [],
                'ipfs_cluster': [],
                's3': {
                    'bucket': '',
                    'key': '',
                    'region': '',
                    'endpoint': ''
                },
                'huggingface': {
                    'repo_id': '',
                    'path': '',
                    'revision': ''
                }
            }
            
            # Merge provided locations with defaults
            for key, value in default_locations.items():
                if key not in locations:
                    locations[key] = value
                elif isinstance(value, dict) and isinstance(locations[key], dict):
                    for sub_key, sub_value in value.items():
                        if sub_key not in locations[key]:
                            locations[key][sub_key] = sub_value
            
            # Support content-type specific metadata
            content_type = metadata.get('content_type', '')
            model_info = metadata.get('model_info', {})
            dataset_info = metadata.get('dataset_info', {})
            
            # Prepare a complete entry with all fields from the schema
            complete_entry = {
                # Primary Key fields
                'cid': cid,
                'path': normalized_path,
                
                # Content Metadata
                'mimetype': metadata.get('mimetype', 'application/octet-stream'),
                'size': metadata.get('size', 0),
                'md5': md5_hash,
                'sha256': sha256_hash,
                'created_at': timestamp,
                'updated_at': timestamp,
                
                # Storage Locations
                'locations': locations,
                
                # Extended Metadata
                'tags': metadata.get('tags', []),
                'description': metadata.get('description', ''),
                'content_type': content_type,
                'license': metadata.get('license', ''),
                
                # Model-specific Metadata
                'model_info': model_info if content_type == 'model' else {
                    'framework': '',
                    'task': '',
                    'architecture': '',
                    'parameters': 0,
                    'quantization': '',
                    'metrics': {},
                    'training_dataset': ''
                },
                
                # Dataset-specific Metadata
                'dataset_info': dataset_info if content_type == 'dataset' else {
                    'format': '',
                    'records': 0,
                    'features': [],
                    'splits': {},
                    'license': '',
                    'source': ''
                }
            }
            
            if self.mock_mode:
                # Add to mock store
                self.mock_store.append(complete_entry)
                
                # Update indexes
                index = len(self.mock_store) - 1
                self.cid_index[cid] = index
                self.path_index[normalized_path] = index
            else:
                # Add to PyArrow table
                new_entry = pa.Table.from_pydict({
                    # Primary Key fields
                    'cid': [complete_entry['cid']],
                    'path': [complete_entry['path']],
                    
                    # Content Metadata
                    'mimetype': [complete_entry['mimetype']],
                    'size': [complete_entry['size']],
                    'md5': [complete_entry['md5']],
                    'sha256': [complete_entry['sha256']],
                    'created_at': [complete_entry['created_at']],
                    'updated_at': [complete_entry['updated_at']],
                    
                    # Storage Locations
                    'locations': [complete_entry['locations']],
                    
                    # Extended Metadata
                    'tags': [complete_entry['tags']],
                    'description': [complete_entry['description']],
                    'content_type': [complete_entry['content_type']],
                    'license': [complete_entry['license']],
                    
                    # Model-specific Metadata
                    'model_info': [complete_entry['model_info']],
                    
                    # Dataset-specific Metadata
                    'dataset_info': [complete_entry['dataset_info']]
                }, schema=metadata_schema)
                
                # Concatenate tables
                self.table = pa.concat_tables([self.table, new_entry])
                
                # Update indexes
                index = len(self.table) - 1
                self.cid_index[cid] = index
                self.path_index[normalized_path] = index
            
            # Save changes
            await self.save()
            
            # Notify about new content
            if self.database_sync:
                try:
                    await self.database_sync.notify_content_added(cid, complete_entry)
                except Exception as e:
                    logger.warning(f"Failed to notify database sync manager: {e}")
            
            return True
        except Exception as e:
            logger.error(f"Error adding entry: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    async def update_entry(self, cid, updates):
        """
        Update an existing content entry
        
        Args:
            cid (str): The Content ID to update
            updates (dict): New values for the entry
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            existing = await self.lookup_by_cid(cid)
            if not existing:
                logger.error(f"Entry with CID {cid} not found for update")
                return False
            
            # Prepare timestamp
            now = datetime.now()
            if self.mock_mode:
                timestamp = now.isoformat()
            else:
                timestamp = now

            # Handle updated path if provided (normalize it)
            if 'path' in updates:
                updates['path'] = self._normalize_path(updates['path'])

            # Handle hash conversions for PyArrow
            if not self.mock_mode:
                if 'md5' in updates and isinstance(updates['md5'], str):
                    try:
                        updates['md5'] = bytes.fromhex(updates['md5'])
                    except ValueError:
                        updates['md5'] = b'0' * 16
                
                if 'sha256' in updates and isinstance(updates['sha256'], str):
                    try:
                        updates['sha256'] = bytes.fromhex(updates['sha256'])
                    except ValueError:
                        updates['sha256'] = b'0' * 32
                
            if self.mock_mode:
                # Update in mock store using index for faster lookup
                if cid in self.cid_index:
                    i = self.cid_index[cid]
                    entry = self.mock_store[i]
                    
                    # Get old path for index update
                    old_path = entry.get('path', '')
                    
                    # Update fields
                    for key, value in updates.items():
                        if key not in ['cid', 'created_at']:  # Don't update these
                            entry[key] = value
                    
                    # Always update the updated_at timestamp
                    entry['updated_at'] = timestamp
                    
                    # Replace in store
                    self.mock_store[i] = entry
                    
                    # Update path index if path changed
                    if 'path' in updates and old_path != updates['path']:
                        if old_path in self.path_index:
                            del self.path_index[old_path]
                        self.path_index[updates['path']] = i
                else:
                    # Fallback to linear search if index fails
                    for i, entry in enumerate(self.mock_store):
                        if entry.get('cid') == cid:
                            # Get old path for index update
                            old_path = entry.get('path', '')
                            
                            # Update fields
                            for key, value in updates.items():
                                if key not in ['cid', 'created_at']:  # Don't update these
                                    entry[key] = value
                            
                            # Always update the updated_at timestamp
                            entry['updated_at'] = timestamp
                            
                            # Replace in store
                            self.mock_store[i] = entry
                            
                            # Update indexes
                            self.cid_index[cid] = i
                            if 'path' in updates:
                                if old_path in self.path_index:
                                    del self.path_index[old_path]
                                self.path_index[updates['path']] = i
                            break
            else:
                # Update in PyArrow table using our index for faster lookup
                if cid in self.cid_index:
                    index = self.cid_index[cid]
                    
                    # Get the row to update (convert to dictionary for easier manipulation)
                    row_slice = self.table.slice(index, 1)
                    row_dict = row_slice.to_pydict()
                    
                    # Get old path for index update
                    old_path = row_dict['path'][0] if 'path' in row_dict and row_dict['path'] else ''
                    
                    # Apply updates
                    for key, value in updates.items():
                        if key not in ['cid', 'created_at'] and key in row_dict:  # Don't update these
                            row_dict[key] = [value]
                    
                    # Update timestamp
                    row_dict['updated_at'] = [timestamp]
                    
                    # Create updated row as table
                    updated_row = pa.Table.from_pydict(row_dict, schema=metadata_schema)
                    
                    # Create a new table without the row
                    non_index_ranges = []
                    if index > 0:
                        non_index_ranges.append((0, index))
                    if index < len(self.table) - 1:
                        non_index_ranges.append((index + 1, len(self.table) - index - 1))
                    
                    if non_index_ranges:
                        pieces = [self.table.slice(start, length) for start, length in non_index_ranges]
                        pieces.append(updated_row)
                        self.table = pa.concat_tables(pieces)
                    else:
                        # Only one row in the table
                        self.table = updated_row
                    
                    # Update path index if path changed
                    if 'path' in updates and old_path != updates['path']:
                        if old_path in self.path_index:
                            del self.path_index[old_path]
                        # New index might have changed after concat
                        for i, row_cid in enumerate(self.table['cid'].to_pylist()):
                            if row_cid == cid:
                                self.path_index[updates['path']] = i
                                self.cid_index[cid] = i
                                break
                else:
                    # Fallback to mask-based approach
                    mask = self.table['cid'] == cid
                    indices = pc.index_filter(mask)
                    
                    if len(indices) == 0:
                        return False
                    
                    # Create a new table without the row
                    exclude_mask = ~mask
                    filtered_table = self.table.filter(exclude_mask)
                    
                    # Get the row to update
                    row_to_update = self.table.filter(mask).to_pydict()
                    
                    # Get old path for index update
                    old_path = row_to_update['path'][0] if 'path' in row_to_update and row_to_update['path'] else ''
                    
                    # Apply updates
                    for key, value in updates.items():
                        if key not in ['cid', 'created_at'] and key in row_to_update:  # Don't update these
                            row_to_update[key] = [value]
                    
                    # Update timestamp
                    row_to_update['updated_at'] = [timestamp]
                    
                    # Create updated row as table
                    updated_row = pa.Table.from_pydict(row_to_update, schema=metadata_schema)
                    
                    # Concatenate filtered table with updated row
                    self.table = pa.concat_tables([filtered_table, updated_row])
                    
                    # Rebuild indexes after significant change
                    self._build_indexes()
            
            # Save changes
            await self.save()
            
            # Notify about updated content
            if self.database_sync:
                try:
                    # Get the updated entry
                    updated_entry = await self.lookup_by_cid(cid)
                    await self.database_sync.notify_content_updated(cid, updated_entry)
                except Exception as e:
                    logger.warning(f"Failed to notify database sync manager: {e}")
            
            return True
        except Exception as e:
            logger.error(f"Error updating entry: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    async def delete_entry(self, cid):
        """
        Delete a content entry by CID
        
        Args:
            cid (str): The Content ID to delete
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            if self.mock_mode:
                # Remove from mock store
                for i, entry in enumerate(self.mock_store):
                    if entry.get('cid') == cid:
                        self.mock_store.pop(i)
                        await self.save()
                        return True
                return False
            else:
                # Filter out the row to delete
                mask = self.table['cid'] != cid
                self.table = self.table.filter(mask)
                await self.save()
                return True
        except Exception as e:
            logger.error(f"Error deleting entry: {e}")
            return False
    
    async def update_metadata(self, cid, metadata_updates):
        """
        Update metadata for a content entry
        
        Args:
            cid (str): The Content ID
            metadata_updates (dict): Metadata fields to update including:
                - Basic metadata: mimetype, size, md5, sha256
                - Extended metadata: tags, description, license
                - Storage locations: locations.ipfs, locations.huggingface, etc.
                - Content-specific metadata: model_info, dataset_info
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            existing = await self.lookup_by_cid(cid)
            if not existing:
                logger.error(f"Entry with CID {cid} not found for metadata update")
                return False
            
            # Prepare updates dictionary
            updates = {
                'updated_at': datetime.now() if not self.mock_mode else datetime.now().isoformat()
            }
            
            # Process basic metadata fields
            basic_fields = ['mimetype', 'size', 'md5', 'sha256']
            for field in basic_fields:
                if field in metadata_updates:
                    updates[field] = metadata_updates[field]
            
            # Process extended metadata fields
            extended_fields = ['tags', 'description', 'license', 'content_type']
            for field in extended_fields:
                if field in metadata_updates:
                    updates[field] = metadata_updates[field]
            
            # Handle special case for tags (append rather than replace)
            if 'tags' in metadata_updates and isinstance(metadata_updates['tags'], list):
                if self.mock_mode:
                    # For mock mode
                    existing_tags = []
                    for i, entry in enumerate(self.mock_store):
                        if entry.get('cid') == cid:
                            existing_tags = entry.get('tags', [])
                            break
                else:
                    # For PyArrow, get existing tags
                    if isinstance(existing, dict) and 'tags' in existing:
                        existing_tags = existing['tags'] if isinstance(existing['tags'], list) else []
                    else:
                        existing_tags = []
                
                # Combine tags and remove duplicates while preserving order
                seen = set()
                combined_tags = []
                for tag in existing_tags + metadata_updates['tags']:
                    if tag not in seen:
                        seen.add(tag)
                        combined_tags.append(tag)
                
                updates['tags'] = combined_tags
            
            # Handle location updates
            if 'locations' in metadata_updates and isinstance(metadata_updates['locations'], dict):
                if self.mock_mode:
                    # For mock mode
                    existing_locations = {}
                    for i, entry in enumerate(self.mock_store):
                        if entry.get('cid') == cid:
                            existing_locations = entry.get('locations', {})
                            break
                else:
                    # For PyArrow, get existing locations
                    if isinstance(existing, dict) and 'locations' in existing:
                        existing_locations = existing['locations'] if isinstance(existing['locations'], dict) else {}
                    else:
                        existing_locations = {}
                
                # Deep merge existing and new locations
                merged_locations = self._deep_merge_dict(existing_locations, metadata_updates['locations'])
                updates['locations'] = merged_locations
            
            # Handle model_info updates if content_type is 'model'
            if 'model_info' in metadata_updates and isinstance(metadata_updates['model_info'], dict):
                content_type = ''
                if self.mock_mode:
                    # Get content_type from mock store
                    for entry in self.mock_store:
                        if entry.get('cid') == cid:
                            content_type = entry.get('content_type', '')
                            break
                else:
                    # Get content_type from PyArrow
                    if isinstance(existing, dict):
                        content_type = existing.get('content_type', '')
                
                # Only update model_info if content_type is 'model' or if we're setting content_type to 'model'
                if content_type == 'model' or metadata_updates.get('content_type') == 'model':
                    if self.mock_mode:
                        # For mock mode
                        existing_model_info = {}
                        for i, entry in enumerate(self.mock_store):
                            if entry.get('cid') == cid:
                                existing_model_info = entry.get('model_info', {})
                                break
                    else:
                        # For PyArrow, get existing model_info
                        if isinstance(existing, dict) and 'model_info' in existing:
                            existing_model_info = existing['model_info'] if isinstance(existing['model_info'], dict) else {}
                        else:
                            existing_model_info = {}
                    
                    # Merge model_info
                    merged_model_info = self._deep_merge_dict(existing_model_info, metadata_updates['model_info'])
                    updates['model_info'] = merged_model_info
                    
                    # If updating model_info, make sure content_type is set to 'model'
                    if 'content_type' not in updates:
                        updates['content_type'] = 'model'
            
            # Handle dataset_info updates if content_type is 'dataset'
            if 'dataset_info' in metadata_updates and isinstance(metadata_updates['dataset_info'], dict):
                content_type = ''
                if self.mock_mode:
                    # Get content_type from mock store
                    for entry in self.mock_store:
                        if entry.get('cid') == cid:
                            content_type = entry.get('content_type', '')
                            break
                else:
                    # Get content_type from PyArrow
                    if isinstance(existing, dict):
                        content_type = existing.get('content_type', '')
                
                # Only update dataset_info if content_type is 'dataset' or if we're setting content_type to 'dataset'
                if content_type == 'dataset' or metadata_updates.get('content_type') == 'dataset':
                    if self.mock_mode:
                        # For mock mode
                        existing_dataset_info = {}
                        for i, entry in enumerate(self.mock_store):
                            if entry.get('cid') == cid:
                                existing_dataset_info = entry.get('dataset_info', {})
                                break
                    else:
                        # For PyArrow, get existing dataset_info
                        if isinstance(existing, dict) and 'dataset_info' in existing:
                            existing_dataset_info = existing['dataset_info'] if isinstance(existing['dataset_info'], dict) else {}
                        else:
                            existing_dataset_info = {}
                    
                    # Merge dataset_info
                    merged_dataset_info = self._deep_merge_dict(existing_dataset_info, metadata_updates['dataset_info'])
                    updates['dataset_info'] = merged_dataset_info
                    
                    # If updating dataset_info, make sure content_type is set to 'dataset'
                    if 'content_type' not in updates:
                        updates['content_type'] = 'dataset'
            
            # Apply the updates
            return await self.update_entry(cid, updates)
        except Exception as e:
            logger.error(f"Error updating metadata: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def _deep_merge_dict(self, dict1, dict2):
        """
        Deep merge two dictionaries with dict2 taking precedence
        
        Args:
            dict1 (dict): Base dictionary
            dict2 (dict): Dictionary with values to merge (takes precedence)
            
        Returns:
            dict: Merged dictionary
        """
        result = dict1.copy()
        
        for key, value in dict2.items():
            # If value is a dict, recursively merge
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge_dict(result[key], value)
            # If value is a list and existing value is a list, combine them
            elif key in result and isinstance(result[key], list) and isinstance(value, list):
                # Combine lists and remove duplicates while preserving order
                seen = set()
                combined = []
                for item in result[key] + value:
                    if item not in seen:
                        seen.add(item)
                        combined.append(item)
                result[key] = combined
            # Otherwise just overwrite
            else:
                result[key] = value
                
        return result
    
    async def register_storage_location(self, cid, storage_type, location_data):
        """
        Register a new storage location for content
        
        Args:
            cid (str): The Content ID
            storage_type (str): Type of storage (filecoin, ipfs, etc.)
            location_data (dict/str): Storage location information
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            existing = await self.lookup_by_cid(cid)
            if not existing:
                logger.error(f"Entry with CID {cid} not found for location update")
                return False
            
            # Prepare locations update
            locations_update = {
                storage_type: location_data
            }
            
            # Use metadata update method to update locations
            return await self.update_metadata(cid, {'locations': locations_update})
        except Exception as e:
            logger.error(f"Error registering storage location: {e}")
            return False
    
    async def sync_with_ipfs_pinset(self):
        """
        Synchronize the content index with IPFS pinset
        
        Uses the IPFS client to list all pins and ensures they are in the index.
        Efficiently processes pins in batches for better performance.
        
        Returns:
            dict: Sync results with counts of added/updated entries
        """
        if not self.initialized:
            await self.init()
        
        if not self.ipfs:
            logger.error("Cannot sync with IPFS: ipfs_kit not available")
            return {
                'success': False,
                'error': 'ipfs_kit not available',
                'added': 0,
                'updated': 0
            }
        
        try:
            added = 0
            updated = 0
            skipped = 0
            errors = 0
            batches = 0
            start_time = time.time()
            
            # If mock_mode or testing without real IPFS, use mock pins
            if self.mock_mode or self.metadata.get('use_mock_pins', False):
                # Generate some mock pins for testing
                mock_pins = [
                    {
                        'cid': f'bafybei{uuid.uuid4().hex[:32]}',
                        'size': 1024 * (1 + int(time.time() % 10)),
                        'name': f'pin_{i}'
                    } for i in range(5)
                ]
                
                # Process each mock pin
                for pin in mock_pins:
                    cid = pin['cid']
                    
                    # Check if it exists
                    existing = await self.lookup_by_cid(cid)
                    
                    if not existing:
                        # Add new entry
                        entry = {
                            'cid': cid,
                            'path': f'/ipfs/{cid}',
                            'metadata': {
                                'size': pin['size'],
                                'mimetype': 'application/octet-stream',
                                'content_type': 'file',
                                'description': f'Mock pin {pin["name"]}',
                                'tags': ['mock', 'ipfs', 'test'],
                                'locations': {
                                    'ipfs': ['https://ipfs.io/ipfs/' + cid]
                                }
                            }
                        }
                        
                        success = await self.add_entry(entry)
                        if success:
                            added += 1
                    else:
                        # Update existing entry
                        update_data = {
                            'locations': {
                                'ipfs': ['https://ipfs.io/ipfs/' + cid]
                            }
                        }
                        
                        success = await self.update_metadata(cid, update_data)
                        if success:
                            updated += 1
            else:
                # Use the actual IPFS client to list pins
                try:
                    # Call IPFS client to list pins
                    # Get the method to call based on IPFS implementation
                    if hasattr(self.ipfs, 'list_pins'):
                        pins_method = self.ipfs.list_pins
                    elif hasattr(self.ipfs, 'pin_ls'):
                        pins_method = self.ipfs.pin_ls
                    else:
                        # Try to find the method via ipfs.pin.ls
                        if hasattr(self.ipfs, 'pin') and hasattr(self.ipfs.pin, 'ls'):
                            pins_method = self.ipfs.pin.ls
                        else:
                            raise AttributeError("Could not find pin listing method in IPFS client")
                    
                    # Get all pins in a dictionary {cid: pin_type}
                    pins = await pins_method()
                    
                    # Create batches for parallel processing
                    pin_list = list(pins.items())
                    batch_size = self.batch_size
                    pin_batches = [pin_list[i:i + batch_size] for i in range(0, len(pin_list), batch_size)]
                    
                    # Process pins in batches
                    for batch in pin_batches:
                        batches += 1
                        batch_futures = []
                        
                        # Process each pin in the batch concurrently
                        for cid, pin_type in batch:
                            # Use thread pool for concurrent processing
                            future = self.executor.submit(self._process_ipfs_pin, cid, pin_type)
                            batch_futures.append(future)
                        
                        # Wait for all futures in this batch to complete
                        for future in concurrent.futures.as_completed(batch_futures):
                            result = future.result()
                            if result['status'] == 'added':
                                added += 1
                            elif result['status'] == 'updated':
                                updated += 1
                            elif result['status'] == 'error':
                                errors += 1
                            else:
                                skipped += 1
                
                except AttributeError as e:
                    logger.error(f"IPFS client missing required methods: {e}")
                    return {
                        'success': False,
                        'error': f"IPFS client missing required methods: {e}",
                        'added': added,
                        'updated': updated,
                        'skipped': skipped,
                        'errors': errors
                    }
                except Exception as e:
                    logger.error(f"Error listing IPFS pins: {e}")
                    return {
                        'success': False,
                        'error': f"Error listing IPFS pins: {e}",
                        'added': added,
                        'updated': updated,
                        'skipped': skipped,
                        'errors': errors
                    }
            
            # Calculate duration
            duration = time.time() - start_time
            
            # Save changes to ensure all updates are persisted
            await self.save()
            
            return {
                'success': True,
                'added': added,
                'updated': updated,
                'skipped': skipped,
                'errors': errors,
                'batches': batches,
                'duration_seconds': duration
            }
        except Exception as e:
            logger.error(f"Error syncing with IPFS pinset: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'added': 0,
                'updated': 0,
                'skipped': 0,
                'errors': 0
            }
            
    async def _process_ipfs_pin(self, cid, pin_type):
        """
        Process a single IPFS pin
        
        Args:
            cid (str): Content identifier
            pin_type (str): Type of pin (recursive, direct, etc.)
            
        Returns:
            dict: Processing result
        """
        try:
            # Check if the entry already exists
            existing = await self.lookup_by_cid(cid)
            
            if existing:
                # Update existing entry with IPFS location
                update_data = {
                    'locations': {
                        'ipfs': ['https://ipfs.io/ipfs/' + cid]
                    }
                }
                
                success = await self.update_metadata(cid, update_data)
                if success:
                    return {
                        'status': 'updated',
                        'cid': cid
                    }
                else:
                    return {
                        'status': 'error',
                        'cid': cid,
                        'error': 'Failed to update metadata'
                    }
            else:
                # Get metadata from IPFS if possible
                try:
                    size = 0
                    mimetype = 'application/octet-stream'
                    
                    # Try to get file size and type using IPFS stat
                    if hasattr(self.ipfs, 'files_stat') and callable(self.ipfs.files_stat):
                        stat = await self.ipfs.files_stat(f'/ipfs/{cid}')
                        if stat and 'size' in stat:
                            size = stat['size']
                    
                    # Add new entry
                    entry = {
                        'cid': cid,
                        'path': f'/ipfs/{cid}',
                        'metadata': {
                            'size': size,
                            'mimetype': mimetype,
                            'content_type': 'file',
                            'tags': ['ipfs', pin_type],
                            'locations': {
                                'ipfs': ['https://ipfs.io/ipfs/' + cid]
                            }
                        }
                    }
                    
                    success = await self.add_entry(entry)
                    if success:
                        return {
                            'status': 'added',
                            'cid': cid
                        }
                    else:
                        return {
                            'status': 'error',
                            'cid': cid,
                            'error': 'Failed to add entry'
                        }
                except Exception as e:
                    logger.warning(f"Error getting IPFS metadata for {cid}: {e}")
                    
                    # Add entry with minimal information
                    entry = {
                        'cid': cid,
                        'path': f'/ipfs/{cid}',
                        'metadata': {
                            'size': 0,
                            'mimetype': 'application/octet-stream',
                            'content_type': 'file',
                            'tags': ['ipfs', pin_type],
                            'locations': {
                                'ipfs': ['https://ipfs.io/ipfs/' + cid]
                            }
                        }
                    }
                    
                    success = await self.add_entry(entry)
                    if success:
                        return {
                            'status': 'added',
                            'cid': cid
                        }
                    else:
                        return {
                            'status': 'error',
                            'cid': cid,
                            'error': 'Failed to add entry'
                        }
        except Exception as e:
            logger.error(f"Error processing IPFS pin {cid}: {e}")
            return {
                'status': 'error',
                'cid': cid,
                'error': str(e)
            }
    
    async def export_to_parquet(self, output_path):
        """
        Export the content index to Parquet format
        
        Args:
            output_path (str): Path to save the Parquet file
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            if self.mock_mode:
                # In mock mode, we'll just save the JSON data
                with open(output_path.replace('.parquet', '.json'), 'w') as f:
                    json.dump(self.mock_store, f)
                logger.info(f"Exported mock content index to JSON: {output_path}")
                return True
            else:
                # Real export to Parquet
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                parquet.write_table(self.table, output_path)
                logger.info(f"Exported content index to Parquet: {output_path}")
                return True
        except Exception as e:
            logger.error(f"Error exporting to Parquet: {e}")
            return False
    
    async def import_from_parquet(self, input_path):
        """
        Import the content index from Parquet format
        
        Args:
            input_path (str): Path to the Parquet file
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            if self.mock_mode:
                # In mock mode, try to import from JSON
                json_path = input_path.replace('.parquet', '.json')
                if os.path.exists(json_path):
                    with open(json_path, 'r') as f:
                        self.mock_store = json.load(f)
                    logger.info(f"Imported mock content index from JSON: {json_path}")
                    await self.save()
                    return True
                else:
                    logger.error(f"JSON file not found: {json_path}")
                    return False
            else:
                # Real import from Parquet
                if not os.path.exists(input_path):
                    logger.error(f"Parquet file not found: {input_path}")
                    return False
                
                imported_table = parquet.read_table(input_path)
                self.table = imported_table
                logger.info(f"Imported content index from Parquet: {input_path}")
                await self.save()
                return True
        except Exception as e:
            logger.error(f"Error importing from Parquet: {e}")
            return False
    
    async def get_stats(self):
        """
        Get comprehensive statistics about the content index
        
        Returns:
            dict: Detailed content index statistics
        """
        if not self.initialized:
            await self.init()
        
        try:
            if self.mock_mode:
                # Mock statistics
                entry_count = len(self.mock_store)
                
                # Count by mime type
                mime_counts = {}
                for entry in self.mock_store:
                    mime = entry.get('mimetype', 'unknown')
                    mime_counts[mime] = mime_counts.get(mime, 0) + 1
                
                # Calculate total size
                total_size = sum(entry.get('size', 0) for entry in self.mock_store)
                
                # Count by storage backend
                backend_counts = {
                    'ipfs': 0,
                    'filecoin': 0,
                    'storacha': 0,
                    'libp2p': 0,
                    'ipfs_cluster': 0,
                    's3': 0,
                    'huggingface': 0
                }
                
                # Count by content type
                content_type_counts = {}
                
                # Track tag usage
                tag_counts = {}
                
                # Track model types (if applicable)
                model_framework_counts = {}
                model_task_counts = {}
                
                # Track dataset formats (if applicable)
                dataset_format_counts = {}
                
                # Recent activity
                recent_updates = []
                
                for entry in self.mock_store:
                    # Count by content type
                    content_type = entry.get('content_type', 'unknown')
                    content_type_counts[content_type] = content_type_counts.get(content_type, 0) + 1
                    
                    # Count by storage backend
                    locations = entry.get('locations', {})
                    
                    if locations.get('ipfs'):
                        backend_counts['ipfs'] += 1
                    
                    if locations.get('filecoin'):
                        backend_counts['filecoin'] += 1
                    
                    if locations.get('storacha'):
                        backend_counts['storacha'] += 1
                    
                    if locations.get('libp2p'):
                        backend_counts['libp2p'] += 1
                    
                    if locations.get('ipfs_cluster'):
                        backend_counts['ipfs_cluster'] += 1
                    
                    if locations.get('s3', {}).get('bucket'):
                        backend_counts['s3'] += 1
                    
                    if locations.get('huggingface', {}).get('repo_id'):
                        backend_counts['huggingface'] += 1
                    
                    # Count tags
                    for tag in entry.get('tags', []):
                        tag_counts[tag] = tag_counts.get(tag, 0) + 1
                    
                    # Count model frameworks and tasks
                    if content_type == 'model' and 'model_info' in entry:
                        model_info = entry.get('model_info', {})
                        framework = model_info.get('framework', 'unknown')
                        task = model_info.get('task', 'unknown')
                        
                        model_framework_counts[framework] = model_framework_counts.get(framework, 0) + 1
                        model_task_counts[task] = model_task_counts.get(task, 0) + 1
                    
                    # Count dataset formats
                    if content_type == 'dataset' and 'dataset_info' in entry:
                        dataset_info = entry.get('dataset_info', {})
                        dataset_format = dataset_info.get('format', 'unknown')
                        
                        dataset_format_counts[dataset_format] = dataset_format_counts.get(dataset_format, 0) + 1
                    
                    # Track recent updates (last 10)
                    updated_at = entry.get('updated_at')
                    if updated_at:
                        recent_updates.append({
                            'cid': entry.get('cid'),
                            'path': entry.get('path'),
                            'updated_at': updated_at,
                            'content_type': content_type
                        })
                
                # Sort recent updates by updated_at (descending)
                recent_updates.sort(key=lambda x: x['updated_at'], reverse=True)
                recent_updates = recent_updates[:10]  # Keep only the most recent 10
                
                return {
                    'total_entries': entry_count,
                    'total_size_bytes': total_size,
                    'by_mimetype': mime_counts,
                    'by_content_type': content_type_counts,
                    'by_backend': backend_counts,
                    'by_tag': tag_counts,
                    'models': {
                        'by_framework': model_framework_counts,
                        'by_task': model_task_counts,
                        'count': content_type_counts.get('model', 0)
                    },
                    'datasets': {
                        'by_format': dataset_format_counts,
                        'count': content_type_counts.get('dataset', 0)
                    },
                    'recent_updates': recent_updates,
                    'mock_mode': True,
                    'timestamp': datetime.now().isoformat()
                }
            else:
                # Real PyArrow statistics using PyArrow compute functions
                entry_count = len(self.table)
                
                # Calculate total size
                if 'size' in self.table.column_names:
                    total_size = pc.sum(self.table['size']).as_py()
                else:
                    total_size = 0
                
                # Initialize statistics dictionaries
                mime_counts = {}
                content_type_counts = {}
                backend_counts = {
                    'ipfs': 0,
                    'filecoin': 0,
                    'storacha': 0,
                    'libp2p': 0,
                    'ipfs_cluster': 0,
                    's3': 0,
                    'huggingface': 0
                }
                tag_counts = {}
                model_framework_counts = {}
                model_task_counts = {}
                dataset_format_counts = {}
                
                # Get unique mimetypes and their counts
                if 'mimetype' in self.table.column_names:
                    mimetype_arr = self.table['mimetype']
                    unique_mimetypes = pc.unique(mimetype_arr)
                    
                    for mime in unique_mimetypes.to_pylist():
                        count = pc.sum(pc.equal(mimetype_arr, mime)).as_py()
                        mime_counts[mime] = count
                
                # Get unique content types and their counts
                if 'content_type' in self.table.column_names:
                    content_type_arr = self.table['content_type']
                    unique_content_types = pc.unique(content_type_arr)
                    
                    for ct in unique_content_types.to_pylist():
                        count = pc.sum(pc.equal(content_type_arr, ct)).as_py()
                        content_type_counts[ct] = count
                
                # Process each row for more complex statistics
                # Note: This is less efficient than using PyArrow compute functions,
                # but some statistics are more complex to compute with PyArrow
                py_dict = self.table.to_pydict()
                
                # Count storage backends
                if 'locations' in py_dict:
                    locations_list = py_dict['locations']
                    for locations in locations_list:
                        if not locations:
                            continue
                            
                        if locations.get('ipfs'):
                            backend_counts['ipfs'] += 1
                        
                        if locations.get('filecoin'):
                            backend_counts['filecoin'] += 1
                        
                        if locations.get('storacha'):
                            backend_counts['storacha'] += 1
                        
                        if locations.get('libp2p'):
                            backend_counts['libp2p'] += 1
                        
                        if locations.get('ipfs_cluster'):
                            backend_counts['ipfs_cluster'] += 1
                        
                        if locations.get('s3', {}).get('bucket'):
                            backend_counts['s3'] += 1
                        
                        if locations.get('huggingface', {}).get('repo_id'):
                            backend_counts['huggingface'] += 1
                
                # Count tags
                if 'tags' in py_dict:
                    tags_list = py_dict['tags']
                    for tags in tags_list:
                        if not tags:
                            continue
                            
                        for tag in tags:
                            tag_counts[tag] = tag_counts.get(tag, 0) + 1
                
                # Count model frameworks and tasks
                if 'content_type' in py_dict and 'model_info' in py_dict:
                    content_types = py_dict['content_type']
                    model_infos = py_dict['model_info']
                    
                    for i, ct in enumerate(content_types):
                        if ct == 'model' and i < len(model_infos):
                            model_info = model_infos[i]
                            if not model_info:
                                continue
                                
                            framework = model_info.get('framework', 'unknown')
                            task = model_info.get('task', 'unknown')
                            
                            model_framework_counts[framework] = model_framework_counts.get(framework, 0) + 1
                            model_task_counts[task] = model_task_counts.get(task, 0) + 1
                
                # Count dataset formats
                if 'content_type' in py_dict and 'dataset_info' in py_dict:
                    content_types = py_dict['content_type']
                    dataset_infos = py_dict['dataset_info']
                    
                    for i, ct in enumerate(content_types):
                        if ct == 'dataset' and i < len(dataset_infos):
                            dataset_info = dataset_infos[i]
                            if not dataset_info:
                                continue
                                
                            dataset_format = dataset_info.get('format', 'unknown')
                            dataset_format_counts[dataset_format] = dataset_format_counts.get(dataset_format, 0) + 1
                
                # Get recent updates
                recent_updates = []
                if 'updated_at' in py_dict and 'cid' in py_dict and 'path' in py_dict:
                    updated_ats = py_dict['updated_at']
                    cids = py_dict['cid']
                    paths = py_dict['path']
                    content_types = py_dict.get('content_type', ['unknown'] * len(cids))
                    
                    # Create list of updates with timestamps
                    updates = []
                    for i in range(len(updated_ats)):
                        if i < len(cids) and i < len(paths):
                            content_type = content_types[i] if i < len(content_types) else 'unknown'
                            updates.append({
                                'cid': cids[i],
                                'path': paths[i],
                                'updated_at': updated_ats[i],
                                'content_type': content_type,
                                'index': i
                            })
                    
                    # Sort by updated_at (descending) and take the top 10
                    updates.sort(key=lambda x: x['updated_at'], reverse=True)
                    recent_updates = updates[:10]
                
                return {
                    'total_entries': entry_count,
                    'total_size_bytes': total_size,
                    'by_mimetype': mime_counts,
                    'by_content_type': content_type_counts,
                    'by_backend': backend_counts,
                    'by_tag': tag_counts,
                    'models': {
                        'by_framework': model_framework_counts,
                        'by_task': model_task_counts,
                        'count': content_type_counts.get('model', 0)
                    },
                    'datasets': {
                        'by_format': dataset_format_counts,
                        'count': content_type_counts.get('dataset', 0)
                    },
                    'recent_updates': recent_updates,
                    'mock_mode': False,
                    'timestamp': datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                'error': str(e),
                'mock_mode': self.mock_mode,
                'timestamp': datetime.now().isoformat()
            }
    
    def test(self):
        """
        Run tests for the PyArrow Content Index
        
        Returns:
            dict: Test results
        """
        logger.info("Running PyArrow Content Index tests")
        
        try:
            # Run in a new event loop for synchronous testing
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            results = {
                'success': True,
                'module': 'pyarrow_content_index',
                'initialization': False,
                'add_entry': False,
                'lookup_by_cid': False,
                'lookup_by_path': False,
                'update_metadata': False,
                'storage_location': False,
                'query': False,
                'export': False,
                'mock_mode': self.mock_mode
            }
            
            # Test initialization
            init_result = loop.run_until_complete(self.init())
            results['initialization'] = init_result
            
            if not init_result:
                # If initialization fails, other tests will fail too
                results['success'] = False
                return results
            
            # Test adding an entry
            test_cid = f'bafybei{uuid.uuid4().hex[:32]}'
            test_path = f'/test/path/{uuid.uuid4().hex[:8]}'
            
            entry = {
                'cid': test_cid,
                'path': test_path,
                'metadata': {
                    'mimetype': 'text/plain',
                    'size': 1024,
                    'locations': {
                        'ipfs': ['https://ipfs.io/ipfs/' + test_cid]
                    }
                }
            }
            
            add_result = loop.run_until_complete(self.add_entry(entry))
            results['add_entry'] = add_result
            
            if add_result:
                # Test lookup by CID
                lookup_result = loop.run_until_complete(self.lookup_by_cid(test_cid))
                results['lookup_by_cid'] = lookup_result is not None
                
                # Test lookup by path
                path_result = loop.run_until_complete(self.lookup_by_path(test_path))
                results['lookup_by_path'] = path_result is not None
                
                # Test updating metadata
                metadata_update = {
                    'mimetype': 'application/json',
                    'size': 2048
                }
                
                update_result = loop.run_until_complete(self.update_metadata(test_cid, metadata_update))
                results['update_metadata'] = update_result
                
                # Test registering storage location
                location_result = loop.run_until_complete(
                    self.register_storage_location(
                        test_cid, 
                        'huggingface', 
                        {
                            'repo_id': 'test/model',
                            'path': 'model.bin',
                            'revision': 'main'
                        }
                    )
                )
                results['storage_location'] = location_result
                
                # Test query
                query_result = loop.run_until_complete(
                    self.query({
                        'filter': "mimetype LIKE 'application/%'",
                        'sort': 'size DESC',
                        'limit': 10
                    })
                )
                results['query'] = len(query_result) > 0
                
                # Test export
                test_export_path = os.path.join(tempfile.gettempdir(), f'test_index_{uuid.uuid4().hex[:8]}.parquet')
                export_result = loop.run_until_complete(self.export_to_parquet(test_export_path))
                results['export'] = export_result
                
                # Clean up the export file
                try:
                    if os.path.exists(test_export_path):
                        os.unlink(test_export_path)
                    if os.path.exists(test_export_path.replace('.parquet', '.json')):
                        os.unlink(test_export_path.replace('.parquet', '.json'))
                except:
                    pass
            
            # Overall success
            results['success'] = (
                results['initialization'] and
                results['add_entry'] and
                results['lookup_by_cid'] and
                results['lookup_by_path'] and
                results['update_metadata'] and
                results['storage_location'] and
                results['query'] and
                results['export']
            )
            
            return results
        except Exception as e:
            logger.error(f"PyArrow Content Index test failed: {e}")
            return {
                'success': False,
                'module': 'pyarrow_content_index',
                'error': str(e),
                'mock_mode': self.mock_mode
            }

# Create default instance
pyarrow_content_index = PyArrowContentIndex()