"""
PyArrow Content Index Serialization Module

Provides efficient serialization and deserialization utilities for PyArrow Content Index
with support for zero-copy data sharing, compression options, and schema validation.
"""

import json
import logging
import time
import zlib
import gzip
from typing import Dict, List, Any, Optional, Union, Tuple, BinaryIO, TextIO

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index_serialization")

# Try to import PyArrow
try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    import pyarrow.compute as pc
    import pyarrow.plasma as plasma
    from pyarrow.ipc import RecordBatchStreamReader, RecordBatchStreamWriter, RecordBatchFileReader, RecordBatchFileWriter
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False
    logger.warning("PyArrow not available - falling back to JSON serialization")

# Default schemas for content index entries
DEFAULT_SCHEMA_FIELDS = [
    pa.field('cid', pa.string()),
    pa.field('path', pa.string()),
    pa.field('mimetype', pa.string()),
    pa.field('size', pa.int64()),
    pa.field('created_at', pa.timestamp('ms')),
    pa.field('updated_at', pa.timestamp('ms')),
    pa.field('tags', pa.list_(pa.string()), nullable=True),
    pa.field('locations', pa.struct([
        pa.field('local', pa.bool_(), nullable=True),
        pa.field('remote', pa.list_(pa.string()), nullable=True),
        pa.field('ipfs', pa.list_(pa.string()), nullable=True),
    ]), nullable=True),
    pa.field('metadata', pa.map_(pa.string(), pa.string()), nullable=True)
]

DEFAULT_SCHEMA = pa.schema(DEFAULT_SCHEMA_FIELDS)

