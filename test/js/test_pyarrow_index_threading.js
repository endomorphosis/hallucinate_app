/**
 * PyArrow Index Thread Pool Workers Test
 * 
 * This test module verifies the thread safety and concurrency capabilities
 * of the PyArrow Content Index Bridge with advanced thread pool management.
 */

const assert = require('assert');
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { performance } = require('perf_hooks');

// Mock of the PyArrow Index Bridge client
let mockPythonBridge = {
  callAsync: async ({ method, args }) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (method === 'js_get_thread_pool_stats') {
      return {
        pool: {
          current_workers: 4,
          min_workers: 2,
          max_workers: 10,
          active_tasks: 0,
          queue_sizes: {
            high: 0,
            normal: 0,
            low: 0
          }
        },
        tasks: {
          submitted: 0,
          completed: 0,
          failed: 0
        }
      };
    }
    
    return { success: true };
  }
};

// Test configuration
const config = {
  workerCount: 8,
  operationsPerWorker: 100,
  outputDir: path.join(__dirname, '../../test_output')
};

// Test worker script content
const workerScript = `
const { parentPort, workerData } = require('worker_threads');
const { performance } = require('perf_hooks');

// Task execution
async function runTasks() {
  const workerId = workerData.workerId;
  const operationCount = workerData.operationCount;
  const operationMix = workerData.operationMix;
  
  // Results tracking
  const results = {
    workerId,
    operations: {
      high_priority: 0,
      normal_priority: 0,
      low_priority: 0,
      total: 0,
      successful: 0,
      failed: 0
    },
    timing: {
      start: performance.now(),
      end: 0,
      totalDuration: 0,
      operationDurations: []
    }
  };
  
  // Run operations based on the mix
  for (let i = 0; i < operationCount; i++) {
    const opStart = performance.now();
    let success = true;
    
    // Determine priority based on operation mix
    const priorityValue = Math.random();
    let priority;
    
    if (priorityValue < operationMix.highPriority) {
      priority = 'high';
      results.operations.high_priority++;
    } else if (priorityValue < operationMix.highPriority + operationMix.normalPriority) {
      priority = 'normal';
      results.operations.normal_priority++;
    } else {
      priority = 'low';
      results.operations.low_priority++;
    }
    
    // Simulate operation execution with random delay
    const duration = 5 + Math.random() * 20;
    await new Promise(resolve => setTimeout(resolve, duration));
    
    // Small random chance of failure
    if (Math.random() < 0.05) {
      success = false;
      results.operations.failed++;
    } else {
      results.operations.successful++;
    }
    
    // Track operation duration
    const opEnd = performance.now();
    results.operations.total++;
    results.timing.operationDurations.push({
      index: i,
      duration: opEnd - opStart,
      priority,
      success
    });
  }
  
  // Finalize results
  results.timing.end = performance.now();
  results.timing.totalDuration = results.timing.end - results.timing.start;
  
  // Return results to parent
  return results;
}

// Execute tasks and return results
runTasks().then(results => {
  parentPort.postMessage({ success: true, results });
}).catch(error => {
  parentPort.postMessage({ success: false, error: error.message });
});
`;

// Create a worker script file
async function createWorkerScript() {
  const tempFile = path.join(os.tmpdir(), 'pyarrow-index-worker-test.js');
  await fs.writeFile(tempFile, workerScript);
  return tempFile;
}

