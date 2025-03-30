/**
 * IPFS Modules Test & Benchmark Dashboard
 * 
 * This dashboard provides a comprehensive interface for testing and benchmarking
 * the IPFS Python modules:
 * - ipfs_datasets_py
 * - ipfs_faiss_py
 * - ipfs_kit_py
 * - ipfs_accelerate_py
 * - ipfs_embeddings_py
 * - ipfs_model_manager_py
 */

import { ipcRenderer } from 'electron';
import Chart from 'chart.js/auto';

// Module definitions with test and benchmark configurations
const MODULES = {
  'ipfs_kit_py': {
    name: 'IPFS Kit',
    description: 'Core IPFS functionality for interacting with the IPFS network',
    icon: 'network',
    tests: ['initialization', 'node_connection', 'content_operations', 'config_operations'],
    benchmarks: [
      { id: 'add_small', name: 'Add Small File (1KB)', params: { size: 1024 } },
      { id: 'add_medium', name: 'Add Medium File (1MB)', params: { size: 1024 * 1024 } },
      { id: 'add_large', name: 'Add Large File (10MB)', params: { size: 10 * 1024 * 1024 } },
      { id: 'cat_small', name: 'Cat Small File (1KB)', params: { size: 1024 } },
      { id: 'cat_medium', name: 'Cat Medium File (1MB)', params: { size: 1024 * 1024 } },
      { id: 'cat_large', name: 'Cat Large File (10MB)', params: { size: 10 * 1024 * 1024 } }
    ]
  },
  'ipfs_datasets_py': {
    name: 'IPFS Datasets',
    description: 'Dataset management and access over IPFS',
    icon: 'database',
    tests: ['initialization', 'registry', 'list_datasets', 'dataset_loading', 'sample_loading'],
    benchmarks: [
      { id: 'list_datasets', name: 'List Datasets', params: {} },
      { id: 'load_small_dataset', name: 'Load Small Dataset', params: { size: 'small' } },
      { id: 'load_medium_dataset', name: 'Load Medium Dataset', params: { size: 'medium' } },
      { id: 'load_samples', name: 'Load Dataset Samples', params: { count: 100 } }
    ]
  },
  'ipfs_faiss_py': {
    name: 'IPFS FAISS',
    description: 'Vector similarity search with FAISS over IPFS',
    icon: 'search',
    tests: ['initialization', 'index_creation', 'vector_addition', 'search'],
    benchmarks: [
      { id: 'create_index', name: 'Create Index', params: { dimensions: 128 } },
      { id: 'add_vectors_small', name: 'Add Vectors (1K)', params: { count: 1000, dimensions: 128 } },
      { id: 'add_vectors_medium', name: 'Add Vectors (10K)', params: { count: 10000, dimensions: 128 } },
      { id: 'add_vectors_large', name: 'Add Vectors (100K)', params: { count: 100000, dimensions: 128 } },
      { id: 'search_small', name: 'Search (1K vectors)', params: { count: 1000, k: 10 } },
      { id: 'search_medium', name: 'Search (10K vectors)', params: { count: 10000, k: 10 } },
      { id: 'search_large', name: 'Search (100K vectors)', params: { count: 100000, k: 10 } }
    ]
  },
  'ipfs_accelerate_py': {
    name: 'IPFS Accelerate',
    description: 'Optimized AI model execution using IPFS',
    icon: 'zap',
    tests: ['initialization', 'model_loading', 'inference', 'optimization'],
    benchmarks: [
      { id: 'load_small_model', name: 'Load Small Model', params: { size: 'small' } },
      { id: 'load_medium_model', name: 'Load Medium Model', params: { size: 'medium' } },
      { id: 'inference_small', name: 'Inference (Small Model)', params: { model: 'small', batch: 1 } },
      { id: 'inference_medium', name: 'Inference (Medium Model)', params: { model: 'medium', batch: 1 } },
      { id: 'batch_inference', name: 'Batch Inference', params: { model: 'small', batch: 8 } }
    ]
  },
  'ipfs_embeddings_py': {
    name: 'IPFS Embeddings',
    description: 'Text embedding generation and similarity search with IPFS',
    icon: 'align-center',
    tests: ['initialization', 'embedding_generation', 'similarity_comparison', 'ipfs_integration'],
    benchmarks: [
      { id: 'generate_embedding', name: 'Generate Embedding', params: { text_length: 100 } },
      { id: 'generate_batch', name: 'Generate Batch Embeddings', params: { count: 100, text_length: 100 } },
      { id: 'similarity_short', name: 'Compare Similarity (Short)', params: { text_length: 100 } },
      { id: 'similarity_long', name: 'Compare Similarity (Long)', params: { text_length: 1000 } },
      { id: 'search_similar', name: 'Search Similar Texts', params: { corpus_size: 1000, k: 10 } },
      { id: 'save_to_ipfs', name: 'Save Embeddings to IPFS', params: { count: 100 } },
      { id: 'load_from_ipfs', name: 'Load Embeddings from IPFS', params: { count: 100 } }
    ]
  },
  'ipfs_model_manager_py': {
    name: 'IPFS Model Manager',
    description: 'AI model management and distribution over IPFS',
    icon: 'box',
    tests: ['initialization', 'registry', 'list_models', 'model_loading'],
    benchmarks: [
      { id: 'list_models', name: 'List Models', params: {} },
      { id: 'load_small_model', name: 'Load Small Model', params: { size: 'small' } },
      { id: 'load_medium_model', name: 'Load Medium Model', params: { size: 'medium' } },
      { id: 'export_small_model', name: 'Export Small Model', params: { size: 'small' } },
      { id: 'import_small_model', name: 'Import Small Model', params: { size: 'small' } }
    ]
  }
};

/**
 * IPFS Modules Test Dashboard class
 */
