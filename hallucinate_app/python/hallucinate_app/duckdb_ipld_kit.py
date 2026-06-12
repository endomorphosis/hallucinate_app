"""
DuckDB-IPLD Kit Module

Provides integration between DuckDB and IPLD for P2P database exchange
Enables analytical SQL queries with IPLD conversion for data sharing via libp2p
"""

import logging
import os
import json
import time
import asyncio
import tempfile
from typing import Dict, List, Any, Optional, Union, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_DUCKDB = True
except ImportError:
    HAS_DUCKDB = False

try:
    import ipld
    import ipldschema
    from ipld import codec, format
    HAS_IPLD = True
except ImportError:
    HAS_IPLD = False

class DuckDBIPLDKit:
    """
    Integration between DuckDB and IPLD for P2P database exchange
    
    Provides analytical SQL capabilities with IPLD conversion for peer-to-peer exchange
    Implements the schema from CLAUDE.md with proper IPLD conversion utilities
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize DuckDB-IPLD Kit
        
        Args:
            resources (dict): Shared resources (ipfsKit, libp2pKit, etc.)
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Database configuration
        self.db_path = self.metadata.get("db_path", ":memory:")
        self.auto_commit = self.metadata.get("auto_commit", True)
        self.read_only = self.metadata.get("read_only", False)
        
        # IPLD configuration
        self.ipld_codec = self.metadata.get("ipld_codec", "dag-cbor")
        self.ipld_format = self.metadata.get("ipld_format", "table")
        
        # Connection and initialization
        self.conn = None
        self.initialized = False
        
        # Performance tracking
        self.stats = {
            "queries_executed": 0,
            "tables_created": 0,
            "tables_exported": 0,
            "tables_imported": 0,
            "ipld_conversions": 0,
            "parquet_exports": 0,
            "arrow_buffers": 0,
            "last_operation": None,
            "last_operation_time": None
        }
        
        # Check dependencies
        self.mock_mode = not (HAS_DUCKDB and HAS_IPLD)
        if self.mock_mode:
            print("WARNING: Running in mock mode due to missing dependencies")
            print(f"HAS_DUCKDB: {HAS_DUCKDB}, HAS_IPLD: {HAS_IPLD}")
            # Mock storage
            self.tables = set()
            self.statements = {}
    
    async def init(self):
        """Initialize the DuckDB connection and IPLD configuration"""
        if self.mock_mode:
            self.initialized = True
            return True
            
        try:
            # Initialize DuckDB connection
            if not os.path.exists(os.path.dirname(self.db_path)) and self.db_path != ":memory:":
                os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
                
            self.conn = duckdb.connect(self.db_path, read_only=self.read_only)
            
            # Configure Arrow integration
            self.conn.execute("INSTALL arrow")
            self.conn.execute("LOAD arrow")
            
            # Configure Parquet support
            self.conn.execute("INSTALL parquet")
            self.conn.execute("LOAD parquet")
            
            # Configure JSON support
            self.conn.execute("INSTALL json")
            self.conn.execute("LOAD json")
            
            # Set pragma for optimizations
            if self.auto_commit:
                self.conn.execute("PRAGMA auto_commit=ON")
            
            self.initialized = True
            return True
        except Exception as e:
            print(f"Error initializing DuckDB-IPLD Kit: {e}")
            return False
    
    async def execute(self, sql, params=None):
        """
        Execute a SQL query
        
        Args:
            sql (str): SQL query to execute
            params (list, optional): Query parameters
            
        Returns:
            dict: Query results
        """
        if not self.initialized:
            await self.init()
        
        start_time = time.time()
        self.stats["queries_executed"] += 1
        self.stats["last_operation"] = "execute"
        
        if self.mock_mode:
            # Check for CREATE TABLE statement in mock mode
            if sql.upper().startswith("CREATE TABLE"):
                table_name_match = sql.upper().split("CREATE TABLE ")[1].split(" ")[0]
                if table_name_match:
                    self.tables.add(table_name_match)
                    self.stats["tables_created"] += 1
            
            # Mock response based on query type
            if sql.upper().startswith("SELECT"):
                result = {
                    "success": True,
                    "rows": [{"id": 1, "value": "test"}],
                    "row_count": 1,
                    "sql": sql,
                    "mock": True
                }
            elif sql.upper().startswith("INSERT"):
                result = {
                    "success": True,
                    "rows_affected": 1,
                    "sql": sql,
                    "mock": True
                }
            else:
                result = {
                    "success": True,
                    "sql": sql,
                    "mock": True
                }
        else:
            try:
                # Use parameterized query if params provided
                if params and len(params) > 0:
                    result_cursor = self.conn.execute(sql, params)
                else:
                    result_cursor = self.conn.execute(sql)
                
                # Convert result to dict
                try:
                    df = result_cursor.df()
                    rows = df.to_dict('records')
                    result = {
                        "success": True,
                        "rows": rows,
                        "row_count": len(rows),
                        "sql": sql,
                        "execution_time_ms": (time.time() - start_time) * 1000
                    }
                except Exception as df_exc:
                    # For non-SELECT queries (INSERT/UPDATE/DELETE), .df() is unavailable.
                    # Use .rowcount; fall back to -1 if attribute is missing or DuckDB returns None.
                    logger.debug("result_cursor.df() unavailable (expected for non-SELECT): %s", df_exc)
                    try:
                        rows_affected = result_cursor.rowcount if hasattr(result_cursor, 'rowcount') else -1
                        if rows_affected is None:
                            rows_affected = -1
                    except Exception as rc_exc:
                        logger.debug("result_cursor.rowcount unavailable, defaulting to -1: %s", rc_exc)
                        rows_affected = -1
                    result = {
                        "success": True,
                        "rows_affected": rows_affected,
                        "sql": sql,
                        "execution_time_ms": (time.time() - start_time) * 1000
                    }
            except Exception as e:
                result = {
                    "success": False,
                    "error": str(e),
                    "sql": sql,
                    "execution_time_ms": (time.time() - start_time) * 1000
                }
        
        self.stats["last_operation_time"] = (time.time() - start_time) * 1000
        return result
    
    async def export_table_to_ipld(self, table_name):
        """
        Export a table to IPLD format
        
        Args:
            table_name (str): Name of the table to export
            
        Returns:
            dict: IPLD representation with CID
        """
        if not self.initialized:
            await self.init()
        
        start_time = time.time()
        self.stats["tables_exported"] += 1
        self.stats["ipld_conversions"] += 1
        self.stats["last_operation"] = "export_table_to_ipld"
        
        if self.mock_mode:
            # Generate a mock CID
            import random
            import string
            mock_cid = f"bafybeig{''.join(random.choices(string.ascii_lowercase + string.digits, k=40))}"
            
            return {
                "cid": mock_cid,
                "ipld": {
                    "table": table_name,
                    "schema": {
                        "fields": [
                            {"name": "id", "type": "INTEGER"},
                            {"name": "value", "type": "VARCHAR"}
                        ]
                    },
                    "data": [
                        {"id": 1, "value": "Sample 1"},
                        {"id": 2, "value": "Sample 2"}
                    ]
                },
                "success": True,
                "mock": True
            }
        
        try:
            # Get table schema
            schema_query = f"DESCRIBE {table_name}"
            schema_result = await self.execute(schema_query)
            
            if not schema_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to get schema for table {table_name}: {schema_result.get('error', 'Unknown error')}"
                }
            
            # Get table data
            data_query = f"SELECT * FROM {table_name}"
            data_result = await self.execute(data_query)
            
            if not data_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to get data for table {table_name}: {data_result.get('error', 'Unknown error')}"
                }
            
            # Create IPLD representation
            ipld_schema = {
                "name": table_name,
                "version": "1.0",
                "timestamp": time.time(),
                "schema": schema_result["rows"],
                "data": data_result["rows"],
                "row_count": data_result["row_count"]
            }
            
            # Add metadata
            ipld_schema["metadata"] = {
                "exported_at": time.time(),
                "exported_by": self.metadata.get("instance_id", "unknown"),
                "format": self.ipld_format,
                "codec": self.ipld_codec
            }
            
            # Convert to IPLD and get CID
            if HAS_IPLD:
                # Use IPLD library to create proper IPLD object
                ipld_node = ipld.encode(ipld_schema, codec=self.ipld_codec)
                cid = str(ipld_node.cid)
                
                # Store in IPFS if available
                if self.resources.get("ipfsKit"):
                    await self.resources["ipfsKit"].add_to_ipfs(ipld_node.data, {"format": "ipld"})
            else:
                # Fallback if IPLD library is not available
                # This would normally use a proper IPLD library
                cid = f"mock-cid-{hash(json.dumps(ipld_schema))}"
            
            result = {
                "cid": cid,
                "ipld": ipld_schema,
                "success": True,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
            
            self.stats["last_operation_time"] = (time.time() - start_time) * 1000
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "table": table_name,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
    
    async def import_table_from_ipld(self, ipld_data, target_table_name=None):
        """
        Import a table from IPLD format
        
        Args:
            ipld_data (dict): IPLD data structure
            target_table_name (str, optional): Name for the imported table
            
        Returns:
            dict: Import results
        """
        if not self.initialized:
            await self.init()
        
        start_time = time.time()
        self.stats["tables_imported"] += 1
        self.stats["ipld_conversions"] += 1
        self.stats["last_operation"] = "import_table_from_ipld"
        
        if self.mock_mode:
            table_name = target_table_name or (ipld_data.get("table") or f"imported_{int(time.time())}")
            self.tables.add(table_name)
            
            return {
                "table_name": table_name,
                "rows_imported": 2,
                "success": True,
                "mock": True
            }
        
        try:
            # Extract schema and data from IPLD
            if isinstance(ipld_data, bytes) and HAS_IPLD:
                # Decode IPLD binary data if needed
                ipld_data = ipld.decode(ipld_data, codec=self.ipld_codec)
            
            # Extract table information
            source_table_name = ipld_data.get("name", "unknown_table")
            schema = ipld_data.get("schema", [])
            data = ipld_data.get("data", [])
            
            # Use provided target name or source name
            table_name = target_table_name or source_table_name
            
            # Create the table
            columns = []
            for field in schema:
                name = field.get("column_name", field.get("name", "unknown"))
                dtype = field.get("column_type", field.get("type", "VARCHAR"))
                columns.append(f"{name} {dtype}")
            
            create_sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(columns)})"
            create_result = await self.execute(create_sql)
            
            if not create_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to create table: {create_result.get('error', 'Unknown error')}",
                    "table_name": table_name
                }
            
            # Insert data
            if data and len(data) > 0:
                # Get column names from first row
                columns = list(data[0].keys())
                
                # Insert data in batches for efficiency
                batch_size = 1000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i+batch_size]
                    
                    # Create temporary JSON file for batch insert
                    with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as temp:
                        json.dump(batch, temp)
                        temp_path = temp.name
                    
                    try:
                        # Import from JSON file
                        import_sql = f"INSERT INTO {table_name} SELECT * FROM read_json('{temp_path}')"
                        import_result = await self.execute(import_sql)
                        
                        if not import_result["success"]:
                            return {
                                "success": False,
                                "error": f"Failed to import data: {import_result.get('error', 'Unknown error')}",
                                "table_name": table_name,
                                "rows_processed": i
                            }
                    finally:
                        # Clean up temp file
                        os.unlink(temp_path)
            
            result = {
                "table_name": table_name,
                "rows_imported": len(data),
                "success": True,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
            
            self.stats["last_operation_time"] = (time.time() - start_time) * 1000
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "execution_time_ms": (time.time() - start_time) * 1000
            }
    
    async def export_table_to_parquet(self, table_name, output_path):
        """
        Export a table to Parquet format
        
        Args:
            table_name (str): Name of the table to export
            output_path (str): Path to save the Parquet file
            
        Returns:
            dict: Export results
        """
        if not self.initialized:
            await self.init()
        
        start_time = time.time()
        self.stats["tables_exported"] += 1
        self.stats["parquet_exports"] += 1
        self.stats["last_operation"] = "export_table_to_parquet"
        
        if self.mock_mode:
            return {
                "table_name": table_name,
                "output_path": output_path,
                "rows_exported": 10,
                "success": True,
                "mock": True
            }
        
        try:
            # Make sure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            # Export to parquet
            export_sql = f"COPY (SELECT * FROM {table_name}) TO '{output_path}' (FORMAT PARQUET)"
            export_result = await self.execute(export_sql)
            
            if not export_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to export table: {export_result.get('error', 'Unknown error')}",
                    "table_name": table_name
                }
            
            # Get row count
            count_sql = f"SELECT COUNT(*) FROM {table_name}"
            count_result = await self.execute(count_sql)
            row_count = count_result["rows"][0]["count_star()"] if count_result["success"] else 0
            
            result = {
                "table_name": table_name,
                "output_path": output_path,
                "rows_exported": row_count,
                "success": True,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
            
            self.stats["last_operation_time"] = (time.time() - start_time) * 1000
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "table_name": table_name,
                "output_path": output_path,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
    
    async def export_table_to_arrow(self, table_name):
        """
        Export a table to Arrow format
        
        Args:
            table_name (str): Name of the table to export
            
        Returns:
            dict: Export results with Arrow buffer
        """
        if not self.initialized:
            await self.init()
        
        start_time = time.time()
        self.stats["tables_exported"] += 1
        self.stats["arrow_buffers"] += 1
        self.stats["last_operation"] = "export_table_to_arrow"
        
        if self.mock_mode:
            # Mock Arrow buffer
            import io
            buffer = io.BytesIO(f"Mock Arrow Buffer for {table_name}".encode())
            
            return {
                "table_name": table_name,
                "schema": {
                    "fields": [
                        {"name": "id", "type": "int32"},
                        {"name": "value", "type": "utf8"}
                    ]
                },
                "record_count": 10,
                "buffer": buffer,
                "success": True,
                "mock": True
            }
        
        try:
            # Get result as Arrow table
            query = f"SELECT * FROM {table_name}"
            arrow_table = self.conn.execute(query).arrow()
            
            # Get schema information
            schema_info = []
            for field in arrow_table.schema:
                schema_info.append({
                    "name": field.name,
                    "type": str(field.type)
                })
            
            # Convert to buffer for transport
            sink = pa.BufferOutputStream()
            writer = pa.RecordBatchStreamWriter(sink, arrow_table.schema)
            writer.write_table(arrow_table)
            writer.close()
            buffer = sink.getvalue()
            
            result = {
                "table_name": table_name,
                "schema": {
                    "fields": schema_info
                },
                "record_count": len(arrow_table),
                "buffer": buffer,
                "success": True,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
            
            self.stats["last_operation_time"] = (time.time() - start_time) * 1000
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "table_name": table_name,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
    
    async def export_database_to_ipld(self):
        """
        Export the entire database to IPLD format
        
        Returns:
            dict: IPLD representation with CID
        """
        if not self.initialized:
            await self.init()
        
        start_time = time.time()
        self.stats["ipld_conversions"] += 1
        self.stats["last_operation"] = "export_database_to_ipld"
        
        if self.mock_mode:
            # Generate a mock CID
            import random
            import string
            mock_cid = f"bafybeig{''.join(random.choices(string.ascii_lowercase + string.digits, k=40))}"
            
            return {
                "cid": mock_cid,
                "table_count": len(self.tables),
                "success": True,
                "mock": True
            }
        
        try:
            # Get list of tables
            list_tables_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema='main'"
            tables_result = await self.execute(list_tables_sql)
            
            if not tables_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to list tables: {tables_result.get('error', 'Unknown error')}"
                }
            
            tables = [row["table_name"] for row in tables_result["rows"]]
            
            # Export each table to IPLD
            table_exports = {}
            for table in tables:
                export_result = await self.export_table_to_ipld(table)
                if export_result["success"]:
                    table_exports[table] = {
                        "cid": export_result["cid"],
                        "row_count": export_result["ipld"]["row_count"]
                    }
                else:
                    table_exports[table] = {
                        "error": export_result.get("error", "Unknown error")
                    }
            
            # Create database-level IPLD object
            db_ipld = {
                "name": os.path.basename(self.db_path),
                "version": "1.0",
                "timestamp": time.time(),
                "tables": table_exports,
                "table_count": len(tables)
            }
            
            # Add metadata
            db_ipld["metadata"] = {
                "exported_at": time.time(),
                "exported_by": self.metadata.get("instance_id", "unknown"),
                "format": self.ipld_format,
                "codec": self.ipld_codec
            }
            
            # Convert to IPLD and get CID
            if HAS_IPLD:
                # Use IPLD library to create proper IPLD object
                ipld_node = ipld.encode(db_ipld, codec=self.ipld_codec)
                cid = str(ipld_node.cid)
                
                # Store in IPFS if available
                if self.resources.get("ipfsKit"):
                    await self.resources["ipfsKit"].add_to_ipfs(ipld_node.data, {"format": "ipld"})
            else:
                # Fallback if IPLD library is not available
                cid = f"mock-cid-{hash(json.dumps(db_ipld))}"
            
            result = {
                "cid": cid,
                "table_count": len(tables),
                "tables": tables,
                "success": True,
                "execution_time_ms": (time.time() - start_time) * 1000
            }
            
            self.stats["last_operation_time"] = (time.time() - start_time) * 1000
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "execution_time_ms": (time.time() - start_time) * 1000
            }
    
    async def close(self):
        """Close the database connection"""
        if not self.mock_mode and self.conn:
            self.conn.close()
            self.conn = None
        
        self.initialized = False
        return True
    
    def get_stats(self):
        """Get current statistics"""
        if self.mock_mode:
            return {
                **self.stats,
                "table_count": len(self.tables),
                "statement_count": len(self.statements),
                "mock": True
            }
        else:
            # Get real table count
            table_count = 0
            table_count_error = None
            if self.conn:
                try:
                    result = self.conn.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='main'").fetchone()
                    table_count = result[0] if result else 0
                except Exception as e:
                    # information_schema may not be available in all DuckDB versions;
                    # fall back to 0 rather than propagating the error.
                    logger.warning("Failed to query DuckDB table count for stats: %s", e)
                    table_count = 0
                    table_count_error = str(e)

            stats = {
                **self.stats,
                "table_count": table_count,
                "conn_open": self.conn is not None,
                "db_path": self.db_path,
                "read_only": self.read_only,
                "mock": False
            }
            if table_count_error is not None:
                stats["table_count_error"] = table_count_error
            return stats
    
    async def test(self):
        """Run a self-test"""
        if not self.initialized:
            await self.init()
        
        results = {
            "success": True,
            "module": "duckdb_ipld_kit",
            "tests": {}
        }
        
        # Test SQL execution
        try:
            create_result = await self.execute("CREATE TABLE IF NOT EXISTS test_table (id INTEGER, value VARCHAR)")
            insert_result = await self.execute("INSERT INTO test_table VALUES (1, 'test_value')")
            select_result = await self.execute("SELECT * FROM test_table")
            
            results["tests"]["sql_execution"] = {
                "success": create_result["success"] and insert_result["success"] and select_result["success"],
                "row_count": select_result.get("row_count", 0)
            }
        except Exception as e:
            results["tests"]["sql_execution"] = {
                "success": False,
                "error": str(e)
            }
            results["success"] = False
        
        # Test IPLD export
        try:
            export_result = await self.export_table_to_ipld("test_table")
            results["tests"]["ipld_export"] = {
                "success": export_result["success"],
                "cid": export_result.get("cid", "")
            }
        except Exception as e:
            results["tests"]["ipld_export"] = {
                "success": False,
                "error": str(e)
            }
            results["success"] = False
        
        # Test Parquet export
        temp_dir = None
        try:
            temp_dir = tempfile.mkdtemp()
            parquet_path = os.path.join(temp_dir, "test_table.parquet")
            
            parquet_result = await self.export_table_to_parquet("test_table", parquet_path)
            results["tests"]["parquet_export"] = {
                "success": parquet_result["success"],
                "path": parquet_path if os.path.exists(parquet_path) else None
            }
        except Exception as e:
            results["tests"]["parquet_export"] = {
                "success": False,
                "error": str(e)
            }
            results["success"] = False
        finally:
            if temp_dir and os.path.exists(temp_dir):
                try:
                    import shutil
                    shutil.rmtree(temp_dir)
                except Exception as e:
                    logger.warning("Failed to remove Parquet export temp directory %s: %s", temp_dir, e)
                    parquet_test = results["tests"].setdefault("parquet_export", {})
                    parquet_test["success"] = False
                    parquet_test["cleanup_error"] = str(e)
                    results["success"] = False
        
        # Test Arrow export
        try:
            arrow_result = await self.export_table_to_arrow("test_table")
            results["tests"]["arrow_export"] = {
                "success": arrow_result["success"],
                "record_count": arrow_result.get("record_count", 0)
            }
        except Exception as e:
            logger.exception("DuckDB-IPLD self-test arrow export failed")
            results["tests"]["arrow_export"] = {
                "success": False,
                "error": str(e)
            }
            results["success"] = False
        
        # Clean up test table
        try:
            await self.execute("DROP TABLE IF EXISTS test_table")
        except Exception as e:
            logger.warning("Failed to drop test table during cleanup (non-fatal): %s", e)
        
        return results


# Command line testing
if __name__ == "__main__":
    async def test_kit():
        kit = DuckDBIPLDKit()
        await kit.init()
        
        print("Running tests...")
        test_results = await kit.test()
        print(json.dumps(test_results, indent=2))
        
        await kit.close()
    
    asyncio.run(test_kit())
