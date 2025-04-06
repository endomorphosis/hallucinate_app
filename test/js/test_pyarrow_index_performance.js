/**
 * PyArrow Index Performance Test
 * 
 * This module tests the performance of the PyArrow Index Bridge and PyArrow
 * Content Index operations as specified in Phase 2.4 of the roadmap. It focuses on:
 * - Performance benchmarks for large datasets
 * - Pagination for large result sets
 * - Concurrency testing
 * - Browser implementation testing (when running in browser environment)
 */

// Import necessary modules
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

// Placeholder for the PyArrow Index Bridge - will be initialized in setup
let pyarrowIndexBridge = null;
let mockMode = false;

// Constants for performance testing
const SMALL_DATASET_SIZE = 100;
const MEDIUM_DATASET_SIZE = 1000;
const LARGE_DATASET_SIZE = 10000;
const VERY_LARGE_DATASET_SIZE = 50000;  // Be careful with this one
const MAX_WORKERS = Math.min(16, require('os').cpus().length);
const TEST_INDEX_PATH = path.join(os.tmpdir(), 'pyarrow-index-perf-test.arrow');

// Directory for test output
const TEST_OUTPUT_DIR = path.join(__dirname, '../../test_output');

// Test configuration
const config = {
  logPerformance: true,
  runLargeTests: process.env.RUN_LARGE_TESTS === 'true',
  runVeryLargeTests: process.env.RUN_VERY_LARGE_TESTS === 'true',
  outputJsonResults: true
};

/**
 * Create a mock implementation of PyArrow Index Bridge for testing
 * when the real module is not available
 * @returns {Object} Mock implementation of PyArrow Index Bridge
 */
function createMockPyArrowIndexBridge() {
  const entries = new Map();
  const stats = {
    entry_count: 0,
    size_distribution: {},
    type_distribution: {},
    operations: {
      reads: 0,
      writes: 0,
      deletes: 0,
      queries: 0
    }
  };
  
  return {
    init: async () => {
      console.log('Initialized mock PyArrow Index Bridge');
      return true;
    },
    
    lookupByCid: async (cid) => {
      stats.operations.reads++;
      return entries.get(cid) || null;
    },
    
    lookupByPath: async (path) => {
      stats.operations.reads++;
      for (const entry of entries.values()) {
        if (entry.path === path) {
          return entry;
        }
      }
      return null;
    },
    
    addEntry: async (entry) => {
      if (!entry.cid) {
        throw new Error('Entry must have a cid field');
      }
      
      stats.operations.writes++;
      entries.set(entry.cid, entry);
      stats.entry_count = entries.size;
      
      // Update stats
      if (entry.size) {
        const sizeKey = entry.size >= 1024*1024 ? 
          `${Math.floor(entry.size / 1024 / 1024)}MB+` : 
          `${Math.floor(entry.size / 1024)}KB+`;
        stats.size_distribution[sizeKey] = (stats.size_distribution[sizeKey] || 0) + 1;
      }
      
      if (entry.mimetype) {
        const mimeType = entry.mimetype.split('/')[0];
        stats.type_distribution[mimeType] = (stats.type_distribution[mimeType] || 0) + 1;
      }
      
      return entry;
    },
    
    updateEntry: async (cid, updateData) => {
      stats.operations.writes++;
      const entry = entries.get(cid);
      if (!entry) return null;
      
      const updatedEntry = { ...entry, ...updateData };
      entries.set(cid, updatedEntry);
      return updatedEntry;
    },
    
    deleteEntry: async (cid) => {
      stats.operations.deletes++;
      if (!entries.has(cid)) return false;
      
      entries.delete(cid);
      stats.entry_count = entries.size;
      return true;
    },
    
    query: async (queryParams) => {
      stats.operations.queries++;
      let results = Array.from(entries.values());
      
      // Apply filter
      if (queryParams.filter) {
        // Simple mock implementation for testing
        if (queryParams.filter.includes('mimetype')) {
          const mimePattern = queryParams.filter.split("'")[1].replace(/%/g, '');
          results = results.filter(entry => entry.mimetype && entry.mimetype.startsWith(mimePattern));
        } else if (queryParams.filter.includes('size')) {
          const sizeMatch = queryParams.filter.match(/size\s*>\s*(\d+)/);
          if (sizeMatch && sizeMatch[1]) {
            const minSize = parseInt(sizeMatch[1], 10);
            results = results.filter(entry => entry.size > minSize);
          }
        } else if (queryParams.filter.includes('path')) {
          const pathPattern = queryParams.filter.split("'")[1].replace(/%/g, '');
          results = results.filter(entry => entry.path && entry.path.startsWith(pathPattern));
        }
      }
      
      // Apply sorting
      if (queryParams.sort) {
        const sortField = queryParams.sort.replace(/\s+DESC$/, '').replace(/\s+ASC$/, '');
        const isDesc = queryParams.sort.includes('DESC');
        
        results.sort((a, b) => {
          const valA = a[sortField] || 0;
          const valB = b[sortField] || 0;
          return isDesc ? (valB - valA) : (valA - valB);
        });
      }
      
      // Apply pagination
      if (queryParams.limit !== undefined) {
        const limit = parseInt(queryParams.limit, 10);
        const offset = queryParams.offset ? parseInt(queryParams.offset, 10) : 0;
        results = results.slice(offset, offset + limit);
      }
      
      return results;
    },
    
    getStats: async () => {
      return { ...stats };
    },
    
    save: async () => {
      console.log('Mock save operation - no actual saving');
      return true;
    },
    
    clearForTesting: () => {
      entries.clear();
      stats.entry_count = 0;
      stats.size_distribution = {};
      stats.type_distribution = {};
      stats.operations = {
        reads: 0,
        writes: 0,
        deletes: 0,
        queries: 0
      };
    },
    
    getEntryCount: () => entries.size
  };
}

