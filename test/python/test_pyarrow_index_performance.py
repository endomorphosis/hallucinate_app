#!/usr/bin/env python3
"""
PyArrow Content Index Performance Testing Suite

This module implements comprehensive performance tests for the PyArrow Content Index
operations as specified in Phase 2.4 of the roadmap. It focuses on:
- Performance benchmarks for large datasets
- Memory usage optimization
- Pagination for large result sets
- Concurrency testing
"""

import unittest
import os
import time
import random
import string
import json
import gc
import tempfile
import threading
import multiprocessing
import concurrent.futures
import psutil
import memory_profiler
import sys
import logging
from functools import wraps
from typing import Dict, List, Any, Callable, Optional, Tuple, Union

# Add project path to import the necessary modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../hallucinate_app/python')))

try:
    # Import required modules
    from hallucinate_app.pyarrow_content_index import PyArrowContentIndex
    from hallucinate_app.pyarrow_content_index_integration import PyArrowContentIndexIntegration
    MODULES_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import PyArrow Content Index modules: {e}")
    print("Tests will use mock implementations")
    MODULES_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    handlers=[logging.StreamHandler(), logging.FileHandler('pyarrow_index_perf_test.log')])
logger = logging.getLogger('pyarrow_index_perf_test')

# Constants for performance testing
SMALL_DATASET_SIZE = 100
MEDIUM_DATASET_SIZE = 1000
LARGE_DATASET_SIZE = 10000
VERY_LARGE_DATASET_SIZE = 100000  # Be careful with this one
MAX_THREADS = 16
MAX_PROCESSES = 8


def timed(func):
    """
    Decorator to measure function execution time
    
    Args:
        func: The function to time
        
    Returns:
        Decorated function that logs execution time
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        logger.info(f"Function {func.__name__} took {end_time - start_time:.4f} seconds to execute")
        return result
    return wrapper


def measure_memory(func):
    """
    Decorator to measure memory usage during function execution
    
    Args:
        func: The function to measure
        
    Returns:
        Decorated function that logs memory usage
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        process = psutil.Process(os.getpid())
        gc.collect()  # Force garbage collection to start with a clean state
        
        # Measure starting memory
        memory_before = process.memory_info().rss / 1024 / 1024  # MB
        
        result = func(*args, **kwargs)
        
        # Measure ending memory
        gc.collect()  # Force garbage collection to clean up temporary objects
        memory_after = process.memory_info().rss / 1024 / 1024  # MB
        memory_diff = memory_after - memory_before
        
        logger.info(f"Function {func.__name__} memory usage: {memory_diff:.2f} MB")
        return result
    return wrapper


