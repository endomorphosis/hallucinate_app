/**
 * Web Worker Manager for PyArrow Content Index Dashboard
 * Provides an interface for communicating with web workers and managing their lifecycle
 */

/**
 * Worker Manager class that handles communication with web workers
 */
export class WorkerManager {
  /**
   * Create a new WorkerManager instance
   * 
   * @param {string} workerScript - Path to the worker script
   * @param {number} poolSize - Number of workers to create (default: 1)
   * @param {object} options - Additional options
   */
  constructor(workerScript, poolSize = 1, options = {}) {
    this.workerScript = workerScript;
    this.poolSize = poolSize;
    this.options = {
      terminateOnError: false,
      logErrors: true,
      ...options
    };
    
    // Worker pool
    this.workers = [];
    // Tasks assigned to each worker
    this.workerTasks = new Map();
    // Current worker index for round-robin assignment
    this.currentWorkerIndex = 0;
    // Next task ID
    this.nextTaskId = 1;
    // Pending tasks waiting for worker response
    this.pendingTasks = new Map();
    
    // Initialize worker pool
    this._initializeWorkerPool();
  }
  
  /**
   * Initialize the pool of workers
   * 
   * @private
   */
  _initializeWorkerPool() {
    for (let i = 0; i < this.poolSize; i++) {
      this._createWorker(i);
    }
  }
  
  /**
   * Create a new worker
   * 
   * @param {number} index - Index of the worker in the pool
   * @private
   */
  _createWorker(index) {
    try {
      const worker = new Worker(this.workerScript);
      
      worker.onmessage = (event) => {
        this._handleWorkerMessage(index, event);
      };
      
      worker.onerror = (error) => {
        this._handleWorkerError(index, error);
      };
      
      this.workers[index] = worker;
      this.workerTasks.set(worker, new Set());
      
      console.log(`Worker ${index} created`);
    } catch (error) {
      console.error(`Failed to create worker ${index}:`, error);
    }
  }
  
  /**
   * Handle message from a worker
   * 
   * @param {number} workerIndex - Index of the worker in the pool
   * @param {MessageEvent} event - Message event from the worker
   * @private
   */
  _handleWorkerMessage(workerIndex, event) {
    const { id, result, error, success } = event.data;
    
    // Get the pending task
    const pendingTask = this.pendingTasks.get(id);
    if (!pendingTask) {
      console.warn(`Received response for unknown task ID: ${id}`);
      return;
    }
    
    // Remove task from worker's assigned tasks
    const worker = this.workers[workerIndex];
    const workerTaskSet = this.workerTasks.get(worker);
    if (workerTaskSet) {
      workerTaskSet.delete(id);
    }
    
    // Remove from pending tasks
    this.pendingTasks.delete(id);
    
    // Resolve or reject the task's promise
    if (success) {
      pendingTask.resolve(result);
    } else {
      const errorObj = error ? new Error(error.message) : new Error('Unknown worker error');
      if (error && error.stack) {
        errorObj.stack = error.stack;
      }
      pendingTask.reject(errorObj);
      
      // Log the error if enabled
      if (this.options.logErrors) {
        console.error(`Worker ${workerIndex} task ${id} failed:`, errorObj);
      }
      
      // Terminate and recreate worker if configured to do so
      if (this.options.terminateOnError) {
        this._terminateAndRecreateWorker(workerIndex);
      }
    }
  }
  
  /**
   * Handle error from a worker
   * 
   * @param {number} workerIndex - Index of the worker in the pool
   * @param {ErrorEvent} error - Error event from the worker
   * @private
   */
  _handleWorkerError(workerIndex, error) {
    console.error(`Worker ${workerIndex} encountered an error:`, error);
    
    // If we have any pending tasks for this worker, reject them
    const worker = this.workers[workerIndex];
    const workerTaskSet = this.workerTasks.get(worker);
    
    if (workerTaskSet) {
      for (const taskId of workerTaskSet) {
        const pendingTask = this.pendingTasks.get(taskId);
        if (pendingTask) {
          pendingTask.reject(new Error('Worker error: ' + (error.message || 'Unknown error')));
          this.pendingTasks.delete(taskId);
        }
      }
      
      workerTaskSet.clear();
    }
    
    // Terminate and recreate the worker
    this._terminateAndRecreateWorker(workerIndex);
  }
  