class IPFSModulesTestDashboard {
  /**
   * Initialize the dashboard
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.container = options.container || document.createElement('div');
    this.container.className = 'ipfs-modules-dashboard';
    this.charts = {};
    this.benchmarkResults = {};
    this.testResults = {};
    this.activeModule = null;
    this.isTestRunning = false;
    this.isBenchmarkRunning = false;
    
    // Initialize UI
    this.render();
    this.setupEventListeners();
    
    // Check service status on initialization
    this.checkServiceStatus();
  }
  
  /**
   * Render the dashboard UI
   */
  render() {
    // Clear container
    this.container.innerHTML = '';
    
    // Add dashboard header
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    header.innerHTML = `
      <h1>IPFS Python Modules Test & Benchmark Dashboard</h1>
      <div class="service-status">
        <span class="status-label">Services:</span>
        <span class="status-indicator" id="service-status-indicator">Checking...</span>
        <button id="start-services-btn">Start Services</button>
        <button id="stop-services-btn">Stop Services</button>
      </div>
    `;
    this.container.appendChild(header);
    
    // Add module selector
    const moduleSelector = document.createElement('div');
    moduleSelector.className = 'module-selector';
    
    let moduleButtons = '';
    Object.keys(MODULES).forEach(moduleId => {
      const module = MODULES[moduleId];
      moduleButtons += `
        <button class="module-btn" data-module="${moduleId}">
          <span class="module-icon">${this.getIconSvg(module.icon)}</span>
          <span class="module-name">${module.name}</span>
        </button>
      `;
    });
    
    moduleSelector.innerHTML = `
      <div class="selector-label">Select Module:</div>
      <div class="module-buttons">
        ${moduleButtons}
      </div>
    `;
    this.container.appendChild(moduleSelector);
    
    // Add main content area
    const content = document.createElement('div');
    content.className = 'dashboard-content';
    content.innerHTML = `
      <div class="module-info">
        <h2>Select a module to begin</h2>
        <p>Choose one of the IPFS Python modules above to run tests and benchmarks.</p>
      </div>
      
      <div class="module-detail hidden">
        <h2 id="module-detail-name"></h2>
        <p id="module-detail-description"></p>
        
        <div class="tabs">
          <button class="tab-btn active" data-tab="test">Tests</button>
          <button class="tab-btn" data-tab="benchmark">Benchmarks</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        
        <div class="tab-content">
          <div class="tab-pane active" id="test-pane">
            <div class="action-bar">
              <button id="run-tests-btn" class="action-btn primary">Run All Tests</button>
              <select id="test-environment">
                <option value="real">Real Environment</option>
                <option value="mock">Mock Environment</option>
              </select>
            </div>
            
            <div class="test-results">
              <div class="results-summary" id="test-summary">
                <div class="summary-item">
                  <span class="summary-label">Status:</span>
                  <span class="summary-value" id="test-status">Not Run</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Success Rate:</span>
                  <span class="summary-value" id="test-success-rate">-</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Duration:</span>
                  <span class="summary-value" id="test-duration">-</span>
                </div>
              </div>
              
              <div class="tests-list" id="tests-list">
                <p>Select a module and run tests to see results.</p>
              </div>
            </div>
          </div>
          
          <div class="tab-pane" id="benchmark-pane">
            <div class="action-bar">
              <button id="run-benchmarks-btn" class="action-btn primary">Run All Benchmarks</button>
              <button id="run-selected-benchmark-btn" class="action-btn">Run Selected</button>
              <select id="benchmark-count">
                <option value="3">3 Iterations</option>
                <option value="5" selected>5 Iterations</option>
                <option value="10">10 Iterations</option>
                <option value="20">20 Iterations</option>
              </select>
            </div>
            
            <div class="benchmark-results">
              <div class="results-summary" id="benchmark-summary">
                <div class="summary-item">
                  <span class="summary-label">Status:</span>
                  <span class="summary-value" id="benchmark-status">Not Run</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Running:</span>
                  <span class="summary-value" id="current-benchmark">-</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Progress:</span>
                  <span class="summary-value" id="benchmark-progress">-</span>
                </div>
              </div>
              
              <div class="benchmarks-list" id="benchmarks-list">
                <p>Select a module and run benchmarks to see results.</p>
              </div>
              
              <div class="benchmark-charts">
                <h3>Performance Results</h3>
                <p id="no-benchmark-data">No benchmark data available yet.</p>
                <div id="chart-container" class="chart-container"></div>
              </div>
            </div>
          </div>
          
          <div class="tab-pane" id="history-pane">
            <div class="action-bar">
              <button id="export-results-btn" class="action-btn">Export Results</button>
              <select id="history-filter">
                <option value="all">All Results</option>
                <option value="tests">Tests Only</option>
                <option value="benchmarks">Benchmarks Only</option>
              </select>
            </div>
            
            <div class="history-results">
              <h3>Test & Benchmark History</h3>
              <div id="history-list" class="history-list">
                <p>No historical data available yet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(content);
    
    // Add styles
    this.addStyles();
  }
  
  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Service control buttons
    this.container.querySelector('#start-services-btn').addEventListener('click', () => {
      this.startServices();
    });
    
    this.container.querySelector('#stop-services-btn').addEventListener('click', () => {
      this.stopServices();
    });
    
    // Module selection
    this.container.querySelectorAll('.module-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const moduleId = e.currentTarget.dataset.module;
        this.selectModule(moduleId);
      });
    });
    
    // Tab switching
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabId = e.currentTarget.dataset.tab;
        this.switchTab(tabId);
      });
    });
    
    // Test buttons
    this.container.querySelector('#run-tests-btn').addEventListener('click', () => {
      if (this.activeModule) {
        this.runTests(this.activeModule);
      }
    });
    
    // Benchmark buttons
    this.container.querySelector('#run-benchmarks-btn').addEventListener('click', () => {
      if (this.activeModule) {
        this.runAllBenchmarks(this.activeModule);
      }
    });
    
    this.container.querySelector('#run-selected-benchmark-btn').addEventListener('click', () => {
      if (this.activeModule) {
        const selectedBenchmarks = this.getSelectedBenchmarks();
        if (selectedBenchmarks.length > 0) {
          this.runBenchmarks(this.activeModule, selectedBenchmarks);
        } else {
          this.showNotification('Please select at least one benchmark', 'warning');
        }
      }
    });
    
    // Export button
    this.container.querySelector('#export-results-btn').addEventListener('click', () => {
      this.exportResults();
    });
    
    // IPC event listeners for service status
    ipcRenderer.on('services-status', (event, status) => {
      this.updateServiceStatus(status);
    });
    
    // IPC event listeners for test results
    ipcRenderer.on('test-result', (event, result) => {
      this.updateTestResults(result);
    });
    
    // IPC event listeners for benchmark results
    ipcRenderer.on('benchmark-result', (event, result) => {
      this.updateBenchmarkResults(result);
    });
    
    // IPC event listeners for completed benchmarks
    ipcRenderer.on('benchmark-complete', (event, result) => {
      this.benchmarkComplete(result);
    });
    
    // IPC event listeners for export completion
    ipcRenderer.on('export-complete', (event, result) => {
      if (result.success) {
        this.showNotification(`Results exported to: ${result.path}`, 'success');
      } else {
        this.showNotification(`Export failed: ${result.error}`, 'error');
      }
    });
  }
  
  /**
   * Check service status
   */
  checkServiceStatus() {
    ipcRenderer.send('check-services-status');
  }
  
  /**
   * Start services
   */
  startServices() {
    ipcRenderer.send('start-all-services');
    
    // Update UI
    const indicator = this.container.querySelector('#service-status-indicator');
    indicator.textContent = 'Starting...';
    indicator.className = 'status-indicator loading';
  }
  
  /**
   * Stop services
   */
  stopServices() {
    ipcRenderer.send('stop-all-services');
    
    // Update UI
    const indicator = this.container.querySelector('#service-status-indicator');
    indicator.textContent = 'Stopping...';
    indicator.className = 'status-indicator loading';
  }
  
  /**
   * Update service status in UI
   */
  updateServiceStatus(status) {
    const indicator = this.container.querySelector('#service-status-indicator');
    
    if (status.running) {
      indicator.textContent = 'Running';
      indicator.className = 'status-indicator running';
    } else {
      indicator.textContent = 'Stopped';
      indicator.className = 'status-indicator stopped';
    }
    
    // Enable/disable buttons
    this.container.querySelector('#start-services-btn').disabled = status.running;
    this.container.querySelector('#stop-services-btn').disabled = !status.running;
    
    // If there was an error, show it
    if (status.error) {
      this.showNotification(`Service error: ${status.error}`, 'error');
    }
  }
  
  /**
   * Select a module
   */
  selectModule(moduleId) {
    if (!MODULES[moduleId]) {
      console.error(`Unknown module: ${moduleId}`);
      return;
    }
    
    // Update active module
    this.activeModule = moduleId;
    
    // Update UI
    const moduleInfo = MODULES[moduleId];
    
    // Update module selection
    this.container.querySelectorAll('.module-btn').forEach(btn => {
      if (btn.dataset.module === moduleId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Show module detail
    this.container.querySelector('.module-info').classList.add('hidden');
    this.container.querySelector('.module-detail').classList.remove('hidden');
    
    // Update module detail
    this.container.querySelector('#module-detail-name').textContent = moduleInfo.name;
    this.container.querySelector('#module-detail-description').textContent = moduleInfo.description;
    
    // Build tests list
    this.renderTestsList(moduleId);
    
    // Build benchmarks list
    this.renderBenchmarksList(moduleId);
    
    // Update history for this module
    this.updateHistoryView(moduleId);
    
    // Reset test summary
    this.resetTestSummary();
    
    // Reset benchmark summary
    this.resetBenchmarkSummary();
  }
  
  /**
   * Switch between tabs
   */
  switchTab(tabId) {
    // Update tab buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Update tab panes
    this.container.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    this.container.querySelector(`#${tabId}-pane`).classList.add('active');
    
    // If switching to benchmark tab, resize charts if needed
    if (tabId === 'benchmark' && Object.keys(this.charts).length > 0) {
      Object.values(this.charts).forEach(chart => {
        if (chart) {
          chart.resize();
        }
      });
    }
  }
  