class MockPyArrowContentIndex:
    """
    Mock implementation of PyArrowContentIndex for testing when the real module is not available.
    Simulates basic functionality for test cases.
    """
    def __init__(self, index_path=None, ipfs_client=None):
        self.index_path = index_path or tempfile.mktemp(suffix='.arrow')
        self.ipfs_client = ipfs_client
        self.entries = {}
        self.stats = {
            'entry_count': 0,
            'size_distribution': {},
            'type_distribution': {},
            'operations': {
                'reads': 0,
                'writes': 0,
                'deletes': 0,
                'queries': 0
            }
        }
        
    def lookup_by_cid(self, cid):
        """Look up content by CID"""
        self.stats['operations']['reads'] += 1
        return self.entries.get(cid)
    
    def lookup_by_path(self, path):
        """Look up content by path"""
        self.stats['operations']['reads'] += 1
        for entry in self.entries.values():
            if entry.get('path') == path:
                return entry
        return None
    
    def add_entry(self, entry):
        """Add an entry to the index"""
        if 'cid' not in entry:
            raise ValueError("Entry must have a 'cid' field")
        
        self.stats['operations']['writes'] += 1
        self.entries[entry['cid']] = entry
        self.stats['entry_count'] = len(self.entries)
        
        # Update stats
        if 'size' in entry:
            size_range = f"{entry['size'] // 1024 // 1024}MB+" if entry['size'] >= 1024*1024 else f"{entry['size'] // 1024}KB+"
            self.stats['size_distribution'][size_range] = self.stats['size_distribution'].get(size_range, 0) + 1
            
        if 'mimetype' in entry:
            mime_type = entry['mimetype'].split('/')[0] if '/' in entry['mimetype'] else entry['mimetype']
            self.stats['type_distribution'][mime_type] = self.stats['type_distribution'].get(mime_type, 0) + 1
            
        return entry
    
    def update_entry(self, cid, update_data):
        """Update an entry in the index"""
        self.stats['operations']['writes'] += 1
        if cid in self.entries:
            self.entries[cid].update(update_data)
            return self.entries[cid]
        return None
    
    def delete_entry(self, cid):
        """Delete an entry from the index"""
        self.stats['operations']['deletes'] += 1
        if cid in self.entries:
            del self.entries[cid]
            self.stats['entry_count'] = len(self.entries)
            return True
        return False
    
    def query(self, params):
        """Query the index with filters"""
        self.stats['operations']['queries'] += 1
        results = list(self.entries.values())
        
        # Apply filter
        if 'filter' in params:
            # Simple filter implementation (this is just a mock)
            if 'mimetype' in params['filter']:
                mimetype = params['filter'].split('=')[1].strip("'")
                results = [entry for entry in results if entry.get('mimetype', '').startswith(mimetype)]
        
        # Apply sorting
        if 'sort' in params:
            field = params['sort']
            reverse = field.endswith('DESC')
            field = field.replace(' DESC', '').replace(' ASC', '')
            results.sort(key=lambda x: x.get(field, 0), reverse=reverse)
        
        # Apply pagination
        if 'limit' in params:
            limit = int(params['limit'])
            offset = int(params.get('offset', 0))
            results = results[offset:offset+limit]
            
        return results
    
    def get_stats(self):
        """Get index statistics"""
        return self.stats
    
    def save(self):
        """Save the index"""
        return True
    
    def test(self, verbose=False):
        """Self-test implementation"""
        return {
            'success': True,
            'module': 'MockPyArrowContentIndex',
            'operations': {
                'lookup_by_cid': {'success': True},
                'lookup_by_path': {'success': True},
                'add_entry': {'success': True},
                'update_entry': {'success': True},
                'delete_entry': {'success': True},
                'query': {'success': True},
                'get_stats': {'success': True},
                'save': {'success': True}
            }
        }


def generate_test_entry(index):
    """
    Generate a test entry with random data
    
    Args:
        index: Index for uniqueness
        
    Returns:
        Dictionary containing a test entry
    """
    mime_types = ['application/octet-stream', 'text/plain', 'image/jpeg', 'image/png', 
                'video/mp4', 'audio/mpeg', 'application/pdf', 'application/json']
    
    # Generate a reproducible CID-like string
    random.seed(index)
    cid = f"Qm{''.join(random.choice(string.ascii_letters + string.digits) for _ in range(44))}"
    
    # Reset random seed to avoid patterns
    random.seed(time.time() + index)
    
    entry = {
        'cid': cid,
        'path': f"/test/path/{index % 100}/file-{index}.txt",
        'mimetype': random.choice(mime_types),
        'size': random.randint(1024, 1024*1024*10),  # 1KB to 10MB
        'tags': random.sample(['test', 'performance', 'benchmark', 'pyarrow', 'content', 'index'], k=random.randint(1, 4)),
        'created_at': time.time() - random.randint(0, 3600*24*30),  # Up to 30 days ago
        'updated_at': time.time() - random.randint(0, 3600*24),  # Up to 1 day ago
        'test_index': index
    }
    return entry


