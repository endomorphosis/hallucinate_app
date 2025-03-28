import { ipfsDatasetsJs } from 'ipfs_datasets_js';
import { ipfsKitJs } from 'ipfs_kit_js';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Enhanced IPFS Datasets module
 * Extends the base ipfs_datasets_js functionality with additional methods
 */
class IPFSDatasets {
  constructor(resources = {}, metadata = {}) {
    // Initialize base instance
    this.ipfsDatasetsJs = new ipfsDatasetsJs(resources, metadata);
    
    // Store resources and metadata
    this.resources = resources;
    this.metadata = metadata;
    
    // Get IPFS Kit if available
    this.ipfsKit = resources.ipfsKit || (resources.ipfs_kit ? resources.ipfs_kit : null);
    
    // Get default dataset from metadata
    this.defaultDataset = metadata.dataset || null;
    
    // Get datasets path from metadata or default
    this.datasetsPath = metadata.datasetsPath || path.join(os.homedir(), '.cache', 'huggingface', 'datasets');
    
    // Ensure datasets path exists
    if (!fs.existsSync(this.datasetsPath)) {
      fs.mkdirSync(this.datasetsPath, { recursive: true });
    }
    
    // Dataset registry to track local datasets
    this.datasetRegistry = {};
    this.registryLoaded = false;
    
    console.log(`IPFS Datasets initialized with path=${this.datasetsPath}`);
  }
  
  /**
   * Initialize the datasets module
   */
  async init() {
    try {
      // Initialize base instance
      if (this.ipfsDatasetsJs.init) {
        await this.ipfsDatasetsJs.init();
      }
      
      // Initialize IPFS Kit if available
      if (this.ipfsKit && this.ipfsKit.init) {
        await this.ipfsKit.init();
      }
      
      // Load registry
      await this.loadRegistry();
      
      // Load default dataset if specified
      if (this.defaultDataset) {
        await this.loadDataset(this.defaultDataset);
      }
      
      console.log('IPFS Datasets initialized successfully');
      return true;
    } catch (error) {
      console.error('IPFS Datasets initialization failed:', error);
      return false;
    }
  }
  
  /**
   * Call method on the base ipfs_datasets_js instance
   * @param {string} method - Method name
   * @param {object} args - Method arguments
   */
  async call(method, args) {
    if (!this.ipfsDatasetsJs.call) {
      throw new Error('Base ipfs_datasets_js instance does not have call method');
    }
    
    return await this.ipfsDatasetsJs.call(method, args);
  }
  
  /**
   * Load dataset registry from local storage
   */
  async loadRegistry() {
    const registryPath = path.join(this.datasetsPath, 'dataset_registry.json');
    
    if (fs.existsSync(registryPath)) {
      try {
        const data = fs.readFileSync(registryPath, 'utf8');
        this.datasetRegistry = JSON.parse(data);
        this.registryLoaded = true;
        
        console.log(`Loaded ${Object.keys(this.datasetRegistry).length} datasets from registry`);
        return true;
      } catch (error) {
        console.error('Failed to load dataset registry:', error);
        this.datasetRegistry = {};
        return false;
      }
    } else {
      console.log('No dataset registry found, creating new one');
      this.datasetRegistry = {};
      this.registryLoaded = true;
      return true;
    }
  }
  
  /**
   * Save dataset registry to local storage
   */
  async saveRegistry() {
    const registryPath = path.join(this.datasetsPath, 'dataset_registry.json');
    
    try {
      fs.writeFileSync(registryPath, JSON.stringify(this.datasetRegistry, null, 2), 'utf8');
      console.log(`Saved ${Object.keys(this.datasetRegistry).length} datasets to registry`);
      return true;
    } catch (error) {
      console.error('Failed to save dataset registry:', error);
      return false;
    }
  }
  
  /**
   * List all datasets in the registry
   */
  async listDatasets() {
    if (!this.registryLoaded) {
      await this.loadRegistry();
    }
    
    return this.datasetRegistry;
  }
  
  /**
   * Get information about a specific dataset
   * @param {string} datasetId - Dataset identifier
   */
  async getDatasetInfo(datasetId) {
    if (!this.registryLoaded) {
      await this.loadRegistry();
    }
    
    return this.datasetRegistry[datasetId];
  }
  