  /**
   * Render the tests list for a module
   */
  renderTestsList(moduleId) {
    const testsListEl = this.container.querySelector('#tests-list');
    const moduleInfo = MODULES[moduleId];
    
    let html = '<ul class="test-items">';
    
    moduleInfo.tests.forEach(testId => {
      const testName = testId.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      html += `
        <li class="test-item" data-test="${testId}">
          <div class="test-item-header">
            <span class="test-name">${testName}</span>
            <span class="test-status" id="test-status-${testId}">Not Run</span>
          </div>
          <div class="test-details hidden" id="test-details-${testId}"></div>
        </li>
      `;
    });
    
    html += '</ul>';
    testsListEl.innerHTML = html;
    
    // Add click handlers
    testsListEl.querySelectorAll('.test-item-header').forEach(item => {
      item.addEventListener('click', (e) => {
        const testId = e.currentTarget.parentElement.dataset.test;
        const detailsEl = document.getElementById(`test-details-${testId}`);
        detailsEl.classList.toggle('hidden');
      });
    });
  }
  
  /**
   * Render the benchmarks list for a module
   */
  renderBenchmarksList(moduleId) {
    const benchmarksListEl = this.container.querySelector('#benchmarks-list');
    const moduleInfo = MODULES[moduleId];
    
    let html = '<ul class="benchmark-items">';
    
    moduleInfo.benchmarks.forEach(benchmark => {
      html += `
        <li class="benchmark-item" data-benchmark="${benchmark.id}">
          <div class="benchmark-header">
            <input type="checkbox" id="benchmark-checkbox-${benchmark.id}" class="benchmark-checkbox" checked>
            <label for="benchmark-checkbox-${benchmark.id}">${benchmark.name}</label>
            <span class="benchmark-status" id="benchmark-status-${benchmark.id}">Not Run</span>
          </div>
          <div class="benchmark-details hidden" id="benchmark-details-${benchmark.id}">
            <div class="benchmark-params">
              <h4>Parameters:</h4>
              <pre>${JSON.stringify(benchmark.params, null, 2)}</pre>
            </div>
            <div class="benchmark-results" id="benchmark-results-${benchmark.id}">
              <p>No results yet</p>
            </div>
          </div>
        </li>
      `;
    });
    
    html += '</ul>';
    benchmarksListEl.innerHTML = html;
    
    // Add click handlers
    benchmarksListEl.querySelectorAll('.benchmark-header label').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't toggle details when clicking the label
      });
    });
    
    benchmarksListEl.querySelectorAll('.benchmark-header').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') { // Don't toggle when clicking checkboxes
          const benchmarkId = e.currentTarget.parentElement.dataset.benchmark;
          const detailsEl = document.getElementById(`benchmark-details-${benchmarkId}`);
          detailsEl.classList.toggle('hidden');
        }
      });
    });
    
    // Reset chart container
    this.container.querySelector('#chart-container').innerHTML = '';
    this.container.querySelector('#no-benchmark-data').style.display = 'block';
    this.charts = {};
  }
  
  /**
   * Run tests for a module
   */
  async runTests(moduleId) {
    if (this.isTestRunning) {
      this.showNotification('Tests are already running', 'warning');
      return;
    }
    
    this.isTestRunning = true;
    
    // Reset test results
    this.resetTestSummary();
    this.testResults[moduleId] = null;
    
    // Update UI
    this.container.querySelector('#test-status').textContent = 'Running...';
    this.container.querySelector('#test-status').className = 'summary-value running';
    
    // Update individual test statuses
    MODULES[moduleId].tests.forEach(testId => {
      const statusEl = document.getElementById(`test-status-${testId}`);
      if (statusEl) {
        statusEl.textContent = 'Pending...';
        statusEl.className = 'test-status pending';
      }
      
      const detailsEl = document.getElementById(`test-details-${testId}`);
      if (detailsEl) {
        detailsEl.innerHTML = '<p>Test pending...</p>';
      }
    });
    
    // Get environment setting
    const environment = this.container.querySelector('#test-environment').value;
    
    // Prepare test config
    const config = {
      environment: environment === 'mock' ? 'mock' : 'real',
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'test-dashboard'
      }
    };
    
    // Send test request
    const startTime = Date.now();
    ipcRenderer.send('test-module', { module: moduleId, config });
    
    // Handle test completion in the updateTestResults method
  }
  
  /**
   * Update test results
   */
  updateTestResults(result) {
    if (!result || !result.module) return;
    
    const moduleId = result.module;
    this.testResults[moduleId] = result;
    
    // If this isn't the active module, just store results
    if (this.activeModule !== moduleId) return;
    
    // Update summary
    const successRate = result.success ? '100%' : '0%';
    const duration = result.duration ? `${result.duration}ms` : '-';
    
    this.container.querySelector('#test-status').textContent = result.success ? 'Passed' : 'Failed';
    this.container.querySelector('#test-status').className = `summary-value ${result.success ? 'passed' : 'failed'}`;
    this.container.querySelector('#test-success-rate').textContent = successRate;
    this.container.querySelector('#test-duration').textContent = duration;
    
    // Update test details if we have them
    if (result.details) {
      Object.entries(result.details).forEach(([key, value]) => {
        // Skip non-test fields
        if (['module', 'success', 'error', 'metadata', 'capabilities'].includes(key)) return;
        
        const statusEl = document.getElementById(`test-status-${key}`);
        const detailsEl = document.getElementById(`test-details-${key}`);
        
        if (statusEl) {
          let status, statusClass;
          
          if (typeof value === 'boolean') {
            status = value ? 'Passed' : 'Failed';
            statusClass = value ? 'passed' : 'failed';
          } else if (typeof value === 'object') {
            status = value.success ? 'Passed' : 'Failed';
            statusClass = value.success ? 'passed' : 'failed';
          } else {
            status = value ? 'Passed' : 'Failed';
            statusClass = value ? 'passed' : 'failed';
          }
          
          statusEl.textContent = status;
          statusEl.className = `test-status ${statusClass}`;
        }
        
        if (detailsEl) {
          let detailsContent;
          
          if (typeof value === 'object') {
            detailsContent = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
          } else {
            detailsContent = `<p>Result: ${value}</p>`;
          }
          
          detailsEl.innerHTML = detailsContent;
        }
      });
    }
    
    // Mark test as complete
    this.isTestRunning = false;
    
    // Update history
    this.updateHistoryView(moduleId);
    
    // Show notification
    this.showNotification(
      result.success ? 'Tests completed successfully' : `Tests failed: ${result.error || 'Unknown error'}`,
      result.success ? 'success' : 'error'
    );
  }
  
  /**
   * Reset test summary
   */
  resetTestSummary() {
    this.container.querySelector('#test-status').textContent = 'Not Run';
    this.container.querySelector('#test-status').className = 'summary-value';
    this.container.querySelector('#test-success-rate').textContent = '-';
    this.container.querySelector('#test-duration').textContent = '-';
  }
  
  /**
   * Get selected benchmarks
   */
  getSelectedBenchmarks() {
    const selectedBenchmarks = [];
    
    this.container.querySelectorAll('.benchmark-checkbox:checked').forEach(checkbox => {
      const benchmarkId = checkbox.id.replace('benchmark-checkbox-', '');
      selectedBenchmarks.push(benchmarkId);
    });
    
    return selectedBenchmarks;
  }
  
  /**
   * Run all benchmarks for a module
   */
  runAllBenchmarks(moduleId) {
    // Get all benchmark IDs for this module
    const benchmarks = MODULES[moduleId].benchmarks.map(b => b.id);
    this.runBenchmarks(moduleId, benchmarks);
  }
  
  /**
   * Run selected benchmarks
   */
  runBenchmarks(moduleId, benchmarkIds) {
    if (this.isBenchmarkRunning) {
      this.showNotification('Benchmarks are already running', 'warning');
      return;
    }
    
    if (!benchmarkIds || benchmarkIds.length === 0) {
      this.showNotification('No benchmarks selected', 'warning');
      return;
    }
    
    this.isBenchmarkRunning = true;
    
    // Reset benchmark results for these IDs
    benchmarkIds.forEach(id => {
      delete this.benchmarkResults[`${moduleId}_${id}`];
    });
    
    // Update UI
    this.resetBenchmarkSummary();
    this.container.querySelector('#benchmark-status').textContent = 'Running...';
    this.container.querySelector('#benchmark-status').className = 'summary-value running';
    
    // Update individual benchmark statuses
    benchmarkIds.forEach(id => {
      const statusEl = document.getElementById(`benchmark-status-${id}`);
      if (statusEl) {
        statusEl.textContent = 'Pending...';
        statusEl.className = 'benchmark-status pending';
      }
      
      const resultsEl = document.getElementById(`benchmark-results-${id}`);
      if (resultsEl) {
        resultsEl.innerHTML = '<p>Benchmark pending...</p>';
      }
    });
    
    // Get iteration count
    const iterations = parseInt(this.container.querySelector('#benchmark-count').value);
    
    // Prepare benchmark config
    const config = {
      iterations,
      benchmarks: benchmarkIds,
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'benchmark-dashboard'
      }
    };
    
    // Send benchmark request
    ipcRenderer.send('run-benchmarks', { module: moduleId, config });
  }
  
  /**
   * Update benchmark results
   */
  updateBenchmarkResults(result) {
    if (!result || !result.module || !result.benchmark) return;
    
    const { module, benchmark, iteration, totalIterations, duration } = result;
    const benchmarkKey = `${module}_${benchmark}`;
    
    // Initialize results array if needed
    if (!this.benchmarkResults[benchmarkKey]) {
      this.benchmarkResults[benchmarkKey] = [];
    }
    
    // Add this result
    this.benchmarkResults[benchmarkKey].push({
      iteration,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Update UI if this is the active module
    if (this.activeModule === module) {
      // Update current benchmark
      const benchmarkInfo = MODULES[module].benchmarks.find(b => b.id === benchmark);
      this.container.querySelector('#current-benchmark').textContent = benchmarkInfo ? benchmarkInfo.name : benchmark;
      
      // Update progress
      this.container.querySelector('#benchmark-progress').textContent = `${iteration}/${totalIterations}`;
      
      // Update benchmark status
      const statusEl = document.getElementById(`benchmark-status-${benchmark}`);
      if (statusEl) {
        statusEl.textContent = `Running (${iteration}/${totalIterations})`;
        statusEl.className = 'benchmark-status running';
      }
      
      // Update benchmark results
      const resultsEl = document.getElementById(`benchmark-results-${benchmark}`);
      if (resultsEl) {
        const results = this.benchmarkResults[benchmarkKey];
        
        let html = '<table class="results-table">';
        html += '<thead><tr><th>Iteration</th><th>Duration (ms)</th></tr></thead>';
        html += '<tbody>';
        
        results.forEach(item => {
          html += `<tr><td>${item.iteration}</td><td>${item.duration}</td></tr>`;
        });
        
        html += '</tbody></table>';
        resultsEl.innerHTML = html;
      }
    }
  }
  
  /**
   * Handle benchmark completion
   */
  benchmarkComplete(result) {
    if (!result || !result.module) return;
    
    const { module, success, benchmarks } = result;
    
    // Update UI if this is the active module
    if (this.activeModule === module) {
      // Update benchmark summary
      this.container.querySelector('#benchmark-status').textContent = success ? 'Complete' : 'Failed';
      this.container.querySelector('#benchmark-status').className = `summary-value ${success ? 'passed' : 'failed'}`;
      this.container.querySelector('#current-benchmark').textContent = '-';
      this.container.querySelector('#benchmark-progress').textContent = '-';
      
      // Update benchmark statuses
      benchmarks.forEach(benchmark => {
        const statusEl = document.getElementById(`benchmark-status-${benchmark}`);
        if (statusEl) {
          statusEl.textContent = 'Complete';
          statusEl.className = 'benchmark-status passed';
        }
      });
      
      // Create or update charts
      this.updateBenchmarkCharts(module, benchmarks);
    }
    
    // Mark benchmarks as complete
    this.isBenchmarkRunning = false;
    
    // Update history
    this.updateHistoryView(module);
    
    // Show notification
    this.showNotification(
      success ? 'Benchmarks completed successfully' : 'Some benchmarks failed',
      success ? 'success' : 'warning'
    );
  }
  
  /**
   * Reset benchmark summary
   */
  resetBenchmarkSummary() {
    this.container.querySelector('#benchmark-status').textContent = 'Not Run';
    this.container.querySelector('#benchmark-status').className = 'summary-value';
    this.container.querySelector('#current-benchmark').textContent = '-';
    this.container.querySelector('#benchmark-progress').textContent = '-';
  }
  
  /**
   * Update benchmark charts
   */
  updateBenchmarkCharts(moduleId, benchmarkIds) {
    const chartContainer = this.container.querySelector('#chart-container');
    const noDataEl = this.container.querySelector('#no-benchmark-data');
    
    // Clear previous charts
    chartContainer.innerHTML = '';
    
    // Check if we have results
    const hasResults = benchmarkIds.some(id => {
      const key = `${moduleId}_${id}`;
      return this.benchmarkResults[key] && this.benchmarkResults[key].length > 0;
    });
    
    if (!hasResults) {
      noDataEl.style.display = 'block';
      return;
    }
    
    noDataEl.style.display = 'none';
    
    // Create main chart with all benchmarks
    const mainChartCanvas = document.createElement('canvas');
    mainChartCanvas.id = 'main-benchmark-chart';
    chartContainer.appendChild(mainChartCanvas);
    
    // Prepare datasets
    const datasets = [];
    const labels = [];
    let maxIterations = 0;
    
    benchmarkIds.forEach(id => {
      const key = `${moduleId}_${id}`;
      const results = this.benchmarkResults[key];
      
      if (results && results.length > 0) {
        // Find benchmark info
        const benchmarkInfo = MODULES[moduleId].benchmarks.find(b => b.id === id);
        const name = benchmarkInfo ? benchmarkInfo.name : id;
        
        // Get durations
        const durations = results.map(r => r.duration);
        
        // Update max iterations
        maxIterations = Math.max(maxIterations, results.length);
        
        // Add dataset
        datasets.push({
          label: name,
          data: durations,
          borderColor: this.getRandomColor(),
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          tension: 0.1
        });
      }
    });
    
    // Create labels (1 to max iterations)
    for (let i = 1; i <= maxIterations; i++) {
      labels.push(`Iteration ${i}`);
    }
    
    // Create chart
    this.charts.main = new Chart(mainChartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Benchmark Performance (Duration in ms)'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Duration (ms)'
            }
          }
        }
      }
    });
    
    // Create individual charts for each benchmark
    benchmarkIds.forEach(id => {
      const key = `${moduleId}_${id}`;
      const results = this.benchmarkResults[key];
      
      if (results && results.length > 0) {
        // Find benchmark info
        const benchmarkInfo = MODULES[moduleId].benchmarks.find(b => b.id === id);
        const name = benchmarkInfo ? benchmarkInfo.name : id;
        
        // Create chart container
        const chartDiv = document.createElement('div');
        chartDiv.className = 'individual-chart';
        chartContainer.appendChild(chartDiv);
        
        // Create chart canvas
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${id}`;
        chartDiv.appendChild(canvas);
        
        // Get durations
        const durations = results.map(r => r.duration);
        const iterations = results.map(r => `Iteration ${r.iteration}`);
        
        // Calculate statistics
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const avg = durations.reduce((sum, val) => sum + val, 0) / durations.length;
        
        // Create chart
        this.charts[id] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: iterations,
            datasets: [{
              label: name,
              data: durations,
              backgroundColor: this.getRandomColor(0.6)
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: name
              },
              subtitle: {
                display: true,
                text: `Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms | Avg: ${avg.toFixed(2)}ms`
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Duration (ms)'
                }
              }
            }
          }
        });
      }
    });
  }
  
  /**
   * Update history view
   */
  updateHistoryView(moduleId) {
    const historyList = this.container.querySelector('#history-list');
    const filter = this.container.querySelector('#history-filter').value;
    
    // Collect all results for this module
    const historyItems = [];
    
    // Add test results
    if (this.testResults[moduleId] && (filter === 'all' || filter === 'tests')) {
      historyItems.push({
        type: 'test',
        timestamp: this.testResults[moduleId].timestamp || new Date().toISOString(),
        success: this.testResults[moduleId].success,
        details: this.testResults[moduleId]
      });
    }
    
    // Add benchmark results
    if (filter === 'all' || filter === 'benchmarks') {
      // Group benchmark results by timestamp (using the first result's timestamp)
      const benchmarkGroups = {};
      
      Object.entries(this.benchmarkResults).forEach(([key, results]) => {
        if (key.startsWith(`${moduleId}_`) && results.length > 0) {
          const timestamp = results[0].timestamp;
          if (!benchmarkGroups[timestamp]) {
            benchmarkGroups[timestamp] = {
              benchmarks: []
            };
          }
          
          const benchmarkId = key.replace(`${moduleId}_`, '');
          benchmarkGroups[timestamp].benchmarks.push({
            id: benchmarkId,
            results
          });
        }
      });
      
      // Add each group as a history item
      Object.entries(benchmarkGroups).forEach(([timestamp, group]) => {
        historyItems.push({
          type: 'benchmark',
          timestamp,
          success: true, // Assume success since we don't track benchmark failure
          details: group
        });
      });
    }
    
    // Sort by timestamp (newest first)
    historyItems.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Update UI
    if (historyItems.length === 0) {
      historyList.innerHTML = '<p>No historical data available for this module.</p>';
      return;
    }
    
    let html = '';
    
    historyItems.forEach((item, index) => {
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleString();
      
      html += `
        <div class="history-item ${item.type}">
          <div class="history-item-header">
            <span class="history-type">${item.type === 'test' ? 'Test Run' : 'Benchmark Run'}</span>
            <span class="history-date">${formattedDate}</span>
            <span class="history-status ${item.success ? 'passed' : 'failed'}">${item.success ? 'Passed' : 'Failed'}</span>
          </div>
          <div class="history-item-content hidden" id="history-content-${index}">
      `;
      
      if (item.type === 'test') {
        // Test details
        html += `<pre>${JSON.stringify(item.details, null, 2)}</pre>`;
      } else {
        // Benchmark details
        html += '<div class="benchmark-summary">';
        item.details.benchmarks.forEach(benchmark => {
          const benchmarkInfo = MODULES[moduleId].benchmarks.find(b => b.id === benchmark.id) || { name: benchmark.id };
          const durations = benchmark.results.map(r => r.duration);
          const min = Math.min(...durations);
          const max = Math.max(...durations);
          const avg = durations.reduce((sum, val) => sum + val, 0) / durations.length;
          
          html += `
            <div class="benchmark-history-item">
              <h4>${benchmarkInfo.name}</h4>
              <p>
                <strong>Iterations:</strong> ${benchmark.results.length} | 
                <strong>Min:</strong> ${min.toFixed(2)}ms | 
                <strong>Max:</strong> ${max.toFixed(2)}ms | 
                <strong>Avg:</strong> ${avg.toFixed(2)}ms
              </p>
            </div>
          `;
        });
        html += '</div>';
      }
      
      html += `
          </div>
        </div>
      `;
    });
    
    historyList.innerHTML = html;
    
    // Add click handlers
    historyList.querySelectorAll('.history-item-header').forEach((header, index) => {
      header.addEventListener('click', () => {
        const contentEl = document.getElementById(`history-content-${index}`);
        contentEl.classList.toggle('hidden');
      });
    });
  }
  
  /**
   * Export results
   */
  exportResults() {
    const data = {
      tests: this.testResults,
      benchmarks: this.benchmarkResults,
      timestamp: new Date().toISOString()
    };
    
    ipcRenderer.send('export-results', data);
  }
  
  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    // Add notification container if it doesn't exist
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      document.body.appendChild(container);
    }
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${message}</span>
        <button class="notification-close">&times;</button>
      </div>
    `;
    
    // Add to container
    container.appendChild(notification);
    
    // Add event listener for close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.add('closing');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('closing');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 5000);
  }
  
  /**
   * Get a random color
   */
  getRandomColor(alpha = 1) {
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  /**
   * Get SVG icon for module
   */
  getIconSvg(icon) {
    // Simple icon mapping using Feather icons style
    const icons = {
      'network': '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"></circle><line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" stroke-width="2"></line><line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" stroke-width="2"></line><line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2"></line><line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"></line></svg>',
      'database': '<svg viewBox="0 0 24 24" width="24" height="24"><ellipse cx="12" cy="5" rx="9" ry="3" fill="none" stroke="currentColor" stroke-width="2"></ellipse><path d="M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5" fill="none" stroke="currentColor" stroke-width="2"></path><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" fill="none" stroke="currentColor" stroke-width="2"></path></svg>',
      'search': '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2"></circle><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line></svg>',
      'zap': '<svg viewBox="0 0 24 24" width="24" height="24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polygon></svg>',
      'align-center': '<svg viewBox="0 0 24 24" width="24" height="24"><line x1="18" y1="10" x2="6" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line><line x1="21" y1="6" x2="3" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line><line x1="21" y1="14" x2="3" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line><line x1="18" y1="18" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line></svg>',
      'box': '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline><line x1="12" y1="22.08" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line></svg>'
    };
    
    return icons[icon] || icons['box']; // Default to box icon
  }
  
  /**
   * Add styles to the dashboard
   */
  addStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      /* Dashboard styles */
      .ipfs-modules-dashboard {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        color: #333;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
      
      /* Header */
      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }
      
      .dashboard-header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
      }
      
      .service-status {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .status-indicator {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
      }
      
      .status-indicator.running {
        background-color: #d4f7d4;
        color: #0d6e0d;
      }
      
      .status-indicator.stopped {
        background-color: #f7d4d4;
        color: #6e0d0d;
      }
      
      .status-indicator.loading {
        background-color: #f7f7d4;
        color: #6e6e0d;
      }
      
      /* Buttons */
      button {
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        background-color: #f0f0f0;
        color: #333;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s, color 0.2s;
      }
      
      button:hover {
        background-color: #e0e0e0;
      }
      
      button:active {
        background-color: #d0d0d0;
      }
      
      button:disabled {
        background-color: #f0f0f0;
        color: #999;
        cursor: not-allowed;
      }
      
      button.action-btn {
        padding: 8px 16px;
        font-weight: 500;
      }
      
      button.action-btn.primary {
        background-color: #1a73e8;
        color: white;
      }
      
      button.action-btn.primary:hover {
        background-color: #1765c9;
      }
      
      /* Module Selector */
      .module-selector {
        margin-bottom: 20px;
      }
      
      .selector-label {
        font-weight: 500;
        margin-bottom: 8px;
      }
      
      .module-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      
      .module-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px;
        border-radius: 6px;
        min-width: 100px;
        transition: all 0.2s;
      }
      
      .module-btn.active {
        background-color: #e0edfd;
      }
      
      .module-icon {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 40px;
        height: 40px;
        margin-bottom: 6px;
        color: #1a73e8;
      }
      
      .module-name {
        font-size: 14px;
        font-weight: 500;
      }
      
      /* Content */
      .dashboard-content {
        background-color: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        padding: 20px;
      }
      
      .module-info {
        text-align: center;
        padding: 40px 0;
      }
      
      .module-info h2 {
        margin-top: 0;
        margin-bottom: 10px;
      }
      
      .module-detail h2 {
        margin-top: 0;
        margin-bottom: 5px;
      }
      
      .module-detail p {
        margin-top: 0;
        margin-bottom: 20px;
        color: #666;
      }
      
      /* Tabs */
      .tabs {
        display: flex;
        border-bottom: 1px solid #eee;
        margin-bottom: 20px;
      }
      
      .tab-btn {
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        font-weight: 500;
      }
      
      .tab-btn.active {
        border-bottom: 2px solid #1a73e8;
        color: #1a73e8;
      }
      
      .tab-content {
        position: relative;
      }
      
      .tab-pane {
        display: none;
        animation: fadeIn 0.3s;
      }
      
      .tab-pane.active {
        display: block;
      }
      
      /* Action Bar */
      .action-bar {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      
      /* Results Summary */
      .results-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 15px;
        padding: 10px;
        background-color: #f9f9f9;
        border-radius: 4px;
      }
      
      .summary-item {
        display: flex;
        flex-direction: column;
      }
      
      .summary-label {
        font-size: 12px;
        font-weight: 500;
        color: #666;
      }
      
      .summary-value {
        font-size: 16px;
        font-weight: 600;
      }
      
      .summary-value.running {
        color: #4285f4;
      }
      
      .summary-value.passed {
        color: #0d904f;
      }
      
      .summary-value.failed {
        color: #d93025;
      }
      
      /* Tests List */
      .test-items {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .test-item {
        margin-bottom: 8px;
        border: 1px solid #eee;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .test-item-header {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        cursor: pointer;
        background-color: #f9f9f9;
      }
      
      .test-item-header:hover {
        background-color: #f5f5f5;
      }
      
      .test-name {
        font-weight: 500;
      }
      
      .test-status {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }
      
      .test-status.running, .benchmark-status.running, .test-status.pending, .benchmark-status.pending {
        background-color: #e0edfd;
        color: #1a73e8;
      }
      
      .test-status.passed, .benchmark-status.passed {
        background-color: #d4f7d4;
        color: #0d6e0d;
      }
      
      .test-status.failed, .benchmark-status.failed {
        background-color: #f7d4d4;
        color: #6e0d0d;
      }
      
      .test-details {
        padding: 10px;
        background-color: #fff;
        border-top: 1px solid #eee;
      }
      
      /* Benchmarks List */
      .benchmark-items {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .benchmark-item {
        margin-bottom: 8px;
        border: 1px solid #eee;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .benchmark-header {
        display: flex;
        align-items: center;
        padding: 10px;
        cursor: pointer;
        background-color: #f9f9f9;
      }
      
      .benchmark-header:hover {
        background-color: #f5f5f5;
      }
      
      .benchmark-checkbox {
        margin-right: 10px;
      }
      
      .benchmark-status {
        margin-left: auto;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }
      
      .benchmark-details {
        padding: 10px;
        background-color: #fff;
        border-top: 1px solid #eee;
      }
      
      .benchmark-params {
        margin-bottom: 15px;
      }
      
      .benchmark-params pre {
        background-color: #f5f5f5;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        overflow: auto;
        margin: 0;
      }
      
      /* Chart Container */
      .chart-container {
        margin-top: 20px;
      }
      
      .individual-chart {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #eee;
      }
      
      /* History */
      .history-item {
        margin-bottom: 10px;
        border: 1px solid #eee;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .history-item-header {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        cursor: pointer;
        background-color: #f9f9f9;
      }
      
      .history-item-header:hover {
        background-color: #f5f5f5;
      }
      
      .history-type {
        font-weight: 500;
      }
      
      .history-date {
        color: #666;
      }
      
      .history-status {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }
      
      .history-status.passed {
        background-color: #d4f7d4;
        color: #0d6e0d;
      }
      
      .history-status.failed {
        background-color: #f7d4d4;
        color: #6e0d0d;
      }
      
      .history-item-content {
        padding: 10px;
        background-color: #fff;
        border-top: 1px solid #eee;
      }
      
      .benchmark-history-item {
        margin-bottom: 10px;
        padding: 10px;
        background-color: #f9f9f9;
        border-radius: 4px;
      }
      
      .benchmark-history-item h4 {
        margin-top: 0;
        margin-bottom: 5px;
      }
      
      /* Utility Classes */
      .hidden {
        display: none;
      }
      
      pre {
        background-color: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        font-size: 12px;
        overflow: auto;
        max-height: 300px;
      }
      
      /* Tables */
      .results-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
        font-size: 14px;
      }
      
      .results-table th, .results-table td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid #eee;
      }
      
      .results-table th {
        background-color: #f5f5f5;
        font-weight: 500;
      }
      
      /* Notifications */
      #notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 350px;
        z-index: 9999;
      }
      
      .notification {
        margin-bottom: 10px;
        padding: 12px 15px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        animation: slideIn 0.3s ease-out;
        transition: transform 0.3s, opacity 0.3s;
      }
      
      .notification.closing {
        transform: translateX(100%);
        opacity: 0;
      }
      
      .notification.info {
        background-color: #e8f0fe;
        border-left: 4px solid #1a73e8;
      }
      
      .notification.success {
        background-color: #e6f4ea;
        border-left: 4px solid #0d904f;
      }
      
      .notification.warning {
        background-color: #fef7e0;
        border-left: 4px solid #f9ab00;
      }
      
      .notification.error {
        background-color: #fce8e6;
        border-left: 4px solid #d93025;
      }
      
      .notification-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .notification-message {
        margin-right: 10px;
      }
      
      .notification-close {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 16px;
        padding: 0;
        margin: 0;
      }
      
      .notification-close:hover {
        color: #333;
      }
      
      /* Animations */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      /* Media Queries */
      @media (max-width: 768px) {
        .dashboard-header {
          flex-direction: column;
          align-items: flex-start;
        }
        
        .service-status {
          margin-top: 10px;
        }
        
        .module-buttons {
          overflow-x: auto;
          white-space: nowrap;
          padding-bottom: 10px;
        }
        
        .action-bar {
          flex-direction: column;
        }
      }
    `;
    
    document.head.appendChild(styleEl);
  }
}

export default IPFSModulesTestDashboard;