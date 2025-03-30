/**
 * IPFS Modules Benchmark Handler
 * 
 * This module provides functionality for running benchmarks on IPFS Python modules:
 * - ipfs_datasets_py
 * - ipfs_faiss_py
 * - ipfs_kit_py
 * - ipfs_accelerate_py
 * - ipfs_embeddings_py
 * - ipfs_model_manager_py
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import pythonBridge from '../../test/js/python_bridge.js';

// Import required modules
import testHandler from './test_handler.js';
import { ipfsKit } from './ipfs_kit.js';
import { ipfsEmbeddings } from './ipfs_embeddings.js';
import { ipfsFaiss } from './ipfs_faiss.js';

class BenchmarkHandler {
  constructor() {
    this.runningBenchmarks = new Map();
    this.benchmarkResults = {};
  }
  
  /**
   * Initialize IPC handlers for benchmark operations
   */
  setupIpcHandlers() {
    // Run benchmarks
    ipcMain.on('run-benchmarks', async (event, data) => {
      try {
        console.log('Starting benchmarks:', data);
        const { module, config } = data;
        
        // Run the benchmarks
        this.runBenchmarks(module, config, event);
      } catch (error) {
        console.error('Failed to run benchmarks:', error);
        event.reply('benchmark-complete', {
          module: data.module,
          success: false,
          error: error.message,
          benchmarks: data.config?.benchmarks || []
        });
      }
    });
    
    // Get benchmark results
    ipcMain.on('get-benchmark-results', (event, moduleId) => {
      const results = this.benchmarkResults[moduleId] || {};
      event.reply('benchmark-results', { moduleId, results });
    });
    
    // Export benchmark results
    ipcMain.on('export-results', async (event, data) => {
      try {
        console.log('Exporting results');
        const filePath = await this.exportResults(data);
        event.reply('export-complete', { success: true, path: filePath });
      } catch (error) {
        console.error('Failed to export results:', error);
        event.reply('export-complete', { 
          success: false, 
          error: error.message 
        });
      }
    });
  }
  
  /**
   * Run benchmarks for a module
   * @param {string} moduleId - Module identifier
   * @param {object} config - Benchmark configuration
   * @param {Electron.IpcMainEvent} event - IPC event for replying with results
   */
  async runBenchmarks(moduleId, config, event) {
    try {
      // Ensure services are running
      await this.ensureServicesRunning();
      
      // Check if benchmarks are already running for this module
      if (this.runningBenchmarks.has(moduleId)) {
        throw new Error(`Benchmarks are already running for module: ${moduleId}`);
      }
      
      const { iterations = 5, benchmarks = [] } = config;
      
      // Store running status
      this.runningBenchmarks.set(moduleId, {
        benchmarks,
        iterations,
        current: 0,
        completed: 0,
        results: {}
      });
      
      // Run benchmarks sequentially
      for (const benchmarkId of benchmarks) {
        // Update current benchmark
        this.runningBenchmarks.get(moduleId).current = benchmarkId;
        
        // Run the benchmark for the specified number of iterations
        for (let i = 1; i <= iterations; i++) {
          try {
            // Run the benchmark
            const startTime = Date.now();
            await this.runBenchmark(moduleId, benchmarkId, config);
            const duration = Date.now() - startTime;
            
            // Store the result
            const benchmarkKey = `${moduleId}_${benchmarkId}`;
            if (!this.benchmarkResults[benchmarkKey]) {
              this.benchmarkResults[benchmarkKey] = [];
            }
            
            this.benchmarkResults[benchmarkKey].push({
              iteration: i,
              duration,
              timestamp: new Date().toISOString()
            });
            
            // Send result to the renderer process
            event.reply('benchmark-result', {
              module: moduleId,
              benchmark: benchmarkId,
              iteration: i,
              totalIterations: iterations,
              duration
            });
            
            // Short delay between iterations
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Error running benchmark ${benchmarkId} iteration ${i}:`, error);
            
            // Send error result
            event.reply('benchmark-result', {
              module: moduleId,
              benchmark: benchmarkId,
              iteration: i,
              totalIterations: iterations,
              duration: 0,
              error: error.message
            });
          }
        }
        
        // Update completed count
        this.runningBenchmarks.get(moduleId).completed++;
      }
      
      // Mark benchmarks as complete
      this.runningBenchmarks.delete(moduleId);
      
      // Send completion event
      event.reply('benchmark-complete', {
        module: moduleId,
        success: true,
        benchmarks
      });
    } catch (error) {
      console.error(`Error running benchmarks for ${moduleId}:`, error);
      
      // Clean up running status
      this.runningBenchmarks.delete(moduleId);
      
      // Send error to renderer
      event.reply('benchmark-complete', {
        module: moduleId,
        success: false,
        error: error.message,
        benchmarks: config.benchmarks || []
      });
    }
  }
  
  /**
   * Run a single benchmark
   * @param {string} moduleId - Module identifier
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   * @returns {Promise<object>} Benchmark result
   */
  async runBenchmark(moduleId, benchmarkId, config) {
    console.log(`Running benchmark: ${moduleId}.${benchmarkId}`);
    
    // Get benchmark implementation based on module and benchmark ID
    switch (moduleId) {
      case 'ipfs_kit_py':
        return await this.runIpfsKitBenchmark(benchmarkId, config);
      case 'ipfs_datasets_py':
        return await this.runIpfsDatasetsBenchmark(benchmarkId, config);
      case 'ipfs_faiss_py':
        return await this.runIpfsFaissBenchmark(benchmarkId, config);
      case 'ipfs_accelerate_py':
        return await this.runIpfsAccelerateBenchmark(benchmarkId, config);
      case 'ipfs_embeddings_py':
        return await this.runIpfsEmbeddingsBenchmark(benchmarkId, config);
      case 'ipfs_model_manager_py':
        return await this.runIpfsModelManagerBenchmark(benchmarkId, config);
      default:
        throw new Error(`Unknown module: ${moduleId}`);
    }
  }
  
  /**
   * Run IPFS Kit benchmark
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   */
  async runIpfsKitBenchmark(benchmarkId, config) {
    try {
      // Ensure IPFS Kit is initialized
      await ipfsKit.ipfsKitReady();
      
      switch (benchmarkId) {
        case 'add_small':
        case 'add_medium':
        case 'add_large': {
          // Create a temporary file of the specified size
          const size = this.getBenchmarkParam(benchmarkId, config, 'size', 1024);
          const filePath = await this.createTempFile(size);
          
          // Upload to IPFS
          const result = await ipfsKit.ipfsUploadObject(filePath);
          
          // Clean up
          fs.unlinkSync(filePath);
          
          return result;
        }
        case 'cat_small':
        case 'cat_medium':
        case 'cat_large': {
          // Create a temporary file of the specified size
          const size = this.getBenchmarkParam(benchmarkId, config, 'size', 1024);
          const filePath = await this.createTempFile(size);
          
          // Upload to IPFS
          const uploadResult = await ipfsKit.ipfsUploadObject(filePath);
          const cid = uploadResult.ipfsUploadObject.results[0].hash;
          
          // Download from IPFS
          const outputPath = filePath + '.download';
          const result = await ipfsKit.ipgetDownloadObject(cid, outputPath);
          
          // Clean up
          fs.unlinkSync(filePath);
          try {
            fs.unlinkSync(outputPath);
          } catch (e) {
            // Ignore errors on cleanup
          }
          
          return result;
        }
        default:
          throw new Error(`Unknown IPFS Kit benchmark: ${benchmarkId}`);
      }
    } catch (error) {
      console.error(`Error running IPFS Kit benchmark ${benchmarkId}:`, error);
      throw error;
    }
  }
  
  /**
   * Run IPFS Datasets benchmark
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   */
  async runIpfsDatasetsBenchmark(benchmarkId, config) {
    try {
      // For datasets benchmarks, we'll use the Python implementation
      const benchmarkConfig = {
        benchmark_id: benchmarkId,
        ...config
      };
      
      const response = await fetch(`${pythonBridge.serverUrl}/benchmark/ipfs_datasets_py`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(benchmarkConfig),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Benchmark failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error running IPFS Datasets benchmark ${benchmarkId}:`, error);
      throw error;
    }
  }
  
  /**
   * Run IPFS FAISS benchmark
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   */
  async runIpfsFaissBenchmark(benchmarkId, config) {
    try {
      // Initialize FAISS
      await ipfsFaiss.init();
      
      // Get benchmark parameters
      const params = this.getBenchmarkParams(benchmarkId, config);
      
      // Static index ID for benchmarks
      let indexId = null;
      
      switch (benchmarkId) {
        case 'create_index': {
          const dimensions = params.dimensions || 128;
          const result = await ipfsFaiss.createIndex(dimensions);
          indexId = result.index_id;
          return result;
        }
        case 'add_vectors_small':
        case 'add_vectors_medium':
        case 'add_vectors_large': {
          // Create an index first
          const dimensions = params.dimensions || 128;
          const count = params.count || 1000;
          
          const createResult = await ipfsFaiss.createIndex(dimensions);
          indexId = createResult.index_id;
          
          // Generate random vectors
          const vectors = this.generateRandomVectors(count, dimensions);
          
          // Add vectors to the index
          const result = await ipfsFaiss.addVectors(indexId, vectors);
          return result;
        }
        case 'search_small':
        case 'search_medium':
        case 'search_large': {
          // Create an index and add vectors first
          const dimensions = params.dimensions || 128;
          const count = params.count || 1000;
          const k = params.k || 10;
          
          const createResult = await ipfsFaiss.createIndex(dimensions);
          indexId = createResult.index_id;
          
          // Generate random vectors
          const vectors = this.generateRandomVectors(count, dimensions);
          
          // Add vectors to the index
          await ipfsFaiss.addVectors(indexId, vectors);
          
          // Generate a query vector
          const query = this.generateRandomVectors(1, dimensions)[0];
          
          // Search the index
          const result = await ipfsFaiss.search(indexId, query, k);
          return result;
        }
        default:
          throw new Error(`Unknown IPFS FAISS benchmark: ${benchmarkId}`);
      }
    } catch (error) {
      console.error(`Error running IPFS FAISS benchmark ${benchmarkId}:`, error);
      throw error;
    }
  }
  
  /**
   * Run IPFS Accelerate benchmark
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   */
  async runIpfsAccelerateBenchmark(benchmarkId, config) {
    try {
      // For accelerate benchmarks, we'll use the Python implementation
      const benchmarkConfig = {
        benchmark_id: benchmarkId,
        ...config
      };
      
      const response = await fetch(`${pythonBridge.serverUrl}/benchmark/ipfs_accelerate_py`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(benchmarkConfig),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Benchmark failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error running IPFS Accelerate benchmark ${benchmarkId}:`, error);
      throw error;
    }
  }
  
  /**
   * Run IPFS Embeddings benchmark
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   */
  async runIpfsEmbeddingsBenchmark(benchmarkId, config) {
    try {
      // Initialize embeddings
      await ipfsEmbeddings.init();
      
      // Get benchmark parameters
      const params = this.getBenchmarkParams(benchmarkId, config);
      
      switch (benchmarkId) {
        case 'generate_embedding': {
          // Generate text of specified length
          const textLength = params.text_length || 100;
          const text = this.generateRandomText(textLength);
          
          // Generate embedding
          const result = await ipfsEmbeddings.generateEmbedding(text);
          return result;
        }
        case 'generate_batch': {
          // Generate multiple texts
          const count = params.count || 100;
          const textLength = params.text_length || 100;
          const texts = [];
          
          for (let i = 0; i < count; i++) {
            texts.push(this.generateRandomText(textLength));
          }
          
          // Generate embeddings
          const result = await ipfsEmbeddings.generateEmbedding(texts);
          return result;
        }
        case 'similarity_short':
        case 'similarity_long': {
          // Generate two texts
          const textLength = params.text_length || 100;
          const text1 = this.generateRandomText(textLength);
          const text2 = this.generateRandomText(textLength);
          
          // Generate embeddings
          const result1 = await ipfsEmbeddings.generateEmbedding(text1);
          const result2 = await ipfsEmbeddings.generateEmbedding(text2);
          
          // Compare similarity
          const similarity = await ipfsEmbeddings.compareSimilarity(
            result1.embedding,
            result2.embedding
          );
          
          return similarity;
        }
        case 'search_similar': {
          // Generate corpus of texts
          const corpusSize = params.corpus_size || 1000;
          const textLength = params.text_length || 100;
          const k = params.k || 10;
          
          const texts = [];
          for (let i = 0; i < corpusSize; i++) {
            texts.push(this.generateRandomText(textLength));
          }
          
          // Generate embeddings for corpus
          const corpusResult = await ipfsEmbeddings.generateEmbedding(texts);
          
          // Create embeddings array for search
          const embeddings = corpusResult.embeddings.map((embedding, index) => ({
            id: index,
            text: texts[index],
            embedding
          }));
          
          // Generate query text and embedding
          const queryText = this.generateRandomText(textLength);
          
          // Search similar
          const result = await ipfsEmbeddings.searchSimilar(queryText, embeddings, {
            top_k: k
          });
          
          return result;
        }
        case 'save_to_ipfs':
        case 'load_from_ipfs': {
          // For IPFS operations, we need to use the Python bridge
          const benchmarkConfig = {
            benchmark_id: benchmarkId,
            params
          };
          
          const response = await fetch(`${pythonBridge.serverUrl}/benchmark/ipfs_embeddings_py`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(benchmarkConfig),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Benchmark failed');
          }
          
          return await response.json();
        }
        default:
          throw new Error(`Unknown IPFS Embeddings benchmark: ${benchmarkId}`);
      }
    } catch (error) {
      console.error(`Error running IPFS Embeddings benchmark ${benchmarkId}:`, error);
      throw error;
    }
  }
  
  /**
   * Run IPFS Model Manager benchmark
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   */
  async runIpfsModelManagerBenchmark(benchmarkId, config) {
    try {
      // For model manager benchmarks, we'll use the Python implementation
      const benchmarkConfig = {
        benchmark_id: benchmarkId,
        ...config
      };
      
      const response = await fetch(`${pythonBridge.serverUrl}/benchmark/ipfs_model_manager_py`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(benchmarkConfig),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Benchmark failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error running IPFS Model Manager benchmark ${benchmarkId}:`, error);
      throw error;
    }
  }
  
  /**
   * Create a temporary file of the specified size
   * @param {number} size - File size in bytes
   * @returns {Promise<string>} Path to the created file
   */
  async createTempFile(size) {
    return new Promise((resolve, reject) => {
      try {
        const tempDir = path.join(os.tmpdir(), 'ipfs_benchmarks');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filePath = path.join(tempDir, `benchmark_${Date.now()}.dat`);
        const fd = fs.openSync(filePath, 'w');
        
        // Create a buffer of 1MB for efficient writing
        const bufferSize = Math.min(1024 * 1024, size);
        const buffer = Buffer.alloc(bufferSize);
        
        // Fill buffer with random data
        for (let i = 0; i < bufferSize; i++) {
          buffer[i] = Math.floor(Math.random() * 256);
        }
        
        // Write the buffer multiple times until we reach the desired size
        let remaining = size;
        while (remaining > 0) {
          const toWrite = Math.min(bufferSize, remaining);
          fs.writeSync(fd, buffer, 0, toWrite);
          remaining -= toWrite;
        }
        
        fs.closeSync(fd);
        resolve(filePath);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Generate random vectors for FAISS benchmarks
   * @param {number} count - Number of vectors to generate
   * @param {number} dimensions - Vector dimensions
   * @returns {Array<Array<number>>} Array of vectors
   */
  generateRandomVectors(count, dimensions) {
    const vectors = [];
    
    for (let i = 0; i < count; i++) {
      const vector = [];
      
      for (let j = 0; j < dimensions; j++) {
        vector.push(Math.random() * 2 - 1); // Random value between -1 and 1
      }
      
      vectors.push(vector);
    }
    
    return vectors;
  }
  
  /**
   * Generate random text for embeddings benchmarks
   * @param {number} length - Approximate length of text
   * @returns {string} Random text
   */
  generateRandomText(length) {
    const words = [
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
      'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
      'ipsum', 'lorem', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
      'data', 'model', 'embeddings', 'vector', 'machine', 'learning', 'neural', 'network'
    ];
    
    let text = '';
    const targetWords = Math.ceil(length / 5); // Assume average word length of 5
    
    for (let i = 0; i < targetWords; i++) {
      const word = words[Math.floor(Math.random() * words.length)];
      text += (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word);
      
      if (i < targetWords - 1) {
        text += ' ';
      } else {
        text += '.';
      }
      
      // Add some punctuation occasionally
      if (Math.random() < 0.1 && i < targetWords - 1) {
        text += ',';
      }
      
      if (Math.random() < 0.05 && i < targetWords - 1) {
        text += '.\n';
        // Capitalize the next word
        const nextWord = words[Math.floor(Math.random() * words.length)];
        text += nextWord.charAt(0).toUpperCase() + nextWord.slice(1) + ' ';
        i++; // Skip one word
      }
    }
    
    return text;
  }
  
  /**
   * Get benchmark parameters from configuration
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   * @returns {object} Benchmark parameters
   */
  getBenchmarkParams(benchmarkId, config) {
    // Look for benchmark-specific parameters
    if (config.benchmarks && Array.isArray(config.benchmarks)) {
      const benchmarkConfig = config.benchmarks.find(b => {
        return typeof b === 'object' && b.id === benchmarkId;
      });
      
      if (benchmarkConfig && benchmarkConfig.params) {
        return benchmarkConfig.params;
      }
    }
    
    // Look for standard params structure
    if (config.params && config.params[benchmarkId]) {
      return config.params[benchmarkId];
    }
    
    // Default empty params
    return {};
  }
  
  /**
   * Get a specific benchmark parameter
   * @param {string} benchmarkId - Benchmark identifier
   * @param {object} config - Benchmark configuration
   * @param {string} paramName - Parameter name
   * @param {any} defaultValue - Default value if parameter not found
   * @returns {any} Parameter value
   */
  getBenchmarkParam(benchmarkId, config, paramName, defaultValue) {
    const params = this.getBenchmarkParams(benchmarkId, config);
    return params[paramName] !== undefined ? params[paramName] : defaultValue;
  }
  
  /**
   * Ensure services are running
   */
  async ensureServicesRunning() {
    // Make sure Python server is running
    if (!pythonBridge.isServerRunning()) {
      await testHandler.startAllServices();
    }
  }
  
  /**
   * Export results to a JSON file
   * @param {object} data - Results data
   * @returns {Promise<string>} Path to the exported file
   */
  async exportResults(data) {
    return new Promise((resolve, reject) => {
      try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const fileName = `benchmark_results_${timestamp}.json`;
        
        // Create results directory if it doesn't exist
        const resultsDir = path.join(process.cwd(), 'benchmark_results');
        if (!fs.existsSync(resultsDir)) {
          fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const filePath = path.join(resultsDir, fileName);
        
        // Add timestamp to data
        const exportData = {
          ...data,
          exported_at: timestamp
        };
        
        // Write to file
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
        console.log(`Results exported to: ${filePath}`);
        
        resolve(filePath);
      } catch (error) {
        reject(error);
      }
    });
  }
}

const benchmarkHandler = new BenchmarkHandler();
export default benchmarkHandler;