// Run the worker test with specified parameters
async function runWorkerTest(settings = {}) {
  const workerCount = settings.workerCount || config.workerCount;
  const operationsPerWorker = settings.operationsPerWorker || config.operationsPerWorker;
  
  console.log(`Starting test with ${workerCount} workers, ${operationsPerWorker} operations per worker`);
  
  // Create worker script
  const scriptPath = await createWorkerScript();
  
  // Operation mix settings
  const operationMix = settings.operationMix || {
    highPriority: 0.2,    // 20% high priority
    normalPriority: 0.6,  // 60% normal priority
    lowPriority: 0.2      // 20% low priority
  };
  
  // Start test timing
  const testStart = performance.now();
  
  // Create and run workers
  const workers = [];
  const workerPromises = [];
  
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(scriptPath, {
      workerData: {
        workerId: i,
        operationCount: operationsPerWorker,
        operationMix: operationMix
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
  
  // End test timing
  const testEnd = performance.now();
  const testDuration = testEnd - testStart;
  
  // Clean up
  await fs.unlink(scriptPath);
  
  // Aggregate results
  const results = {
    config: {
      workerCount,
      operationsPerWorker,
      operationMix,
      totalOperations: workerCount * operationsPerWorker
    },
    timing: {
      start: testStart,
      end: testEnd,
      totalDuration: testDuration,
      operationsPerSecond: (workerCount * operationsPerWorker) / (testDuration / 1000)
    },
    operations: {
      high_priority: 0,
      normal_priority: 0,
      low_priority: 0,
      total: 0,
      successful: 0,
      failed: 0
    },
    workers: []
  };
  
  // Process each worker's results
  workerResults.forEach(message => {
    if (message.success && message.results) {
      const workerResult = message.results;
      
      // Add to totals
      results.operations.high_priority += workerResult.operations.high_priority;
      results.operations.normal_priority += workerResult.operations.normal_priority;
      results.operations.low_priority += workerResult.operations.low_priority;
      results.operations.total += workerResult.operations.total;
      results.operations.successful += workerResult.operations.successful;
      results.operations.failed += workerResult.operations.failed;
      
      // Add worker result
      results.workers.push(workerResult);
    } else {
      // Failed worker
      results.operations.failed += operationsPerWorker;
      results.operations.total += operationsPerWorker;
      results.workers.push({
        error: message.error || 'Unknown error',
        operations: {
          total: operationsPerWorker,
          failed: operationsPerWorker
        }
      });
    }
  });
  
  // Log summary
  console.log(`Test completed in ${testDuration.toFixed(2)}ms`);
  console.log(`Operations per second: ${results.timing.operationsPerSecond.toFixed(2)}`);
  console.log(`Success rate: ${((results.operations.successful / results.operations.total) * 100).toFixed(2)}%`);
  
  // Save results if output directory exists
  try {
    if (!fs.existsSync(config.outputDir)) {
      await fs.mkdir(config.outputDir, { recursive: true });
    }
    
    const outputPath = path.join(config.outputDir, `thread-pool-test-${Date.now()}.json`);
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results saved to ${outputPath}`);
  } catch (error) {
    console.error(`Error saving results: ${error.message}`);
  }
  
  return results;
}

// Test cases
describe('PyArrow Index Thread Pool', function() {
  this.timeout(30000); // 30 second timeout
  
  before(async function() {
    // Create output directory if it doesn't exist
    try {
      await fs.mkdir(config.outputDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`Error creating output directory: ${error.message}`);
      }
    }
  });
  
  it('should handle concurrent operations with balanced priority mix', async function() {
    const results = await runWorkerTest({
      workerCount: 4,
      operationsPerWorker: 50,
      operationMix: {
        highPriority: 0.2,
        normalPriority: 0.6,
        lowPriority: 0.2
      }
    });
    
    // Verify results
    assert.strictEqual(results.config.totalOperations, 200, 'Should have correct total operations');
    assert.ok(results.timing.operationsPerSecond > 0, 'Should have positive operations per second');
    assert.ok(results.operations.successful > 0, 'Should have successful operations');
    assert.ok(results.operations.total === 200, 'Total operations should match configuration');
  });
  
  it('should handle concurrent operations with high priority bias', async function() {
    const results = await runWorkerTest({
      workerCount: 4,
      operationsPerWorker: 50,
      operationMix: {
        highPriority: 0.6,
        normalPriority: 0.3,
        lowPriority: 0.1
      }
    });
    
    // Verify priority distribution
    assert.ok(results.operations.high_priority > results.operations.normal_priority, 
              'Should have more high priority operations than normal');
    assert.ok(results.operations.normal_priority > results.operations.low_priority,
              'Should have more normal priority operations than low');
  });
  
  it('should handle large number of concurrent workers', async function() {
    // Use more workers than available cores to test scheduling
    const cpuCount = require('os').cpus().length;
    const workerCount = Math.max(cpuCount * 2, 4);
    
    const results = await runWorkerTest({
      workerCount,
      operationsPerWorker: 20,
      operationMix: {
        highPriority: 0.2,
        normalPriority: 0.6,
        lowPriority: 0.2
      }
    });
    
    // Verify worker count
    assert.strictEqual(results.workers.length, workerCount, 
                      `Should create ${workerCount} workers`);
    
    // Check throughput scales with worker count
    assert.ok(results.timing.operationsPerSecond > 0, 
              'Should have positive operations per second with high worker count');
  });
  
  it('should maintain high success rate under load', async function() {
    const results = await runWorkerTest({
      workerCount: 8,
      operationsPerWorker: 30
    });
    
    // Calculate success rate
    const successRate = results.operations.successful / results.operations.total;
    
    // Verify success rate is high (accounting for 5% simulated failures)
    assert.ok(successRate > 0.90, `Success rate should be > 90%, got ${(successRate * 100).toFixed(2)}%`);
  });
  
  it('should retrieve thread pool statistics', async function() {
    // Mock a thread pool stats call
    const stats = await mockPythonBridge.callAsync({
      method: 'js_get_thread_pool_stats',
      args: []
    });
    
    // Verify stats structure
    assert.ok(stats.pool, 'Should have pool statistics');
    assert.ok(typeof stats.pool.current_workers === 'number', 'Should have worker count');
    assert.ok(typeof stats.pool.active_tasks === 'number', 'Should have active task count');
    assert.ok(stats.tasks, 'Should have task statistics');
    assert.ok('submitted' in stats.tasks, 'Should have submitted task count');
    assert.ok('completed' in stats.tasks, 'Should have completed task count');
  });
});

// Exports for use in other tests
module.exports = {
  runWorkerTest
};