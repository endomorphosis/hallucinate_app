"""
PyArrow Content Index Bridge

Provides a bridge between JavaScript and Python for the PyArrow content index
Enables efficient data exchange using PyBridge and Apache Arrow
"""

import os
import json
import logging
import time
import asyncio
from typing import Dict, List, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index_bridge")

# Try to import PyBridge
try:
    import pybridge
    HAS_PYBRIDGE = True
except ImportError:
    HAS_PYBRIDGE = False

# Try to import PyArrow
try:
    import pyarrow as pa
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False

class PyArrowContentIndexBridge:
    """
    Bridge between JavaScript and Python for PyArrow Content Index
    
    Provides PyBridge and Apache Arrow integration for efficient data exchange
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the bridge
        
        Args:
            resources (dict): Resources including integration layer and PyBridge handler
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Track initialization
        self.initialized = False
        
        # Get the content index integration
        self.content_index_integration = self.resources.get('content_index_integration')
        
        # Get PyBridge handler
        self.pybridge_handler = self.resources.get('pybridge_handler')
        
        # Check if we have Arrow support
        self.use_arrow = HAS_PYARROW and self.metadata.get('use_arrow', True)
        
        # Arrow options
        if self.use_arrow:
            self.arrow_compression = self.metadata.get('arrow_compression', 'zstd')
            self.arrow_use_dictionary = self.metadata.get('arrow_use_dictionary', True)
            
        logger.info(f"PyArrowContentIndexBridge initialized (use_arrow={self.use_arrow})")
    
    async def init(self):
        """
        Initialize the bridge
        
        Returns:
            bool: Success status
        """
        try:
            logger.info("Initializing PyArrow Content Index Bridge")
            
            # Initialize the content index integration if we have it
            if self.content_index_integration:
                await self.content_index_integration.init()
            else:
                # Try to import and create it
                try:
                    from hallucinate_app.pyarrow_content_index_integration import PyArrowContentIndexIntegration
                    
                    # Create with resources and metadata
                    self.content_index_integration = PyArrowContentIndexIntegration(
                        resources=self.resources,
                        metadata=self.metadata
                    )
                    
                    # Initialize
                    await self.content_index_integration.init()
                    
                except ImportError as e:
                    logger.error(f"Could not import PyArrowContentIndexIntegration: {e}")
                    return False
            
            # Register PyBridge methods if available
            if HAS_PYBRIDGE and self.pybridge_handler:
                try:
                    # Register methods with PyBridge
                    self.pybridge_handler.register_method("lookup_by_cid", self.js_lookup_by_cid)
                    self.pybridge_handler.register_method("lookup_by_path", self.js_lookup_by_path)
                    self.pybridge_handler.register_method("add_entry", self.js_add_entry)
                    self.pybridge_handler.register_method("update_entry", self.js_update_entry)
                    self.pybridge_handler.register_method("delete_entry", self.js_delete_entry)
                    self.pybridge_handler.register_method("query", self.js_query)
                    self.pybridge_handler.register_method("sync_with_ipfs_pinset", self.js_sync_with_ipfs_pinset)
                    self.pybridge_handler.register_method("get_stats", self.js_get_stats)
                    self.pybridge_handler.register_method("save", self.js_save)
                    self.pybridge_handler.register_method("export_to_parquet", self.js_export_to_parquet)
                    self.pybridge_handler.register_method("import_from_parquet", self.js_import_from_parquet)
                    
                    logger.info("Registered PyBridge methods")
                except Exception as e:
                    logger.error(f"Error registering PyBridge methods: {e}")
            
            self.initialized = True
            logger.info("PyArrow Content Index Bridge initialization complete")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing PyArrow Content Index Bridge: {e}")
            return False
    
    def _convert_to_arrow(self, data):
        """
        Convert data to Arrow format for efficient transfer
        
        Args:
            data: Data to convert
            
        Returns:
            bytes: Arrow serialized data
        """
        if not HAS_PYARROW:
            return data
        
        try:
            if isinstance(data, list):
                # Convert list of dictionaries to Arrow table
                table = pa.Table.from_pylist(data)
            elif isinstance(data, dict):
                # Convert dictionary to Arrow table
                table = pa.Table.from_pylist([data])
            else:
                # Return original data if not convertible
                return data
            
            # Serialize to Arrow buffer
            sink = pa.BufferOutputStream()
            options = pa.ipc.write_options(compression=self.arrow_compression, 
                                          use_dictionary=self.arrow_use_dictionary)
            writer = pa.ipc.RecordBatchStreamWriter(sink, table.schema, options=options)
            writer.write_table(table)
            writer.close()
            
            return sink.getvalue().to_pybytes()
        except Exception as e:
            logger.error(f"Error converting to Arrow: {e}")
            return data
    
    def _deserialize_arrow(self, data):
        """
        Deserialize data from Arrow format
        
        Args:
            data: Arrow serialized data
            
        Returns:
            dict or list: Deserialized data
        """
        if not HAS_PYARROW or not isinstance(data, bytes):
            return data
        
        try:
            # Read Arrow buffer
            reader = pa.ipc.RecordBatchStreamReader(pa.BufferReader(data))
            table = reader.read_all()
            
            # Convert to Python objects
            result = table.to_pylist()
            
            # If single record, return as dict
            if len(result) == 1:
                return result[0]
            
            return result
        except Exception as e:
            logger.error(f"Error deserializing Arrow data: {e}")
            return data
    
    async def js_lookup_by_cid(self, cid, use_arrow=False):
        """
        Look up content by CID (JavaScript bridge method)
        
        Args:
            cid (str): Content identifier
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Content metadata
        """
        if not self.initialized:
            await self.init()
        
        try:
            result = await self.content_index_integration.lookup_by_cid(cid)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_lookup_by_cid: {e}")
            return {"error": str(e)}
    
    async def js_lookup_by_path(self, path, use_arrow=False):
        """
        Look up content by path (JavaScript bridge method)
        
        Args:
            path (str): Virtual filesystem path
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Content metadata
        """
        if not self.initialized:
            await self.init()
        
        try:
            result = await self.content_index_integration.lookup_by_path(path)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_lookup_by_path: {e}")
            return {"error": str(e)}
    
    async def js_add_entry(self, entry_data, use_arrow=False):
        """
        Add an entry to the content index (JavaScript bridge method)
        
        Args:
            entry_data (dict): Entry data with CID, path, and metadata
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Added entry
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Deserialize from Arrow if needed
            if use_arrow and self.use_arrow and isinstance(entry_data, bytes):
                entry_data = self._deserialize_arrow(entry_data)
            
            result = await self.content_index_integration.add_entry(entry_data)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_add_entry: {e}")
            return {"error": str(e)}
    
    async def js_update_entry(self, cid, update_data, use_arrow=False):
        """
        Update an entry in the content index (JavaScript bridge method)
        
        Args:
            cid (str): Content identifier
            update_data (dict): Data to update
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Updated entry
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Deserialize from Arrow if needed
            if use_arrow and self.use_arrow and isinstance(update_data, bytes):
                update_data = self._deserialize_arrow(update_data)
            
            result = await self.content_index_integration.update_entry(cid, update_data)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_update_entry: {e}")
            return {"error": str(e)}
    
    async def js_delete_entry(self, cid):
        """
        Delete an entry from the content index (JavaScript bridge method)
        
        Args:
            cid (str): Content identifier
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            result = await self.content_index_integration.delete_entry(cid)
            return result
        except Exception as e:
            logger.error(f"Error in js_delete_entry: {e}")
            return False
    
    async def js_query(self, query_params, use_arrow=False):
        """
        Query the content index (JavaScript bridge method)
        
        Args:
            query_params (dict): Query parameters including filters, sorting, pagination
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            list: Matching entries
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Deserialize from Arrow if needed
            if use_arrow and self.use_arrow and isinstance(query_params, bytes):
                query_params = self._deserialize_arrow(query_params)
            
            result = await self.content_index_integration.query(query_params)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_query: {e}")
            return {"error": str(e)}
    
    async def js_sync_with_ipfs_pinset(self, include_metadata=True, use_arrow=False):
        """
        Synchronize the content index with the IPFS pinset (JavaScript bridge method)
        
        Args:
            include_metadata (bool): Whether to include detailed metadata
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Synchronization results
        """
        if not self.initialized:
            await self.init()
        
        try:
            result = await self.content_index_integration.sync_with_ipfs_pinset(include_metadata)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_sync_with_ipfs_pinset: {e}")
            return {"error": str(e)}
    
    async def js_get_stats(self, use_arrow=False):
        """
        Get statistics about the content index (JavaScript bridge method)
        
        Args:
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Statistics including count, size, types, etc.
        """
        if not self.initialized:
            await self.init()
        
        try:
            result = await self.content_index_integration.get_stats()
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_get_stats: {e}")
            return {"error": str(e)}
    
    async def js_save(self):
        """
        Save the content index to disk (JavaScript bridge method)
        
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            return await self.content_index_integration.save()
        except Exception as e:
            logger.error(f"Error in js_save: {e}")
            return False
    
    async def js_export_to_parquet(self, export_path):
        """
        Export the content index to Parquet format (JavaScript bridge method)
        
        Args:
            export_path (str): Path to export the Parquet file
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            return await self.content_index_integration.export_to_parquet(export_path)
        except Exception as e:
            logger.error(f"Error in js_export_to_parquet: {e}")
            return False
    
    async def js_import_from_parquet(self, import_path):
        """
        Import the content index from Parquet format (JavaScript bridge method)
        
        Args:
            import_path (str): Path to import the Parquet file from
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            return await self.content_index_integration.import_from_parquet(import_path)
        except Exception as e:
            logger.error(f"Error in js_import_from_parquet: {e}")
            return False
    
    def test(self, verbose=False):
        """
        Test the bridge functionality
        
        Args:
            verbose (bool): Whether to include detailed logs
            
        Returns:
            dict: Test results
        """
        # Create test entry
        test_entry = {
            "cid": "QmTestBridgeCID12345",
            "path": "/test/bridge/file.txt",
            "mimetype": "text/plain",
            "size": 1024,
            "tags": ["test", "bridge"],
            "description": "Test entry for bridge testing"
        }
        
        # Run tests asynchronously
        async def run_tests():
            result = {
                "success": False,
                "module": "pyarrow_content_index_bridge",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "steps": {},
                "diagnostics": {
                    "dependencies": {
                        "pybridge": {
                            "available": HAS_PYBRIDGE
                        },
                        "pyarrow": {
                            "available": HAS_PYARROW
                        }
                    },
                    "environment": {
                        "use_arrow": self.use_arrow
                    }
                },
                "logs": [] if verbose else None
            }
            
            if verbose:
                result["logs"].append(f"[INFO] Starting bridge tests")
            
            # Test initialization
            if not self.initialized:
                await self.init()
            
            result["steps"]["initialization"] = {
                "success": self.initialized,
                "message": "Bridge initialized successfully" if self.initialized else "Bridge initialization failed"
            }
            
            if not self.initialized:
                result["success"] = False
                if verbose:
                    result["logs"].append("[ERROR] Bridge initialization failed, skipping remaining tests")
                return result
            
            # Test integration access
            result["steps"]["integration_access"] = {
                "success": self.content_index_integration is not None,
                "message": "Content index integration available" if self.content_index_integration else "Content index integration not available"
            }
            
            if not self.content_index_integration:
                result["success"] = False
                if verbose:
                    result["logs"].append("[ERROR] Content index integration not available, skipping remaining tests")
                return result
            
            # Test adding an entry
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing add_entry")
                add_result = await self.js_add_entry(test_entry)
                result["steps"]["add_entry"] = {
                    "success": "error" not in add_result,
                    "message": "Successfully added test entry" if "error" not in add_result else f"Failed to add entry: {add_result['error']}"
                }
            except Exception as e:
                result["steps"]["add_entry"] = {
                    "success": False,
                    "message": f"Exception in add_entry: {str(e)}"
                }
            
            # Test lookup by CID
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing lookup_by_cid")
                lookup_result = await self.js_lookup_by_cid(test_entry["cid"])
                result["steps"]["lookup_by_cid"] = {
                    "success": "error" not in lookup_result,
                    "message": "Successfully looked up entry by CID" if "error" not in lookup_result else f"Failed to lookup by CID: {lookup_result['error']}"
                }
            except Exception as e:
                result["steps"]["lookup_by_cid"] = {
                    "success": False,
                    "message": f"Exception in lookup_by_cid: {str(e)}"
                }
            
            # Test Arrow serialization if available
            if self.use_arrow:
                try:
                    if verbose:
                        result["logs"].append(f"[INFO] Testing Arrow serialization")
                    arrow_result = await self.js_lookup_by_cid(test_entry["cid"], use_arrow=True)
                    result["steps"]["arrow_serialization"] = {
                        "success": isinstance(arrow_result, bytes),
                        "message": f"Successfully serialized to Arrow format, size: {len(arrow_result)} bytes" if isinstance(arrow_result, bytes) else "Failed to serialize to Arrow format"
                    }
                except Exception as e:
                    result["steps"]["arrow_serialization"] = {
                        "success": False,
                        "message": f"Exception in Arrow serialization: {str(e)}"
                    }
            
            # Test cleanup - delete test entry
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing delete_entry (cleanup)")
                delete_result = await self.js_delete_entry(test_entry["cid"])
                result["steps"]["delete_entry"] = {
                    "success": delete_result is not False,
                    "message": "Successfully deleted test entry" if delete_result is not False else "Failed to delete test entry"
                }
            except Exception as e:
                result["steps"]["delete_entry"] = {
                    "success": False,
                    "message": f"Exception in delete_entry: {str(e)}"
                }
            
            # Determine overall success
            result["success"] = all(step["success"] for step in result["steps"].values())
            
            if verbose:
                result["logs"].append(f"[INFO] Bridge tests completed with status: {'SUCCESS' if result['success'] else 'FAILURE'}")
            
            return result
        
        # Run the tests in an event loop
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(run_tests())


# Create singleton instance for import
content_index_bridge = PyArrowContentIndexBridge()