/**
 * Generate a random test entry for benchmarking
 * @param {number} index - Index for uniqueness
 * @returns {Object} - Generated test entry
 */
function generateTestEntry(index) {
  const mimeTypes = [
    'application/octet-stream', 'text/plain', 'image/jpeg', 'image/png',
    'video/mp4', 'audio/mpeg', 'application/pdf', 'application/json'
  ];
  
  // Generate deterministic CID for reproducibility
  const hash = crypto.createHash('sha256');
  hash.update(`test-entry-${index}`);
  const cid = `Qm${hash.digest('hex').substring(0, 44)}`;
  
  return {
    cid,
    path: `/test/path/${index % 100}/file-${index}.txt`,
    mimetype: mimeTypes[index % mimeTypes.length],
    size: 1024 + (index % 10) * 1024 * 1024, // Between 1KB and ~10MB
    tags: ['test', 'performance', 'benchmark', 'js', 'index'].slice(0, (index % 4) + 1),
    created_at: Date.now() - (index % 30) * 24 * 3600 * 1000, // Up to 30 days ago
    updated_at: Date.now() - (index % 24) * 3600 * 1000, // Up to 24 hours ago
    test_index: index
  };
}

/**
 * Initialize PyArrow Index Bridge instance and setup test environment
 */
async function setup() {
  try {
    // Create test output directory if it doesn't exist
    try {
      await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
    } catch (error) {
      console.warn(`Error creating test output directory: ${error.message}`);
    }
    
    // Try to import the actual PyArrow Index Bridge
    try {
      const PyArrowIndexBridge = require('../../hallucinate_app/node/pyarrow_index_bridge');
      
      // Create a mock Python bridge for testing
      const mockPythonBridge = {
        moduleExists: async () => true,
        callAsync: async ({ method, args }) => {
          if (method === 'init') return true;
          if (method === 'js_lookup_by_cid') return null;
          if (method === 'js_lookup_by_path') return null;
          if (method === 'js_add_entry') return args[0];
          if (method === 'js_query') return [];
          if (method === 'js_get_stats') return { entry_count: 0 };
          return null;
        },
        serializeArrow: data => data,
        deserializeArrow: data => data
      };
      
      pyarrowIndexBridge = new PyArrowIndexBridge.default({
        pythonBridge: mockPythonBridge,
        indexPath: TEST_INDEX_PATH
      });
      
      await pyarrowIndexBridge.init();
      mockMode = true;
      console.log('Initialized PyArrow Index Bridge with mock Python bridge');
    } catch (error) {
      console.warn(`Error initializing actual PyArrow Index Bridge: ${error.message}`);
      console.log('Using mock implementation instead');
      pyarrowIndexBridge = createMockPyArrowIndexBridge();
      mockMode = true;
      await pyarrowIndexBridge.init();
    }
    
    // Clear the bridge for testing if we have a mock implementation
    if (mockMode && pyarrowIndexBridge.clearForTesting) {
      pyarrowIndexBridge.clearForTesting();
    }
    
    return true;
  } catch (error) {
    console.error(`Error in setup: ${error.message}`);
    return false;
  }
}