  /**
   * Terminate and recreate a worker
   * 
   * @param {number} workerIndex - Index of the worker in the pool
   * @private
   */
  _terminateAndRecreateWorker(workerIndex) {
    try {
      const worker = this.workers[workerIndex];
      
      // Remove worker from pool
      this.workerTasks.delete(worker);
      
      // Terminate worker
      worker.terminate();
      
      // Create a new worker for this index
      this._createWorker(workerIndex);
    } catch (error) {
      console.error(`Failed to recreate worker ${workerIndex}:`, error);
    }
  }
  
  /**
   * Get the next available worker from the pool
   * 
   * @returns {[Worker, number]} The worker and its index
   * @private
   */
  _getNextWorker() {
    // If no workers, return null
    if (this.workers.length === 0) {
      return [null, -1];
    }
    
    // Start with the current index, find the worker with the fewest tasks
    let minTasks = Number.MAX_SAFE_INTEGER;
    let selectedWorkerIndex = this.currentWorkerIndex;
    
    for (let i = 0; i < this.workers.length; i++) {
      const workerIndex = (this.currentWorkerIndex + i) % this.workers.length;
      const worker = this.workers[workerIndex];
      const tasksCount = this.workerTasks.get(worker).size;
      
      if (tasksCount === 0) {
        // This worker has no tasks, use it
        this.currentWorkerIndex = (workerIndex + 1) % this.workers.length;
        return [worker, workerIndex];
      }
      
      if (tasksCount < minTasks) {
        minTasks = tasksCount;
        selectedWorkerIndex = workerIndex;
      }
    }
    
    // Update current index for next time
    this.currentWorkerIndex = (selectedWorkerIndex + 1) % this.workers.length;
    
    return [this.workers[selectedWorkerIndex], selectedWorkerIndex];
  }
  
  /**
   * Run a task on a worker
   * 
   * @param {string} task - Name of the task to run
   * @param {any} data - Data to pass to the task
   * @returns {Promise<any>} Promise that resolves with the task result
   */
  runTask(task, data) {
    return new Promise((resolve, reject) => {
      // Get the next available worker
      const [worker, workerIndex] = this._getNextWorker();
      
      if (!worker) {
        reject(new Error('No workers available'));
        return;
      }
      
      // Generate a task ID
      const id = this.nextTaskId++;
      
      // Store the pending task
      this.pendingTasks.set(id, { resolve, reject });
      
      // Add task to worker's assigned tasks
      this.workerTasks.get(worker).add(id);
      
      // Send the task to the worker
      worker.postMessage({ task, data, id });
    });
  }
  
  /**
   * Run a task on a worker with a timeout
   * 
   * @param {string} task - Name of the task to run
   * @param {any} data - Data to pass to the task
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Promise that resolves with the task result
   */
  runTaskWithTimeout(task, data, timeout) {
    return Promise.race([
      this.runTask(task, data),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Task ${task} timed out after ${timeout}ms`)), timeout);
      })
    ]);
  }
  
  /**
   * Terminate all workers in the pool
   */
  terminate() {
    // Reject all pending tasks
    for (const [id, pendingTask] of this.pendingTasks.entries()) {
      pendingTask.reject(new Error('Worker manager terminated'));
    }
    
    this.pendingTasks.clear();
    
    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    
    this.workers = [];
    this.workerTasks.clear();
    
    console.log('All workers terminated');
  }
  
  /**
   * Check if the browser supports Web Workers
   * 
   * @returns {boolean} True if Web Workers are supported
   * @static
   */
  static isSupported() {
    return typeof Worker !== 'undefined';
  }
}