class PyArrowContentIndexPerformanceTest(unittest.TestCase):
    """
    Performance and optimization test suite for PyArrow Content Index
    """
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment once for all tests"""
        cls.temp_dir = tempfile.mkdtemp()
        cls.index_path = os.path.join(cls.temp_dir, 'test_index.arrow')
        
        # Create index instance
        if MODULES_AVAILABLE:
            try:
                cls.index = PyArrowContentIndex(cls.index_path)
                logger.info("Using actual PyArrowContentIndex implementation")
            except Exception as e:
                logger.warning(f"Error creating PyArrowContentIndex: {e}")
                logger.info("Falling back to mock implementation")
                cls.index = MockPyArrowContentIndex(cls.index_path)
        else:
            logger.info("Using mock PyArrowContentIndex implementation")
            cls.index = MockPyArrowContentIndex(cls.index_path)
            
        # Create integration instance if available
        if MODULES_AVAILABLE:
            try:
                cls.integration = PyArrowContentIndexIntegration(
                    resources={'pyarrow_content_index': cls.index},
                    metadata={'index_path': cls.index_path}
                )
                logger.info("Using actual PyArrowContentIndexIntegration implementation")
            except Exception as e:
                logger.warning(f"Error creating PyArrowContentIndexIntegration: {e}")
                cls.integration = None
        else:
            cls.integration = None
            
        logger.info(f"Test suite initialized with index at {cls.index_path}")
    
    @classmethod
    def tearDownClass(cls):
        """Clean up test environment after all tests"""
        # Clean up temporary directory
        if hasattr(cls, 'temp_dir') and os.path.exists(cls.temp_dir):
            import shutil
            shutil.rmtree(cls.temp_dir)
            logger.info(f"Cleaned up temporary directory: {cls.temp_dir}")
    
    def setUp(self):
        """Set up test environment before each test"""
        # Clear the index before each test
        self.index.entries = {}
        self.index.stats = {
            'entry_count': 0,
            'size_distribution': {},
            'type_distribution': {},
            'operations': {
                'reads': 0,
                'writes': 0,
                'deletes': 0,
                'queries': 0
            }
        }
        
        # Force garbage collection to start with clean memory
        gc.collect()
    
    @timed
    def test_add_small_dataset(self):
        """Test adding a small dataset (100 entries)"""
        for i in range(SMALL_DATASET_SIZE):
            entry = generate_test_entry(i)
            self.index.add_entry(entry)
        
        stats = self.index.get_stats()
        self.assertEqual(stats['entry_count'], SMALL_DATASET_SIZE)
        logger.info(f"Added {SMALL_DATASET_SIZE} entries to index")
    
    @timed
    @measure_memory
    def test_add_medium_dataset(self):
        """Test adding a medium dataset (1000 entries)"""
        for i in range(MEDIUM_DATASET_SIZE):
            entry = generate_test_entry(i)
            self.index.add_entry(entry)
        
        stats = self.index.get_stats()
        self.assertEqual(stats['entry_count'], MEDIUM_DATASET_SIZE)
        logger.info(f"Added {MEDIUM_DATASET_SIZE} entries to index")
    
    @timed
    @measure_memory
    def test_add_large_dataset(self):
        """Test adding a large dataset (10000 entries)"""
        for i in range(LARGE_DATASET_SIZE):
            entry = generate_test_entry(i)
            self.index.add_entry(entry)
        
        stats = self.index.get_stats()
        self.assertEqual(stats['entry_count'], LARGE_DATASET_SIZE)
        logger.info(f"Added {LARGE_DATASET_SIZE} entries to index")
    
    @timed
    @measure_memory
    def test_batch_add_performance(self):
        """Test batch add performance for different batch sizes"""
        batch_sizes = [10, 100, 1000]
        entries_to_add = 5000
        
        results = {}
        for batch_size in batch_sizes:
            start_time = time.time()
            
            # Add entries in batches
            for i in range(0, entries_to_add, batch_size):
                batch = [generate_test_entry(i + j) for j in range(min(batch_size, entries_to_add - i))]
                for entry in batch:
                    self.index.add_entry(entry)
            
            end_time = time.time()
            elapsed = end_time - start_time
            entries_per_second = entries_to_add / elapsed
            
            # Clear the index for the next batch size test
            self.index.entries = {}
            self.index.stats['entry_count'] = 0
            
            results[batch_size] = {
                'time': elapsed,
                'entries_per_second': entries_per_second
            }
            
            logger.info(f"Batch size {batch_size}: Added {entries_to_add} entries in {elapsed:.2f}s ({entries_per_second:.2f}/s)")
        
        # Log overall results
        logger.info(f"Batch add performance results: {json.dumps(results, indent=2)}")
    
    @timed
    def test_lookup_performance(self):
        """Test lookup performance"""
        # Add test data
        entries = [generate_test_entry(i) for i in range(MEDIUM_DATASET_SIZE)]
        for entry in entries:
            self.index.add_entry(entry)
        
        # Test CID-based lookup
        start_time = time.time()
        lookup_count = 1000
        for i in range(lookup_count):
            # Look up both existing and non-existing CIDs
            if i % 2 == 0 and entries:
                # Look up existing CID
                entry = random.choice(entries)
                result = self.index.lookup_by_cid(entry['cid'])
                self.assertIsNotNone(result)
            else:
                # Look up non-existing CID
                result = self.index.lookup_by_cid(f"NonExistingCID{i}")
                self.assertIsNone(result)
        
        end_time = time.time()
        elapsed = end_time - start_time
        lookups_per_second = lookup_count / elapsed
        
        logger.info(f"Lookup performance: {lookup_count} lookups in {elapsed:.2f}s ({lookups_per_second:.2f}/s)")
    
    @timed
    def test_query_performance(self):
        """Test query performance with different filter and sort combinations"""
        # Add test data
        entries = [generate_test_entry(i) for i in range(MEDIUM_DATASET_SIZE)]
        for entry in entries:
            self.index.add_entry(entry)
        
        # Test different query patterns
        query_patterns = [
            {'filter': "mimetype LIKE 'image/%'"},
            {'filter': "size > 1000000", 'sort': 'size DESC'},
            {'filter': "path LIKE '/test/path/0/%'", 'sort': 'created_at ASC'},
            {'sort': 'size DESC', 'limit': 100},
            {'sort': 'created_at DESC', 'limit': 50, 'offset': 50},
        ]
        
        results = {}
        for i, query in enumerate(query_patterns):
            start_time = time.time()
            
            # Run the query multiple times to measure average performance
            iterations = 10
            result_count = 0
            
            for _ in range(iterations):
                result = self.index.query(query)
                result_count = len(result)
            
            end_time = time.time()
            elapsed = (end_time - start_time) / iterations
            
            results[f"query_{i}"] = {
                'query': query,
                'avg_time': elapsed,
                'result_count': result_count
            }
            
            logger.info(f"Query {i} ({query}): avg {elapsed:.4f}s, returned {result_count} results")
        
        # Log overall results
        logger.info(f"Query performance results: {json.dumps(results, indent=2)}")
    
    @timed
    @measure_memory
    def test_pagination_performance(self):
        """Test pagination performance for large result sets"""
        # Add test data - use larger dataset to test pagination properly
        entries = [generate_test_entry(i) for i in range(LARGE_DATASET_SIZE)]
        for entry in entries:
            self.index.add_entry(entry)
        
        # Test different page sizes
        page_sizes = [10, 50, 100, 500, 1000]
        
        results = {}
        for page_size in page_sizes:
            page_times = []
            
            # Test fetching first 10 pages
            max_pages = 10
            
            for page in range(max_pages):
                start_time = time.time()
                
                offset = page * page_size
                query = {
                    'sort': 'created_at DESC',
                    'limit': page_size,
                    'offset': offset
                }
                
                result = self.index.query(query)
                
                end_time = time.time()
                elapsed = end_time - start_time
                page_times.append(elapsed)
                
                self.assertEqual(len(result), page_size if offset + page_size <= LARGE_DATASET_SIZE else LARGE_DATASET_SIZE - offset)
            
            results[page_size] = {
                'avg_time': sum(page_times) / len(page_times),
                'min_time': min(page_times),
                'max_time': max(page_times),
                'times': page_times
            }
            
            logger.info(f"Pagination with page size {page_size}: avg {results[page_size]['avg_time']:.4f}s per page")
        
        # Log overall results
        logger.info(f"Pagination performance summary: {json.dumps({k: {'avg': v['avg_time'], 'min': v['min_time'], 'max': v['max_time']} for k, v in results.items()}, indent=2)}")
    
    @timed
    def test_concurrent_read_performance(self):
        """Test concurrent read performance"""
        # Add test data
        entries = [generate_test_entry(i) for i in range(MEDIUM_DATASET_SIZE)]
        for entry in entries:
            self.index.add_entry(entry)
        
        # Function to run in threads
        def lookup_entries(thread_id, num_lookups):
            results = []
            for i in range(num_lookups):
                # Alternate between CID and path lookups
                if i % 2 == 0:
                    entry = entries[random.randint(0, len(entries) - 1)]
                    result = self.index.lookup_by_cid(entry['cid'])
                    results.append(result is not None)
                else:
                    entry = entries[random.randint(0, len(entries) - 1)]
                    result = self.index.lookup_by_path(entry['path'])
                    results.append(result is not None)
            return results
        
        # Test with different thread counts
        thread_counts = [1, 2, 4, 8, MAX_THREADS]
        lookups_per_thread = 100
        
        results = {}
        for thread_count in thread_counts:
            start_time = time.time()
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
                futures = [executor.submit(lookup_entries, i, lookups_per_thread) for i in range(thread_count)]
                concurrent.futures.wait(futures)
                
                # Get results
                thread_results = [future.result() for future in futures]
                success_rate = sum(sum(results) for results in thread_results) / (thread_count * lookups_per_thread)
            
            end_time = time.time()
            elapsed = end_time - start_time
            total_lookups = thread_count * lookups_per_thread
            lookups_per_second = total_lookups / elapsed
            
            results[thread_count] = {
                'time': elapsed,
                'total_lookups': total_lookups,
                'lookups_per_second': lookups_per_second,
                'success_rate': success_rate
            }
            
            logger.info(f"Concurrent reads with {thread_count} threads: {total_lookups} lookups in {elapsed:.2f}s ({lookups_per_second:.2f}/s), success rate: {success_rate:.2%}")
        
        # Log overall results
        logger.info(f"Concurrent read performance results: {json.dumps(results, indent=2)}")
    
    @timed
    def test_concurrent_write_performance(self):
        """Test concurrent write performance"""
        # Function to run in threads
        def add_entries(thread_id, num_entries):
            results = []
            for i in range(num_entries):
                entry = generate_test_entry(thread_id * 10000 + i)  # Ensure unique CIDs across threads
                try:
                    result = self.index.add_entry(entry)
                    results.append(result is not None)
                except Exception as e:
                    logger.error(f"Error in thread {thread_id} adding entry {i}: {e}")
                    results.append(False)
            return results
        
        # Test with different thread counts
        thread_counts = [1, 2, 4, 8, MAX_THREADS]
        entries_per_thread = 100
        
        results = {}
        for thread_count in thread_counts:
            # Clear the index before each test
            self.index.entries = {}
            self.index.stats['entry_count'] = 0
            
            start_time = time.time()
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
                futures = [executor.submit(add_entries, i, entries_per_thread) for i in range(thread_count)]
                concurrent.futures.wait(futures)
                
                # Get results
                thread_results = [future.result() for future in futures]
                success_rate = sum(sum(results) for results in thread_results) / (thread_count * entries_per_thread)
            
            end_time = time.time()
            elapsed = end_time - start_time
            total_entries = thread_count * entries_per_thread
            entries_per_second = total_entries / elapsed
            
            results[thread_count] = {
                'time': elapsed,
                'total_entries': total_entries,
                'entries_per_second': entries_per_second,
                'success_rate': success_rate,
                'final_count': self.index.get_stats()['entry_count']
            }
            
            logger.info(f"Concurrent writes with {thread_count} threads: {total_entries} entries in {elapsed:.2f}s ({entries_per_second:.2f}/s), success rate: {success_rate:.2%}, final count: {self.index.get_stats()['entry_count']}")
        
        # Log overall results
        logger.info(f"Concurrent write performance results: {json.dumps(results, indent=2)}")
    
    @timed
    @measure_memory
    def test_mixed_workload_performance(self):
        """Test performance with a mixed read/write/query workload"""
        # Initialize with some data
        initial_entries = [generate_test_entry(i) for i in range(1000)]
        for entry in initial_entries:
            self.index.add_entry(entry)
        
        # Define mixed operations
        def mixed_operations(thread_id, num_ops):
            results = {'reads': 0, 'writes': 0, 'queries': 0, 'deletes': 0, 'errors': 0}
            for i in range(num_ops):
                operation = random.choices(['read', 'write', 'query', 'delete'], weights=[0.7, 0.1, 0.15, 0.05])[0]
                try:
                    if operation == 'read':
                        # Perform read
                        if i % 2 == 0 and initial_entries:
                            entry = random.choice(initial_entries)
                            result = self.index.lookup_by_cid(entry['cid'])
                        else:
                            # Mix in some lookups for non-existent CIDs
                            result = self.index.lookup_by_cid(f"NonExistingCID{thread_id}-{i}")
                        results['reads'] += 1
                    elif operation == 'write':
                        # Perform write (add or update)
                        if i % 3 == 0 and initial_entries:
                            # Update
                            entry = random.choice(initial_entries)
                            update_data = {'updated_at': time.time(), 'test_update': f"update-{thread_id}-{i}"}
                            self.index.update_entry(entry['cid'], update_data)
                        else:
                            # Add
                            entry = generate_test_entry(1000000 + thread_id * 10000 + i)
                            self.index.add_entry(entry)
                        results['writes'] += 1
                    elif operation == 'query':
                        # Perform query
                        query_type = random.randint(0, 3)
                        if query_type == 0:
                            query = {'filter': "mimetype LIKE 'image/%'"}
                        elif query_type == 1:
                            query = {'filter': "size > 1000000", 'sort': 'size DESC', 'limit': 20}
                        elif query_type == 2:
                            query = {'sort': 'created_at DESC', 'limit': 10, 'offset': random.randint(0, 100)}
                        else:
                            query = {'filter': f"test_index >= {random.randint(0, 900)}", 'limit': 50}
                        
                        self.index.query(query)
                        results['queries'] += 1
                    elif operation == 'delete':
                        # Perform delete
                        if initial_entries:
                            entry = random.choice(initial_entries)
                            self.index.delete_entry(entry['cid'])
                            initial_entries.remove(entry)
                        results['deletes'] += 1
                except Exception as e:
                    logger.error(f"Error in thread {thread_id}, operation {operation}, iteration {i}: {e}")
                    results['errors'] += 1
            
            return results
        
        # Test with different thread counts
        thread_counts = [1, 2, 4, 8, MAX_THREADS]
        operations_per_thread = 100
        
        results = {}
        for thread_count in thread_counts:
            start_time = time.time()
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
                futures = [executor.submit(mixed_operations, i, operations_per_thread) for i in range(thread_count)]
                concurrent.futures.wait(futures)
                
                # Aggregate results
                thread_results = [future.result() for future in futures]
                aggregated = {
                    'reads': sum(r['reads'] for r in thread_results),
                    'writes': sum(r['writes'] for r in thread_results),
                    'queries': sum(r['queries'] for r in thread_results),
                    'deletes': sum(r['deletes'] for r in thread_results),
                    'errors': sum(r['errors'] for r in thread_results)
                }
                
            end_time = time.time()
            elapsed = end_time - start_time
            total_ops = thread_count * operations_per_thread
            ops_per_second = total_ops / elapsed
            
            results[thread_count] = {
                'time': elapsed,
                'total_ops': total_ops,
                'ops_per_second': ops_per_second,
                'operations': aggregated,
                'final_count': self.index.get_stats()['entry_count']
            }
            
            logger.info(f"Mixed workload with {thread_count} threads: {total_ops} operations in {elapsed:.2f}s ({ops_per_second:.2f}/s)")
            logger.info(f"Operation breakdown: {json.dumps(aggregated, indent=2)}")
        
        # Log overall results
        logger.info(f"Mixed workload performance results: {json.dumps(results, indent=2)}")
    
    @unittest.skipIf(not MODULES_AVAILABLE, "Skipping multi-process test as modules are not available")
    @timed
    def test_multi_process_performance(self):
        """Test performance in a multi-process environment (requires real implementation)"""
        if not MODULES_AVAILABLE or not hasattr(self, 'integration') or self.integration is None:
            self.skipTest("Integration module not available for multi-process test")
        
        # This test requires the actual implementation to be meaningful
        # It tests the PyArrow Content Index in a multi-process environment
        
        # Initialize with some data before spawning processes
        initial_size = 1000
        for i in range(initial_size):
            entry = generate_test_entry(i)
            self.index.add_entry(entry)
        
        # Ensure index is saved to disk for processes to load
        self.index.save()
        
        # Define worker function that will run in separate processes
        def worker_process(process_id, index_path, num_ops):
            # Create a new index instance that loads from the same file
            try:
                if MODULES_AVAILABLE:
                    from hallucinate_app.pyarrow_content_index import PyArrowContentIndex
                    index = PyArrowContentIndex(index_path)
                else:
                    index = MockPyArrowContentIndex(index_path)
                
                results = {'reads': 0, 'queries': 0, 'errors': 0}
                
                # Perform read-only operations to avoid write conflicts
                for i in range(num_ops):
                    try:
                        if i % 2 == 0:
                            # Lookup operation
                            cid = f"Qm{''.join(random.choice(string.ascii_letters + string.digits) for _ in range(44))}"
                            index.lookup_by_cid(cid)
                            results['reads'] += 1
                        else:
                            # Query operation
                            query_type = i % 4
                            if query_type == 0:
                                query = {'filter': "mimetype LIKE 'image/%'"}
                            elif query_type == 1:
                                query = {'filter': "size > 1000000", 'sort': 'size DESC', 'limit': 20}
                            elif query_type == 2:
                                query = {'sort': 'created_at DESC', 'limit': 10, 'offset': random.randint(0, 100)}
                            else:
                                query = {'filter': f"test_index >= {random.randint(0, 900)}", 'limit': 50}
                            
                            index.query(query)
                            results['queries'] += 1
                    except Exception as e:
                        print(f"Error in process {process_id}, operation {i}: {e}")
                        results['errors'] += 1
                
                return results
            except Exception as e:
                print(f"Critical error initializing process {process_id}: {e}")
                return {'reads': 0, 'queries': 0, 'errors': num_ops}
        
        # Test with different process counts
        process_counts = [1, 2, 4, min(8, multiprocessing.cpu_count())]
        operations_per_process = 50
        
        results = {}
        for process_count in process_counts:
            start_time = time.time()
            
            with concurrent.futures.ProcessPoolExecutor(max_workers=process_count) as executor:
                futures = [executor.submit(worker_process, i, self.index_path, operations_per_process) 
                          for i in range(process_count)]
                concurrent.futures.wait(futures)
                
                # Aggregate results
                process_results = [future.result() for future in futures]
                aggregated = {
                    'reads': sum(r['reads'] for r in process_results),
                    'queries': sum(r['queries'] for r in process_results),
                    'errors': sum(r['errors'] for r in process_results)
                }
            
            end_time = time.time()
            elapsed = end_time - start_time
            total_ops = process_count * operations_per_process
            ops_per_second = total_ops / elapsed
            
            results[process_count] = {
                'time': elapsed,
                'total_ops': total_ops,
                'ops_per_second': ops_per_second,
                'operations': aggregated
            }
            
            logger.info(f"Multi-process workload with {process_count} processes: {total_ops} operations in {elapsed:.2f}s ({ops_per_second:.2f}/s)")
            logger.info(f"Operation breakdown: {json.dumps(aggregated, indent=2)}")
        
        # Log overall results
        logger.info(f"Multi-process performance results: {json.dumps(results, indent=2)}")
    
    @memory_profiler.profile
    def test_memory_optimization_large_dataset(self):
        """Test memory optimization with a large dataset"""
        # Skip detailed profiling in normal test runs, manually run this test separately
        self.skipTest("This test is for manual profiling only")
        
        # Set up a large dataset and measure memory usage during operations
        entries = []
        for i in range(LARGE_DATASET_SIZE):
            entry = generate_test_entry(i)
            entries.append(entry)
        
        # Add entries in chunks to measure incremental memory usage
        chunk_size = 1000
        for i in range(0, len(entries), chunk_size):
            chunk = entries[i:i+chunk_size]
            for entry in chunk:
                self.index.add_entry(entry)
            
            # Force garbage collection to measure stable memory usage
            gc.collect()
            
            # Log memory usage after each chunk
            process = psutil.Process(os.getpid())
            memory_usage = process.memory_info().rss / 1024 / 1024  # MB
            logger.info(f"Memory usage after adding {i + len(chunk)} entries: {memory_usage:.2f} MB")
        
        # Now perform a series of queries and measure memory
        query_types = [
            {'filter': "mimetype LIKE 'image/%'"},
            {'filter': "size > 1000000", 'sort': 'size DESC', 'limit': 100},
            {'filter': "path LIKE '/test/path/0/%'", 'sort': 'created_at ASC'},
            {'sort': 'size DESC', 'limit': 1000},
            {'sort': 'created_at DESC', 'limit': 500, 'offset': 500},
        ]
        
        for i, query in enumerate(query_types):
            # Perform query
            results = self.index.query(query)
            
            # Measure memory
            gc.collect()
            process = psutil.Process(os.getpid())
            memory_usage = process.memory_info().rss / 1024 / 1024  # MB
            
            logger.info(f"Memory usage after query {i} (returned {len(results)} results): {memory_usage:.2f} MB")
        
        # Perform a save operation and measure memory
        self.index.save()
        
        gc.collect()
        process = psutil.Process(os.getpid())
        memory_usage = process.memory_info().rss / 1024 / 1024  # MB
        
        logger.info(f"Memory usage after save operation: {memory_usage:.2f} MB")
        
        # Final memory statistics
        logger.info(f"Final memory usage with {LARGE_DATASET_SIZE} entries: {memory_usage:.2f} MB")
        logger.info(f"Memory usage per entry: {memory_usage / LARGE_DATASET_SIZE:.4f} MB")


if __name__ == '__main__':
    # Configure command-line options
    import argparse
    
    parser = argparse.ArgumentParser(description='PyArrow Content Index Performance Testing')
    parser.add_argument('--large', action='store_true', help='Include large dataset tests')
    parser.add_argument('--very-large', action='store_true', help='Include very large dataset tests')
    parser.add_argument('--memory-profile', action='store_true', help='Run memory profiling tests')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    parser.add_argument('-l', '--log-file', type=str, default='pyarrow_index_perf_test.log', help='Log file')
    args = parser.parse_args()
    
    # Configure logging based on verbosity
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logger.setLevel(log_level)
    
    # Add file handler if specified
    if args.log_file:
        file_handler = logging.FileHandler(args.log_file)
        file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        logger.addHandler(file_handler)
    
    # Run the tests
    start_time = time.time()
    suite = unittest.TestSuite()
    
    # Add tests based on command-line options
    loader = unittest.TestLoader()
    all_tests = loader.loadTestsFromTestCase(PyArrowContentIndexPerformanceTest)
    
    if not args.large and not args.very_large and not args.memory_profile:
        # Run only small and medium tests by default
        for test in all_tests:
            if 'large_dataset' not in test._testMethodName and 'very_large_dataset' not in test._testMethodName and 'memory_optimization' not in test._testMethodName:
                suite.addTest(test)
    else:
        if args.large:
            # Include large dataset tests
            for test in all_tests:
                if 'large_dataset' in test._testMethodName and 'very_large_dataset' not in test._testMethodName:
                    suite.addTest(test)
        
        if args.very_large:
            # Include very large dataset tests
            for test in all_tests:
                if 'very_large_dataset' in test._testMethodName:
                    suite.addTest(test)
        
        if args.memory_profile:
            # Include memory profiling tests
            for test in all_tests:
                if 'memory_optimization' in test._testMethodName:
                    suite.addTest(test)
    
    # Run the test suite
    runner = unittest.TextTestRunner(verbosity=2 if args.verbose else 1)
    result = runner.run(suite)
    
    end_time = time.time()
    elapsed = end_time - start_time
    
    # Log test completion
    logger.info(f"Performance test suite completed in {elapsed:.2f}s")
    logger.info(f"Results: {result.testsRun} tests run, {len(result.errors)} errors, {len(result.failures)} failures")
    
    # Generate a more detailed report
    if hasattr(result, 'testsRun') and result.testsRun > 0:
        results_summary = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "duration": elapsed,
            "tests_run": result.testsRun,
            "errors": len(result.errors),
            "failures": len(result.failures),
            "success_rate": (result.testsRun - len(result.errors) - len(result.failures)) / result.testsRun
        }
        
        # Write results to JSON file
        with open('pyarrow_index_perf_results.json', 'w') as f:
            json.dump(results_summary, f, indent=2)
        
        logger.info(f"Test results saved to pyarrow_index_perf_results.json")
    
    # Exit with proper code
    sys.exit(len(result.errors) + len(result.failures))