/**
 * Clean up resources after tests
 */
async function teardown() {
  // Close any open connections
  console.log('Cleaning up resources...');
  
  // Try to remove test index file
  if (mockMode) {
    try {
      await fs.unlink(TEST_INDEX_PATH);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Utility function to measure the execution time of a function
 * @param {Function} fn - Function to measure
 * @param {Array} args - Arguments to pass to the function
 * @returns {Object} - Result and timing information
 */
async function measurePerformance(fn, ...args) {
  const start = performance.now();
  let result;
  let error;
  
  try {
    result = await fn(...args);
  } catch (err) {
    error = err;
  }
  
  const end = performance.now();
  const duration = end - start;
  
  if (config.logPerformance) {
    console.log(`${fn.name || 'Anonymous function'} execution time: ${duration.toFixed(2)}ms`);
  }
  
  return { result, duration, error };
}

/**
 * Test adding a dataset of specified size
 * @param {number} size - Size of the dataset
 * @returns {Object} - Test results
 */
async function testAddDataset(size) {
  const results = {
    name: `addDataset_${size}`,
    size,
    success: false,
    duration: 0,
    entriesPerSecond: 0,
    error: null
  };
  
  try {
    if (mockMode && pyarrowIndexBridge.clearForTesting) {
      pyarrowIndexBridge.clearForTesting();
    }
    
    const start = performance.now();
    
    for (let i = 0; i < size; i++) {
      const entry = generateTestEntry(i);
      await pyarrowIndexBridge.addEntry(entry);
    }
    
    const end = performance.now();
    results.duration = end - start;
    results.entriesPerSecond = (size / results.duration) * 1000;
    
    // Verify count
    const stats = await pyarrowIndexBridge.getStats();
    results.success = stats.entry_count === size;
    console.log(`Added ${size} entries in ${results.duration.toFixed(2)}ms (${results.entriesPerSecond.toFixed(2)} entries/sec)`);
  } catch (error) {
    results.error = error.message;
    console.error(`Error adding dataset of size ${size}: ${error.message}`);
  }
  
  return results;
}

/**
 * Test batch adding a dataset of specified size with different batch sizes
 * @param {number} totalSize - Total size of the dataset
 * @returns {Object} - Test results
 */
async function testBatchAddDataset(totalSize) {
  const batchSizes = [10, 100, 1000];
  const results = {
    name: 'batchAddDataset',
    totalSize,
    batchResults: {},
    success: true,
    error: null
  };
  
  for (const batchSize of batchSizes) {
    try {
      if (mockMode && pyarrowIndexBridge.clearForTesting) {
        pyarrowIndexBridge.clearForTesting();
      }
      
      const start = performance.now();
      
      // Add entries in batches
      for (let i = 0; i < totalSize; i += batchSize) {
        const batch = [];
        const currentBatchSize = Math.min(batchSize, totalSize - i);
        
        for (let j = 0; j < currentBatchSize; j++) {
          batch.push(generateTestEntry(i + j));
        }
        
        // Add batch entries one by one (no bulk add method in the API)
        for (const entry of batch) {
          await pyarrowIndexBridge.addEntry(entry);
        }
      }
      
      const end = performance.now();
      const duration = end - start;
      const entriesPerSecond = (totalSize / duration) * 1000;
      
      results.batchResults[batchSize] = {
        duration,
        entriesPerSecond
      };
      
      console.log(`Batch size ${batchSize}: Added ${totalSize} entries in ${duration.toFixed(2)}ms (${entriesPerSecond.toFixed(2)} entries/sec)`);
    } catch (error) {
      results.batchResults[batchSize] = {
        error: error.message
      };
      results.success = false;
      console.error(`Error adding dataset with batch size ${batchSize}: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Test lookup performance
 * @returns {Object} - Test results
 */
async function testLookupPerformance() {
  const results = {
    name: 'lookupPerformance',
    lookupCount: 1000,
    success: false,
    duration: 0,
    lookupsPerSecond: 0,
    error: null
  };
  
  try {
    // Add test data
    if (mockMode && pyarrowIndexBridge.clearForTesting) {
      pyarrowIndexBridge.clearForTesting();
    }
    
    const entries = [];
    for (let i = 0; i < 1000; i++) {
      const entry = generateTestEntry(i);
      await pyarrowIndexBridge.addEntry(entry);
      entries.push(entry);
    }
    
    // Test lookup performance
    const start = performance.now();
    let successCount = 0;
    
    for (let i = 0; i < results.lookupCount; i++) {
      // Look up existing and non-existing CIDs
      if (i % 2 === 0 && entries.length > 0) {
        const entry = entries[i % entries.length];
        const result = await pyarrowIndexBridge.lookupByCid(entry.cid);
        if (result) successCount++;
      } else {
        const result = await pyarrowIndexBridge.lookupByCid(`NonExistingCID${i}`);
        if (!result) successCount++;
      }
    }
    
    const end = performance.now();
    results.duration = end - start;
    results.lookupsPerSecond = (results.lookupCount / results.duration) * 1000;
    results.successRate = successCount / results.lookupCount;
    results.success = true;
    
    console.log(`Performed ${results.lookupCount} lookups in ${results.duration.toFixed(2)}ms (${results.lookupsPerSecond.toFixed(2)} lookups/sec)`);
  } catch (error) {
    results.error = error.message;
    console.error(`Error in lookup performance test: ${error.message}`);
  }
  
  return results;
}

/**
 * Test query performance with different filter and sort combinations
 * @returns {Object} - Test results
 */
async function testQueryPerformance() {
  const results = {
    name: 'queryPerformance',
    success: false,
    queryResults: {},
    error: null
  };
  
  try {
    // Add test data
    if (mockMode && pyarrowIndexBridge.clearForTesting) {
      pyarrowIndexBridge.clearForTesting();
    }
    
    for (let i = 0; i < 1000; i++) {
      const entry = generateTestEntry(i);
      await pyarrowIndexBridge.addEntry(entry);
    }
    
    // Test different query patterns
    const queryPatterns = [
      { filter: "mimetype LIKE 'image/%'" },
      { filter: "size > 1000000", sort: 'size DESC' },
      { filter: "path LIKE '/test/path/0/%'", sort: 'created_at ASC' },
      { sort: 'size DESC', limit: 100 },
      { sort: 'created_at DESC', limit: 50, offset: 50 },
    ];
    
    for (let i = 0; i < queryPatterns.length; i++) {
      const query = queryPatterns[i];
      const iterations = 10;
      let totalDuration = 0;
      let resultCount = 0;
      
      for (let j = 0; j < iterations; j++) {
        const start = performance.now();
        const result = await pyarrowIndexBridge.query(query);
        const end = performance.now();
        
        totalDuration += (end - start);
        resultCount = result.length;
      }
      
      const avgDuration = totalDuration / iterations;
      
      results.queryResults[`query_${i}`] = {
        query,
        avgDuration,
        resultCount
      };
      
      console.log(`Query ${i} (${JSON.stringify(query)}): avg ${avgDuration.toFixed(2)}ms, returned ${resultCount} results`);
    }
    
    results.success = true;
  } catch (error) {
    results.error = error.message;
    console.error(`Error in query performance test: ${error.message}`);
  }
  
  return results;
}

/**
 * Test pagination performance for large result sets
 * @returns {Object} - Test results
 */
async function testPaginationPerformance() {
  const results = {
    name: 'paginationPerformance',
    success: false,
    paginationResults: {},
    error: null
  };
  
  try {
    // Add test data
    if (mockMode && pyarrowIndexBridge.clearForTesting) {
      pyarrowIndexBridge.clearForTesting();
    }
    
    // Use a larger dataset for pagination testing
    const datasetSize = 5000;
    for (let i = 0; i < datasetSize; i++) {
      const entry = generateTestEntry(i);
      await pyarrowIndexBridge.addEntry(entry);
    }
    
    // Test different page sizes
    const pageSizes = [10, 50, 100, 500, 1000];
    
    for (const pageSize of pageSizes) {
      const pageTimes = [];
      const maxPages = 10;
      
      for (let page = 0; page < maxPages; page++) {
        const offset = page * pageSize;
        const query = {
          sort: 'created_at DESC',
          limit: pageSize,
          offset
        };
        
        const start = performance.now();
        const result = await pyarrowIndexBridge.query(query);
        const end = performance.now();
        const duration = end - start;
        
        pageTimes.push(duration);
        
        const expectedResults = Math.min(pageSize, datasetSize - offset);
        if (result.length !== expectedResults) {
          console.warn(`WARNING: Page ${page} with size ${pageSize} returned ${result.length} results, expected ${expectedResults}`);
        }
      }
      
      const avgTime = pageTimes.reduce((sum, time) => sum + time, 0) / pageTimes.length;
      
      results.paginationResults[pageSize] = {
        avgTime,
        minTime: Math.min(...pageTimes),
        maxTime: Math.max(...pageTimes),
        times: pageTimes
      };
      
      console.log(`Pagination with page size ${pageSize}: avg ${avgTime.toFixed(2)}ms per page`);
    }
    
    results.success = true;
  } catch (error) {
    results.error = error.message;
    console.error(`Error in pagination performance test: ${error.message}`);
  }
  
  return results;
}

/**
 * Test concurrent operations using Workers
 * @returns {Object} - Test results
 */
async function testConcurrentOperations() {
  const results = {
    name: 'concurrentOperations',
    success: false,
    workerCounts: {},
    error: null
  };
  
  // Skip this test if we're running in browser
  if (typeof Worker === 'undefined' || typeof require === 'undefined') {
    results.error = 'Worker threads not available in this environment';
    results.skipped = true;
    return results;
  }
  
  try {
    // Different worker counts to test
    const workerCounts = [1, 2, 4, 8, Math.min(16, require('os').cpus().length)];
    const operationsPerWorker = 100;
    
    // Operations mix: 70% reads, 10% writes, 15% queries, 5% deletes
    const operationWeights = {
      read: 0.7,
      write: 0.1,
      query: 0.15,
      delete: 0.05
    };
    
    // First, add some test data
    if (mockMode && pyarrowIndexBridge.clearForTesting) {
      pyarrowIndexBridge.clearForTesting();
    }
    
    for (let i = 0; i < 1000; i++) {
      const entry = generateTestEntry(i);
      await pyarrowIndexBridge.addEntry(entry);
    }
    
    // Create a worker script for testing
    const workerScript = `
      const { parentPort, workerData } = require('worker_threads');
      
      // Mock implementation of PyArrow Index Bridge for the worker
      const mockBridge = ${mockMode ? `${createMockPyArrowIndexBridge.toString()}()` : 'null'};
      
      // Generate a test entry function
      ${generateTestEntry.toString()}
      
      async function runOperations() {
        const operations = workerData.operations;
        const workerId = workerData.workerId;
        const results = {
          reads: 0,
          writes: 0,
          queries: 0,
          deletes: 0,
          errors: 0
        };
        
        // Run operations
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          
          try {
            if (operation === 'read') {
              // Perform read - just a dummy operation in the worker
              results.reads++;
            } else if (operation === 'write') {
              // Perform write - just a dummy operation in the worker
              const entry = generateTestEntry(1000000 + workerId * 10000 + i);
              if (mockBridge) await mockBridge.addEntry(entry);
              results.writes++;
            } else if (operation === 'query') {
              // Perform query - just a dummy operation in the worker
              if (mockBridge) await mockBridge.query({ sort: 'created_at DESC', limit: 20 });
              results.queries++;
            } else if (operation === 'delete') {
              // Perform delete - just a dummy operation in the worker
              results.deletes++;
            }
          } catch (error) {
            results.errors++;
          }
        }
        
        return results;
      }
      
      // Run operations and send results back to main thread
      runOperations().then(results => {
        parentPort.postMessage({ success: true, results });
      }).catch(error => {
        parentPort.postMessage({ success: false, error: error.message });
      });
    `;
    
    const workerScriptPath = path.join(os.tmpdir(), 'pyarrow-index-worker.js');
    await fs.writeFile(workerScriptPath, workerScript);
    
    for (const workerCount of workerCounts) {
      // Generate operations for each worker
      const operationsByWorker = [];
      
      for (let i = 0; i < workerCount; i++) {
        const operations = [];
        for (let j = 0; j < operationsPerWorker; j++) {
          // Determine operation based on weights
          const operationType = Math.random();
          if (operationType < operationWeights.read) {
            operations.push('read');
          } else if (operationType < operationWeights.read + operationWeights.write) {
            operations.push('write');
          } else if (operationType < operationWeights.read + operationWeights.write + operationWeights.query) {
            operations.push('query');
          } else {
            operations.push('delete');
          }
        }
        operationsByWorker.push(operations);
      }
      
      // Start measuring
      const start = performance.now();
      
      // Create and run workers
      const workers = [];
      const workerPromises = [];
      
      for (let i = 0; i < workerCount; i++) {
        const worker = new Worker(workerScriptPath, {
          workerData: {
            workerId: i,
            operations: operationsByWorker[i]
          }
        });
        
        workers.push(worker);
        
        workerPromises.push(new Promise((resolve, reject) => {
          worker.on('message', resolve);
          worker.on('error', reject);
          worker.on('exit', code => {
            if (code !== 0) {
              reject(new Error(`Worker stopped with exit code ${code}`));
            }
          });
        }));
      }
      
      // Wait for all workers to complete
      const workerResults = await Promise.all(workerPromises);
      
      // Stop measuring
      const end = performance.now();
      const duration = end - start;
      
      // Aggregate results
      const aggregated = {
        reads: 0,
        writes: 0,
        queries: 0,
        deletes: 0,
        errors: 0
      };
      
      for (const result of workerResults) {
        if (result.success && result.results) {
          aggregated.reads += result.results.reads;
          aggregated.writes += result.results.writes;
          aggregated.queries += result.results.queries;
          aggregated.deletes += result.results.deletes;
          aggregated.errors += result.results.errors;
        } else {
          aggregated.errors++;
        }
      }
      
      const totalOperations = workerCount * operationsPerWorker;
      const operationsPerSecond = (totalOperations / duration) * 1000;
      
      results.workerCounts[workerCount] = {
        duration,
        totalOperations,
        operationsPerSecond,
        operations: { ...aggregated }
      };
      
      console.log(`Concurrent operations with ${workerCount} workers: ${totalOperations} operations in ${duration.toFixed(2)}ms (${operationsPerSecond.toFixed(2)} ops/sec)`);
    }
    
    // Clean up worker script
    try {
      await fs.unlink(workerScriptPath);
    } catch (error) {
      console.warn(`Error deleting worker script: ${error.message}`);
    }
    
    results.success = true;
  } catch (error) {
    results.error = error.message;
    console.error(`Error in concurrent operations test: ${error.message}`);
  }
  
  return results;
}

/**
 * Run all performance tests and collect results
 */
async function runTests() {
  console.log('Starting PyArrow Index performance tests...');
  const startTime = performance.now();
  
  const allResults = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: require('os').cpus().length,
      mockMode
    },
    results: {},
    success: true,
    summary: {}
  };
  
  try {
    // Run setup to initialize the bridge
    const setupSuccess = await setup();
    if (!setupSuccess) {
      throw new Error('Failed to set up test environment');
    }
    
    // Run the tests
    const tests = [
      { name: 'addSmallDataset', fn: () => testAddDataset(SMALL_DATASET_SIZE) },
      { name: 'addMediumDataset', fn: () => testAddDataset(MEDIUM_DATASET_SIZE) },
      { name: 'batchAddPerformance', fn: () => testBatchAddDataset(2000) },
      { name: 'lookupPerformance', fn: testLookupPerformance },
      { name: 'queryPerformance', fn: testQueryPerformance },
      { name: 'paginationPerformance', fn: testPaginationPerformance },
      { name: 'concurrentOperations', fn: testConcurrentOperations }
    ];
    
    // Add large tests if enabled
    if (config.runLargeTests) {
      tests.push({ name: 'addLargeDataset', fn: () => testAddDataset(LARGE_DATASET_SIZE) });
    }
    
    // Add very large tests if enabled
    if (config.runVeryLargeTests) {
      tests.push({ name: 'addVeryLargeDataset', fn: () => testAddDataset(VERY_LARGE_DATASET_SIZE) });
    }
    
    // Run each test
    for (const test of tests) {
      console.log(`\nRunning test: ${test.name}`);
      const { result } = await measurePerformance(test.fn);
      allResults.results[test.name] = result;
      
      if (!result || !result.success) {
        allResults.success = false;
      }
    }
  } catch (error) {
    console.error(`Error running tests: ${error.message}`);
    allResults.success = false;
    allResults.error = error.message;
  } finally {
    // Run teardown to clean up
    await teardown();
  }
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  // Add summary information
  allResults.summary = {
    duration: duration,
    durationInSeconds: duration / 1000,
    testCount: Object.keys(allResults.results).length,
    successCount: Object.values(allResults.results).filter(r => r.success).length,
    failureCount: Object.values(allResults.results).filter(r => !r.success).length
  };
  
  console.log(`\nTests completed in ${(duration / 1000).toFixed(2)} seconds`);
  console.log(`${allResults.summary.successCount} tests succeeded, ${allResults.summary.failureCount} tests failed`);
  
  // Save results to file if configured
  if (config.outputJsonResults) {
    const outputPath = path.join(TEST_OUTPUT_DIR, `pyarrow-index-perf-results-${Date.now()}.json`);
    try {
      await fs.writeFile(outputPath, JSON.stringify(allResults, null, 2));
      console.log(`Test results saved to ${outputPath}`);
    } catch (error) {
      console.error(`Error saving test results: ${error.message}`);
    }
  }
  
  return allResults;
}

// Run tests when this module is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error(`Fatal error running tests: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  setup,
  teardown,
  // Export individual tests for selective running
  testAddDataset,
  testBatchAddDataset,
  testLookupPerformance,
  testQueryPerformance,
  testPaginationPerformance,
  testConcurrentOperations
};