class ContentIndexSerializer:
    """
    Serialization and deserialization utilities for PyArrow Content Index
    
    Features:
    - Efficient Arrow serialization with zero-copy capabilities
    - Fallback to JSON serialization when Arrow is not available
    - Compression options for network transfer
    - Schema validation for data consistency
    - Support for different formats (stream, file, memory)
    """
    
    def __init__(self, 
                 schema: Optional[pa.Schema] = None,
                 use_arrow: bool = True,
                 compression: str = 'zstd',
                 compression_level: int = 3,
                 use_dictionary: bool = True):
        """
        Initialize the serializer
        
        Args:
            schema: PyArrow schema to use (default to standard content index schema)
            use_arrow: Whether to use Arrow for serialization (falls back to JSON if False or Arrow not available)
            compression: Compression algorithm ('zstd', 'lz4', 'gzip', 'snappy', or None)
            compression_level: Compression level (when applicable)
            use_dictionary: Whether to use dictionary encoding for strings
        """
        self.schema = schema if schema is not None else DEFAULT_SCHEMA
        self.use_arrow = use_arrow and HAS_PYARROW
        self.compression = compression
        self.compression_level = compression_level
        self.use_dictionary = use_dictionary
        
        # Statistics
        self.serialization_stats = {
            'arrow_serializations': 0,
            'arrow_deserializations': 0,
            'json_serializations': 0,
            'json_deserializations': 0,
            'bytes_serialized': 0,
            'bytes_deserialized': 0,
            'serialization_time': 0.0,
            'deserialization_time': 0.0
        }
    
    def get_write_options(self) -> pa.ipc.IpcWriteOptions:
        """Get Arrow IPC write options with compression settings"""
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        options = pa.ipc.IpcWriteOptions()
        
        # Set compression if specified
        if self.compression:
            compression = getattr(pa.Compression, self.compression.upper(), None)
            if compression is not None:
                options = pa.ipc.IpcWriteOptions(
                    compression=compression,
                    use_dictionary=self.use_dictionary
                )
        
        return options
    
    def serialize_entries_to_arrow(self, entries: List[Dict[str, Any]]) -> bytes:
        """
        Serialize entries to Arrow format
        
        Args:
            entries: List of entry dictionaries
            
        Returns:
            Arrow serialized data as bytes
        """
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        start_time = time.time()
        
        try:
            # Convert list of dictionaries to Arrow table
            table = pa.Table.from_pylist(entries, schema=self.schema)
            
            # Serialize to Arrow buffer
            sink = pa.BufferOutputStream()
            options = self.get_write_options()
            
            writer = RecordBatchStreamWriter(sink, table.schema, options=options)
            writer.write_table(table)
            writer.close()
            
            result = sink.getvalue().to_pybytes()
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['arrow_serializations'] += 1
            self.serialization_stats['bytes_serialized'] += len(result)
            self.serialization_stats['serialization_time'] += (end_time - start_time)
            
            return result
        except Exception as e:
            logger.error(f"Error serializing to Arrow: {e}")
            # Fallback to JSON serialization
            return self.serialize_entries_to_json(entries, with_header=True)
    
    def deserialize_entries_from_arrow(self, data: bytes) -> List[Dict[str, Any]]:
        """
        Deserialize entries from Arrow format
        
        Args:
            data: Arrow serialized data as bytes
            
        Returns:
            List of entry dictionaries
        """
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        start_time = time.time()
        
        try:
            # Read Arrow buffer
            reader = RecordBatchStreamReader(pa.BufferReader(data))
            table = reader.read_all()
            
            # Convert to Python objects
            result = table.to_pylist()
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['arrow_deserializations'] += 1
            self.serialization_stats['bytes_deserialized'] += len(data)
            self.serialization_stats['deserialization_time'] += (end_time - start_time)
            
            return result
        except Exception as e:
            logger.error(f"Error deserializing from Arrow: {e}")
            
            # Check if this might be JSON data with header
            if data.startswith(b'JSONARROW:'):
                return self.deserialize_entries_from_json(data, with_header=True)
            
            # Just return the raw data and let the caller handle it
            raise
    
    def serialize_entries_to_json(self, entries: List[Dict[str, Any]], 
                                 compress: bool = False, 
                                 with_header: bool = False) -> bytes:
        """
        Serialize entries to JSON format
        
        Args:
            entries: List of entry dictionaries
            compress: Whether to compress the result with gzip
            with_header: Whether to add a header marking this as JSON data
            
        Returns:
            JSON serialized data as bytes
        """
        start_time = time.time()
        
        try:
            # Serialize to JSON
            json_data = json.dumps(entries).encode('utf-8')
            
            # Add header if requested
            if with_header:
                json_data = b'JSONARROW:' + json_data
            
            # Compress if requested
            if compress:
                json_data = gzip.compress(json_data, compresslevel=self.compression_level)
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['json_serializations'] += 1
            self.serialization_stats['bytes_serialized'] += len(json_data)
            self.serialization_stats['serialization_time'] += (end_time - start_time)
            
            return json_data
        except Exception as e:
            logger.error(f"Error serializing to JSON: {e}")
            raise
    
    def deserialize_entries_from_json(self, data: bytes, 
                                      compressed: bool = False,
                                      with_header: bool = False) -> List[Dict[str, Any]]:
        """
        Deserialize entries from JSON format
        
        Args:
            data: JSON serialized data as bytes
            compressed: Whether the data is compressed with gzip
            with_header: Whether the data has a header marking it as JSON
            
        Returns:
            List of entry dictionaries
        """
        start_time = time.time()
        
        try:
            # Check for header if with_header is True
            if with_header:
                if data.startswith(b'JSONARROW:'):
                    data = data[10:]  # Remove header
                else:
                    raise ValueError("Data does not have the expected JSON header")
            
            # Decompress if needed
            if compressed:
                data = gzip.decompress(data)
            
            # Deserialize from JSON
            result = json.loads(data.decode('utf-8'))
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['json_deserializations'] += 1
            self.serialization_stats['bytes_deserialized'] += len(data)
            self.serialization_stats['deserialization_time'] += (end_time - start_time)
            
            return result
        except Exception as e:
            logger.error(f"Error deserializing from JSON: {e}")
            raise
    
    def serialize_entries(self, entries: List[Dict[str, Any]]) -> bytes:
        """
        Serialize entries using the preferred format (Arrow or JSON fallback)
        
        Args:
            entries: List of entry dictionaries
            
        Returns:
            Serialized data as bytes
        """
        if self.use_arrow and HAS_PYARROW:
            return self.serialize_entries_to_arrow(entries)
        else:
            return self.serialize_entries_to_json(entries, compress=True, with_header=True)
    
    def deserialize_entries(self, data: bytes) -> List[Dict[str, Any]]:
        """
        Deserialize entries using the appropriate format based on data
        
        Args:
            data: Serialized data as bytes
            
        Returns:
            List of entry dictionaries
        """
        # Try to determine the format
        if data.startswith(b'JSONARROW:'):
            return self.deserialize_entries_from_json(data, with_header=True)
        elif data.startswith(b'\x1f\x8b'):  # gzip magic number
            return self.deserialize_entries_from_json(data, compressed=True)
        elif self.use_arrow and HAS_PYARROW:
            try:
                return self.deserialize_entries_from_arrow(data)
            except Exception:
                # Fallback to JSON without header
                try:
                    return self.deserialize_entries_from_json(data)
                except Exception as e:
                    logger.error(f"Failed to deserialize data: {e}")
                    raise
        else:
            # Try JSON deserialization
            try:
                return self.deserialize_entries_from_json(data)
            except Exception as e:
                logger.error(f"Failed to deserialize data: {e}")
                raise
    
    def serialize_to_parquet(self, entries: List[Dict[str, Any]], 
                            output_file: Union[str, BinaryIO]) -> None:
        """
        Serialize entries to Parquet format
        
        Args:
            entries: List of entry dictionaries
            output_file: Path to output file or file-like object
        """
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        start_time = time.time()
        
        try:
            # Convert list of dictionaries to Arrow table
            table = pa.Table.from_pylist(entries, schema=self.schema)
            
            # Write to Parquet
            pq.write_table(
                table, 
                output_file, 
                compression=self.compression,
                compression_level=self.compression_level,
                use_dictionary=self.use_dictionary
            )
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['arrow_serializations'] += 1
            self.serialization_stats['serialization_time'] += (end_time - start_time)
            
            # Can't track bytes for file output
            
        except Exception as e:
            logger.error(f"Error serializing to Parquet: {e}")
            raise
    
    def deserialize_from_parquet(self, input_file: Union[str, BinaryIO]) -> List[Dict[str, Any]]:
        """
        Deserialize entries from Parquet format
        
        Args:
            input_file: Path to input file or file-like object
            
        Returns:
            List of entry dictionaries
        """
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        start_time = time.time()
        
        try:
            # Read from Parquet
            table = pq.read_table(input_file)
            
            # Convert to Python objects
            result = table.to_pylist()
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['arrow_deserializations'] += 1
            self.serialization_stats['deserialization_time'] += (end_time - start_time)
            
            # Can't track bytes for file input
            
            return result
        except Exception as e:
            logger.error(f"Error deserializing from Parquet: {e}")
            raise
    
    def store_in_plasma(self, entries: List[Dict[str, Any]], 
                        plasma_client: plasma.PlasmaClient, 
                        object_id: Optional[plasma.ObjectID] = None) -> plasma.ObjectID:
        """
        Store entries in Plasma store for zero-copy sharing
        
        Args:
            entries: List of entry dictionaries
            plasma_client: Plasma client
            object_id: Optional object ID to use (generated if not provided)
            
        Returns:
            Object ID for retrieval
        """
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        start_time = time.time()
        
        try:
            # Convert list of dictionaries to Arrow table
            table = pa.Table.from_pylist(entries, schema=self.schema)
            
            # Serialize table to buffer
            sink = pa.BufferOutputStream()
            options = self.get_write_options()
            
            writer = RecordBatchStreamWriter(sink, table.schema, options=options)
            writer.write_table(table)
            writer.close()
            
            buffer = sink.getvalue()
            
            # Generate object ID if not provided
            if object_id is None:
                object_id = plasma.ObjectID.from_random()
            
            # Create buffer in plasma store
            plasma_buffer = plasma_client.create(object_id, buffer.size)
            
            # Write data to plasma buffer
            view = memoryview(plasma_buffer)
            buffer_view = memoryview(buffer)
            view[:] = buffer_view[:]
            
            # Seal the buffer
            plasma_client.seal(object_id)
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['arrow_serializations'] += 1
            self.serialization_stats['bytes_serialized'] += buffer.size
            self.serialization_stats['serialization_time'] += (end_time - start_time)
            
            return object_id
        except Exception as e:
            logger.error(f"Error storing in Plasma: {e}")
            raise
    
    def retrieve_from_plasma(self, object_id: plasma.ObjectID, 
                            plasma_client: plasma.PlasmaClient) -> List[Dict[str, Any]]:
        """
        Retrieve entries from Plasma store
        
        Args:
            object_id: Object ID to retrieve
            plasma_client: Plasma client
            
        Returns:
            List of entry dictionaries
        """
        if not HAS_PYARROW:
            raise ImportError("PyArrow is not available")
            
        start_time = time.time()
        
        try:
            # Get buffer from plasma store
            buffer = plasma_client.get(object_id)
            
            # Deserialize from Arrow buffer
            reader = RecordBatchStreamReader(pa.BufferReader(buffer))
            table = reader.read_all()
            
            # Convert to Python objects
            result = table.to_pylist()
            
            # Update statistics
            end_time = time.time()
            self.serialization_stats['arrow_deserializations'] += 1
            self.serialization_stats['bytes_deserialized'] += buffer.size
            self.serialization_stats['deserialization_time'] += (end_time - start_time)
            
            return result
        except Exception as e:
            logger.error(f"Error retrieving from Plasma: {e}")
            raise
    
    def get_stats(self) -> Dict[str, Any]:
        """Get serialization statistics"""
        stats = {**self.serialization_stats}
        
        # Add derived statistics
        total_serializations = stats['arrow_serializations'] + stats['json_serializations']
        if total_serializations > 0:
            stats['avg_serialization_time'] = stats['serialization_time'] / total_serializations
        else:
            stats['avg_serialization_time'] = 0
            
        total_deserializations = stats['arrow_deserializations'] + stats['json_deserializations']
        if total_deserializations > 0:
            stats['avg_deserialization_time'] = stats['deserialization_time'] / total_deserializations
        else:
            stats['avg_deserialization_time'] = 0
            
        # Add configuration
        stats['config'] = {
            'use_arrow': self.use_arrow,
            'compression': self.compression,
            'compression_level': self.compression_level,
            'use_dictionary': self.use_dictionary
        }
        
        return stats
    
    def reset_stats(self):
        """Reset serialization statistics"""
        self.serialization_stats = {
            'arrow_serializations': 0,
            'arrow_deserializations': 0,
            'json_serializations': 0,
            'json_deserializations': 0,
            'bytes_serialized': 0,
            'bytes_deserialized': 0,
            'serialization_time': 0.0,
            'deserialization_time': 0.0
        }

# Create default instance
default_serializer = ContentIndexSerializer()

def serialize_entries(entries: List[Dict[str, Any]]) -> bytes:
    """Serialize entries using default serializer"""
    return default_serializer.serialize_entries(entries)

def deserialize_entries(data: bytes) -> List[Dict[str, Any]]:
    """Deserialize entries using default serializer"""
    return default_serializer.deserialize_entries(data)

def create_serializer(**kwargs) -> ContentIndexSerializer:
    """Create a new serializer with specific options"""
    return ContentIndexSerializer(**kwargs)