  /**
   * Load a dataset using base ipfs_datasets_js implementation
   * @param {string} datasetId - Dataset identifier
   * @param {object} options - Additional options
   */
  async loadDataset(datasetId, options = {}) {
    if (!this.registryLoaded) {
      await this.loadRegistry();
    }
    
    try {
      // Check if dataset exists in registry
      if (this.datasetRegistry[datasetId]) {
        console.log(`Dataset ${datasetId} found in registry`);
      }
      
      // Use base implementation to load dataset
      const result = await this.call('load_dataset', {
        dataset_id: datasetId,
        subset: options.subset,
        split: options.split
      });
      
      if (result && !result.error) {
        // Add or update dataset in registry
        this.datasetRegistry[datasetId] = {
          dataset_id: datasetId,
          subset: options.subset,
          splits: result.splits || ['train'],
          features: result.features || {},
          last_updated: Date.now()
        };
        
        // Add local path if available
        if (result.local_path) {
          this.datasetRegistry[datasetId].local_path = result.local_path;
        }
        
        // Add IPFS CID if available
        if (result.ipfs_cid) {
          this.datasetRegistry[datasetId].ipfs_cid = result.ipfs_cid;
        }
        
        // Save registry
        await this.saveRegistry();
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to load dataset ${datasetId}:`, error);
      return { error: error.message };
    }
  }
  
  /**
   * Import a dataset from IPFS
   * @param {string} datasetId - Dataset identifier
   * @param {string} cid - IPFS content identifier
   */
  async importDatasetFromIPFS(datasetId, cid) {
    if (!this.registryLoaded) {
      await this.loadRegistry();
    }
    
    if (!this.ipfsKit) {
      return { error: 'IPFS Kit not available' };
    }
    
    try {
      // Call the base implementation
      const result = await this.call('import_dataset_from_ipfs', {
        dataset_id: datasetId,
        cid: cid
      });
      
      if (result && !result.error) {
        // Add to registry
        this.datasetRegistry[datasetId] = {
          dataset_id: datasetId,
          ipfs_cid: cid,
          local_path: result.local_path,
          splits: result.splits || ['train'],
          features: result.features || {},
          last_updated: Date.now(),
          source: 'ipfs'
        };
        
        // Save registry
        await this.saveRegistry();
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to import dataset ${datasetId} from IPFS:`, error);
      return { error: error.message };
    }
  }
  
  /**
   * Remove a dataset
   * @param {string} datasetId - Dataset identifier
   */
  async removeDataset(datasetId) {
    if (!this.registryLoaded) {
      await this.loadRegistry();
    }
    
    if (!this.datasetRegistry[datasetId]) {
      console.warn(`Dataset ${datasetId} not found in registry`);
      return false;
    }
    
    try {
      const result = await this.call('remove_dataset', {
        dataset_id: datasetId
      });
      
      if (result && result !== false) {
        // Remove from registry
        delete this.datasetRegistry[datasetId];
        
        // Save registry
        await this.saveRegistry();
        
        return true;
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to remove dataset ${datasetId}:`, error);
      return false;
    }
  }
  
  /**
   * Get sample rows from a dataset
   * @param {string} datasetId - Dataset identifier
   * @param {string} split - Dataset split
   * @param {number} numSamples - Number of samples to return
   */
  async getSample(datasetId, split = null, numSamples = 5) {
    try {
      const result = await this.call('get_sample', {
        dataset_id: datasetId,
        split: split,
        num_samples: numSamples
      });
      
      return result;
    } catch (error) {
      console.error(`Failed to get sample from dataset ${datasetId}:`, error);
      return { error: error.message };
    }
  }
  
  /**
   * Run module tests
   */
  async test() {
    console.log('Testing IPFS Datasets module');
    
    try {
      // Test initialization
      let testResults = {
        success: true,
        module: 'datasets',
        initialization: false,
        registry: false,
        list_datasets: false,
        dataset_loading: false,
        sample_loading: false,
        ipfs_integration: false,
        capabilities: {
          huggingface_datasets: false,
          ipfs: this.ipfsKit !== null,
          ipfs_datasets_js: true
        },
        metadata: this.metadata
      };
      
      // Test initialization
      const initResult = await this.init();
      testResults.initialization = initResult;
      
      // Test registry
      const registryResult = await this.loadRegistry();
      testResults.registry = registryResult;
      
      // Test listing datasets
      const datasets = await this.listDatasets();
      testResults.list_datasets = typeof datasets === 'object';
      
      // Test dataset loading and sampling via the base implementation
      try {
        const testDataset = await this.call('test_dataset_loading', {});
        testResults.dataset_loading = testDataset && !testDataset.error;
        
        if (testResults.dataset_loading) {
          const sampleResult = await this.call('test_sample_loading', {});
          testResults.sample_loading = sampleResult && !sampleResult.error;
        }
      } catch (error) {
        console.error('Dataset loading test failed:', error);
      }
      
      // Test IPFS integration
      if (this.ipfsKit) {
        try {
          const ipfsTest = await this.call('test_ipfs_integration', {});
          testResults.ipfs_integration = ipfsTest && !ipfsTest.error;
        } catch (error) {
          console.error('IPFS integration test failed:', error);
        }
      }
      
      // Update success based on individual test results
      testResults.success = testResults.initialization && 
                          testResults.registry && 
                          testResults.list_datasets;
      
      return testResults;
    } catch (error) {
      console.error('IPFS Datasets test failed:', error);
      return {
        success: false,
        module: 'datasets',
        error: error.message,
        initialization: false,
        registry: false,
        list_datasets: false,
        dataset_loading: false,
        sample_loading: false,
        ipfs_integration: false,
        capabilities: {
          huggingface_datasets: false,
          ipfs: this.ipfsKit !== null,
          ipfs_datasets_js: true
        },
        metadata: this.metadata
      };
    }
  }
}

// Create default instance
const ipfsDatasets = new IPFSDatasets();

export { IPFSDatasets, ipfsDatasets };
export default ipfsDatasets;