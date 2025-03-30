/**
 * IPFS Datasets Dashboard Component
 * 
 * This module provides a dashboard component for displaying IPFS Datasets status and operations.
 */

class IPFSDatasetsDashboard {
  /**
   * Initialize the IPFS Datasets dashboard component.
   * 
   * @param {Object} config - Dashboard configuration
   * @param {HTMLElement} config.container - Container element for the dashboard
   * @param {Function} config.rpcHandler - Function to handle JSON-RPC requests
   * @param {Object} config.options - Additional options
   */
  constructor(config) {
    this.container = config.container;
    this.rpcHandler = config.rpcHandler;
    this.options = config.options || {};
    
    // Default configuration
    this.config = {
      refreshInterval: this.options.refreshInterval || 5000, // ms
      theme: this.options.theme || 'light',
      showDatasets: this.options.showDatasets !== false,
      showMetrics: this.options.showMetrics !== false,
      showOperations: this.options.showOperations !== false,
    };
    
    // State
    this.initialized = false;
    this.status = {};
    this.lastError = null;
    this.refreshTimer = null;
    
    // Render initial state
    this.render();
  }
  
  /**
   * Initialize the IPFS Datasets backend.
   * 
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      const result = await this.rpcCall('init');
      
      if (result.success) {
        this.initialized = true;
        this.startRefresh();
      } else {
        this.lastError = result.error || 'Failed to initialize IPFS Datasets';
      }
      
      this.render();
      return result;
    } catch (error) {
      this.lastError = error.message || 'Error initializing IPFS Datasets';
      this.render();
      return { success: false, error: this.lastError };
    }
  }
  
  /**
   * Call a method on the IPFS Datasets backend.
   * 
   * @param {string} method - Method to call
   * @param {Object} params - Method parameters
   * @returns {Promise<Object>} Method result
   */
  async rpcCall(method, params = {}) {
    try {
      const resultJson = await this.rpcHandler(method, params);
      return JSON.parse(resultJson);
    } catch (error) {
      console.error(`Error calling RPC method ${method}:`, error);
      throw error;
    }
  }
  
  /**
   * Start the refresh timer.
   */
  startRefresh() {
    // Clear existing timer
    this.stopRefresh();
    
    // Start new timer
    this.refreshTimer = setInterval(() => {
      this.refreshStatus();
    }, this.config.refreshInterval);
    
    // Initial refresh
    this.refreshStatus();
  }
  
  /**
   * Stop the refresh timer.
   */
  stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * Refresh IPFS Datasets status.
   */
  async refreshStatus() {
    try {
      // Get status
      const status = await this.rpcCall('get_status');
      this.status = status;
      
      // Render updated status
      this.render();
    } catch (error) {
      console.error('Error refreshing IPFS Datasets status:', error);
      this.lastError = error.message || 'Error refreshing status';
      this.render();
    }
  }
  
  /**
   * Load a dataset.
   * 
   * @param {string} datasetName - Dataset name
   * @param {string} split - Dataset split
   * @returns {Promise<Object>} Operation result
   */
  async loadDataset(datasetName, split = null) {
    try {
      const result = await this.rpcCall('execute_load_dataset', {
        dataset_name: datasetName,
        split: split
      });
      
      // Refresh status after operation
      this.refreshStatus();
      
      return result;
    } catch (error) {
      console.error(`Error loading dataset ${datasetName}:`, error);
      this.lastError = error.message || 'Error loading dataset';
      this.render();
      throw error;
    }
  }
  
  /**
   * Query a dataset.
   * 
   * @param {string} datasetName - Dataset name
   * @param {Object} query - Query parameters
   * @param {string} split - Dataset split
   * @returns {Promise<Object>} Operation result
   */
  async queryDataset(datasetName, query, split = null) {
    try {
      const result = await this.rpcCall('execute_query_dataset', {
        dataset_name: datasetName,
        query: query,
        split: split
      });
      
      // Show query results
      this.showQueryResults(result);
      
      return result;
    } catch (error) {
      console.error(`Error querying dataset ${datasetName}:`, error);
      this.lastError = error.message || 'Error querying dataset';
      this.render();
      throw error;
    }
  }
  
  /**
   * Process a dataset.
   * 
   * @param {string} datasetName - Dataset name
   * @param {string} split - Dataset split
   * @param {string} outputDir - Output directory
   * @returns {Promise<Object>} Operation result
   */
  async processDataset(datasetName, split = null, outputDir = null) {
    try {
      const result = await this.rpcCall('execute_process_dataset', {
        dataset_name: datasetName,
        split: split,
        output_dir: outputDir
      });
      
      // Refresh status after operation
      this.refreshStatus();
      
      return result;
    } catch (error) {
      console.error(`Error processing dataset ${datasetName}:`, error);
      this.lastError = error.message || 'Error processing dataset';
      this.render();
      throw error;
    }
  }
  
  /**
   * Run a self-test.
   * 
   * @returns {Promise<Object>} Test results
   */
  async runTest() {
    try {
      const result = await this.rpcCall('test');
      
      // Show test results in UI
      this.showTestResults(result);
      
      return result;
    } catch (error) {
      console.error('Error running test:', error);
      this.lastError = error.message || 'Error running test';
      this.render();
      throw error;
    }
  }
  
  /**
   * Show query results in the UI.
   * 
   * @param {Object} results - Query results
   */
  showQueryResults(results) {
    // Create a modal or panel to display query results
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'ipfs-datasets-query-results';
    
    // Add header
    const header = document.createElement('h3');
    header.textContent = `Query Results: ${results.dataset}${results.split ? ` (${results.split})` : ''}`;
    resultsContainer.appendChild(header);
    
    // Add results
    if (results.success) {
      // Add result count if available
      if (results.num_results !== undefined) {
        const countInfo = document.createElement('p');
        countInfo.textContent = `Found ${results.num_results} results`;
        resultsContainer.appendChild(countInfo);
      }
      
      // Add sample results if available
      if (results.sample_results) {
        const resultsList = document.createElement('div');
        resultsList.className = 'results-list';
        
        const resultsTitle = document.createElement('h4');
        resultsTitle.textContent = 'Sample Results:';
        resultsList.appendChild(resultsTitle);
        
        // Create pre element for JSON output
        const preElement = document.createElement('pre');
        preElement.className = 'results-json';
        preElement.textContent = JSON.stringify(results.sample_results, null, 2);
        resultsList.appendChild(preElement);
        
        resultsContainer.appendChild(resultsList);
      } else if (results.results) {
        // Show text results if no sample data
        const resultText = document.createElement('p');
        resultText.className = 'results-text';
        resultText.textContent = results.results;
        resultsContainer.appendChild(resultText);
      }
    } else {
      // Show error
      const errorText = document.createElement('p');
      errorText.className = 'error';
      errorText.textContent = results.error || 'Unknown error';
      resultsContainer.appendChild(errorText);
    }
    
    // Add execution time if available
    if (results.execution_time !== undefined) {
      const timeInfo = document.createElement('p');
      timeInfo.className = 'execution-time';
      timeInfo.textContent = `Execution time: ${(results.execution_time * 1000).toFixed(2)}ms`;
      resultsContainer.appendChild(timeInfo);
    }
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.onclick = () => {
      document.body.removeChild(modalContainer);
    };
    resultsContainer.appendChild(closeButton);
    
    // Create and show modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'ipfs-datasets-modal';
    modalContainer.appendChild(resultsContainer);
    document.body.appendChild(modalContainer);
  }
  
  /**
   * Show test results in the UI.
   * 
   * @param {Object} results - Test results
   */
  showTestResults(results) {
    // Create a modal or panel to display test results
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'ipfs-datasets-test-results';
    
    // Add header
    const header = document.createElement('h3');
    header.textContent = `IPFS Datasets Test: ${results.success ? 'PASSED' : 'FAILED'}`;
    header.style.color = results.success ? 'green' : 'red';
    resultsContainer.appendChild(header);
    
    // Add individual test results
    const testsList = document.createElement('ul');
    for (const test of results.tests || []) {
      const testItem = document.createElement('li');
      testItem.innerHTML = `<span class="${test.success ? 'success' : 'failure'}">${test.name}</span>: ${test.success ? 'Passed' : 'Failed'}`;
      if (!test.success && test.error) {
        testItem.innerHTML += `<p class="error">Error: ${test.error}</p>`;
      }
      testsList.appendChild(testItem);
    }
    resultsContainer.appendChild(testsList);
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.onclick = () => {
      document.body.removeChild(modalContainer);
    };
    resultsContainer.appendChild(closeButton);
    
    // Create and show modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'ipfs-datasets-modal';
    modalContainer.appendChild(resultsContainer);
    document.body.appendChild(modalContainer);
  }
  
  /**
   * Render the dashboard.
   */
  render() {
    // Clear container
    this.container.innerHTML = '';
    
    // Add CSS
    this.addStyles();
    
    // Create container elements
    const dashboardContainer = document.createElement('div');
    dashboardContainer.className = 'ipfs-datasets-dashboard';
    dashboardContainer.dataset.theme = this.config.theme;
    
    // Add header
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    header.innerHTML = `
      <h2>IPFS Datasets Dashboard</h2>
      <div class="status-indicator ${this.initialized ? 'status-ok' : 'status-error'}">
        ${this.initialized ? 'Connected' : 'Disconnected'}
      </div>
    `;
    dashboardContainer.appendChild(header);
    
    // Add error display if there's an error
    if (this.lastError) {
      const errorContainer = document.createElement('div');
      errorContainer.className = 'error-container';
      errorContainer.innerHTML = `<p class="error">${this.lastError}</p>`;
      dashboardContainer.appendChild(errorContainer);
    }
    
    // Add control buttons
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';
    
    const initButton = document.createElement('button');
    initButton.textContent = this.initialized ? 'Reinitialize' : 'Initialize';
    initButton.onclick = () => this.initialize();
    controlsContainer.appendChild(initButton);
    
    const testButton = document.createElement('button');
    testButton.textContent = 'Run Test';
    testButton.onclick = () => this.runTest();
    controlsContainer.appendChild(testButton);
    
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh';
    refreshButton.onclick = () => this.refreshStatus();
    controlsContainer.appendChild(refreshButton);
    
    dashboardContainer.appendChild(controlsContainer);
    
    // Add status sections if initialized
    if (this.initialized && this.status) {
      // Datasets Section
      if (this.config.showDatasets && this.status.datasets) {
        dashboardContainer.appendChild(this.renderDatasetsSection());
      }
      
      // Metrics Section
      if (this.config.showMetrics && this.status.metrics) {
        dashboardContainer.appendChild(this.renderMetricsSection());
      }
      
      // Operations Section
      if (this.config.showOperations) {
        dashboardContainer.appendChild(this.renderOperationsSection());
      }
    }
    
    // Add initialization prompt if not initialized
    if (!this.initialized) {
      const initPrompt = document.createElement('div');
      initPrompt.className = 'init-prompt';
      initPrompt.innerHTML = `
        <p>IPFS Datasets is not initialized.</p>
        <button onclick="this.closest('.ipfs-datasets-dashboard').ipfsdatasets.initialize()">Initialize Now</button>
      `;
      dashboardContainer.appendChild(initPrompt);
    }
    
    // Add to container
    this.container.appendChild(dashboardContainer);
    
    // Store reference for event handlers
    dashboardContainer.ipfsdatasets = this;
  }
  
  /**
   * Render datasets section.
   * 
   * @returns {HTMLElement} Datasets section
   */
  renderDatasetsSection() {
    const datasets = this.status.datasets || { count: 0, loaded: [], details: {} };
    const section = document.createElement('section');
    section.className = 'dashboard-section datasets-section';
    
    section.innerHTML = `
      <h3>Datasets (${datasets.count || 0})</h3>
      ${datasets.count > 0 ? `
        <div class="datasets-grid">
          ${datasets.loaded.map(name => `
            <div class="dataset-item">
              <h4>${name}</h4>
              <div class="dataset-info">
                ${datasets.details[name] && datasets.details[name].split ? 
                  `<p><strong>Split:</strong> ${datasets.details[name].split}</p>` : ''}
                ${datasets.details[name] && datasets.details[name].loaded_at ? 
                  `<p><strong>Loaded:</strong> ${new Date(datasets.details[name].loaded_at).toLocaleString()}</p>` : ''}
              </div>
              <div class="dataset-actions">
                <button class="action-button" data-action="query" data-dataset="${name}">Query</button>
                <button class="action-button" data-action="process" data-dataset="${name}">Process</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : '<p>No datasets loaded</p>'}
      
      <div class="load-dataset-form">
        <h4>Load Dataset</h4>
        <div class="form-row">
          <input type="text" id="dataset-name" placeholder="Dataset name (e.g. mnist)">
          <input type="text" id="dataset-split" placeholder="Split (e.g. train)">
          <button id="load-dataset-button">Load</button>
        </div>
      </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
      // Load dataset button
      const loadButton = section.querySelector('#load-dataset-button');
      const nameInput = section.querySelector('#dataset-name');
      const splitInput = section.querySelector('#dataset-split');
      
      if (loadButton && nameInput) {
        loadButton.addEventListener('click', () => {
          const name = nameInput.value.trim();
          const split = splitInput.value.trim() || null;
          
          if (name) {
            this.loadDataset(name, split);
          } else {
            alert('Please enter a dataset name');
          }
        });
      }
      
      // Query dataset buttons
      const queryButtons = section.querySelectorAll('[data-action="query"]');
      queryButtons.forEach(button => {
        button.addEventListener('click', () => {
          const dataset = button.dataset.dataset;
          const split = datasets.details[dataset]?.split || null;
          
          // Show query form
          this.showQueryForm(dataset, split);
        });
      });
      
      // Process dataset buttons
      const processButtons = section.querySelectorAll('[data-action="process"]');
      processButtons.forEach(button => {
        button.addEventListener('click', () => {
          const dataset = button.dataset.dataset;
          const split = datasets.details[dataset]?.split || null;
          
          // Process the dataset
          this.processDataset(dataset, split);
        });
      });
    }, 0);
    
    return section;
  }
  
  /**
   * Render metrics section.
   * 
   * @returns {HTMLElement} Metrics section
   */
  renderMetricsSection() {
    const metrics = this.status.metrics || {};
    const section = document.createElement('section');
    section.className = 'dashboard-section metrics-section';
    
    // Format uptime
    const uptime = metrics.uptime || 0;
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const uptimeText = days > 0 ? 
      `${days}d ${hours}h ${minutes}m ${seconds}s` : 
      hours > 0 ? 
        `${hours}h ${minutes}m ${seconds}s` : 
        `${minutes}m ${seconds}s`;
    
    section.innerHTML = `
      <h3>Performance Metrics</h3>
      <div class="metrics-grid">
        <div class="metric-item">
          <h4>Uptime</h4>
          <p class="metric-value">${uptimeText}</p>
        </div>
        <div class="metric-item">
          <h4>Datasets Loaded</h4>
          <p class="metric-value">${metrics.load_count || 0}</p>
        </div>
        <div class="metric-item">
          <h4>Queries Run</h4>
          <p class="metric-value">${metrics.query_count || 0}</p>
        </div>
        <div class="metric-item">
          <h4>Datasets Processed</h4>
          <p class="metric-value">${metrics.process_count || 0}</p>
        </div>
        <div class="metric-item">
          <h4>Avg Load Time</h4>
          <p class="metric-value">${((metrics.avg_load_time || 0) * 1000).toFixed(2)} ms</p>
        </div>
        <div class="metric-item">
          <h4>Avg Query Time</h4>
          <p class="metric-value">${((metrics.avg_query_time || 0) * 1000).toFixed(2)} ms</p>
        </div>
      </div>
    `;
    
    return section;
  }
  
  /**
   * Render operations section.
   * 
   * @returns {HTMLElement} Operations section
   */
  renderOperationsSection() {
    const operations = this.status.operations || [];
    const section = document.createElement('section');
    section.className = 'dashboard-section operations-section';
    
    section.innerHTML = `
      <h3>Recent Operations</h3>
      ${operations.length > 0 ? `
        <table class="operations-table">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Time (ms)</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${operations.map(op => `
              <tr>
                <td>${op.operation}</td>
                <td>${(op.execution_time * 1000).toFixed(2)}</td>
                <td>${new Date(op.timestamp * 1000).toLocaleTimeString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p>No operations recorded</p>'}
    `;
    
    return section;
  }
  
  /**
   * Show query form.
   * 
   * @param {string} dataset - Dataset name
   * @param {string} split - Dataset split
   */
  showQueryForm(dataset, split) {
    // Create form container
    const formContainer = document.createElement('div');
    formContainer.className = 'ipfs-datasets-query-form';
    
    formContainer.innerHTML = `
      <h3>Query Dataset: ${dataset}${split ? ` (${split})` : ''}</h3>
      
      <div class="form-row">
        <label for="filter-column">Filter Column:</label>
        <input type="text" id="filter-column" placeholder="Column name">
      </div>
      
      <div class="form-row">
        <label for="filter-value">Filter Value:</label>
        <input type="text" id="filter-value" placeholder="Value to match">
      </div>
      
      <div class="form-actions">
        <button id="submit-query">Run Query</button>
        <button id="cancel-query">Cancel</button>
      </div>
    `;
    
    // Create modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'ipfs-datasets-modal';
    modalContainer.appendChild(formContainer);
    
    // Add event listeners
    const submitButton = formContainer.querySelector('#submit-query');
    const cancelButton = formContainer.querySelector('#cancel-query');
    const filterColumnInput = formContainer.querySelector('#filter-column');
    const filterValueInput = formContainer.querySelector('#filter-value');
    
    submitButton.addEventListener('click', () => {
      const filterColumn = filterColumnInput.value.trim();
      const filterValue = filterValueInput.value.trim();
      
      if (filterColumn && filterValue) {
        // Close the form
        document.body.removeChild(modalContainer);
        
        // Execute the query
        this.queryDataset(dataset, {
          filter_column: filterColumn,
          filter_value: filterValue
        }, split);
      } else {
        alert('Please enter both filter column and value');
      }
    });
    
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(modalContainer);
    });
    
    // Show the modal
    document.body.appendChild(modalContainer);
  }
  
  /**
   * Add dashboard styles.
   */
  addStyles() {
    // Check if styles already added
    if (document.getElementById('ipfs-datasets-dashboard-styles')) {
      return;
    }
    
    // Create style element
    const style = document.createElement('style');
    style.id = 'ipfs-datasets-dashboard-styles';
    style.innerHTML = `
      .ipfs-datasets-dashboard {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #333;
        background-color: #f9f9f9;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 20px;
        margin: 10px 0;
        width: 100%;
        box-sizing: border-box;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] {
        color: #eee;
        background-color: #2d2d2d;
        border-color: #444;
      }
      
      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #ddd;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .dashboard-header {
        border-color: #444;
      }
      
      .dashboard-header h2 {
        margin: 0;
        font-size: 1.5em;
      }
      
      .status-indicator {
        padding: 5px 10px;
        border-radius: 4px;
        font-weight: bold;
      }
      
      .status-ok {
        background-color: #4caf50;
        color: white;
      }
      
      .status-error {
        background-color: #f44336;
        color: white;
      }
      
      .controls-container {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }
      
      .controls-container button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background-color: #2196f3;
        color: white;
        cursor: pointer;
        font-weight: bold;
      }
      
      .controls-container button:hover {
        background-color: #0b7dda;
      }
      
      .dashboard-section {
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 15px;
        margin-bottom: 20px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .dashboard-section {
        background-color: #3d3d3d;
        border-color: #555;
      }
      
      .dashboard-section h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-size: 1.3em;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .dashboard-section h3 {
        border-color: #555;
      }
      
      .dashboard-section h4 {
        margin-top: 15px;
        margin-bottom: 10px;
        font-size: 1.1em;
      }
      
      .datasets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }
      
      .dataset-item {
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 12px;
        background-color: #fafafa;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .dataset-item {
        border-color: #555;
        background-color: #444;
      }
      
      .dataset-item h4 {
        margin-top: 0;
        margin-bottom: 10px;
        font-size: 1.1em;
        border-bottom: 1px dashed #eee;
        padding-bottom: 5px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .dataset-item h4 {
        border-color: #555;
      }
      
      .dataset-info {
        margin-bottom: 10px;
      }
      
      .dataset-info p {
        margin: 5px 0;
        font-size: 0.9em;
      }
      
      .dataset-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      
      .action-button {
        padding: 5px 10px;
        border: none;
        border-radius: 3px;
        background-color: #4caf50;
        color: white;
        cursor: pointer;
        font-size: 0.9em;
      }
      
      .action-button:hover {
        background-color: #3e8e41;
      }
      
      .action-button[data-action="query"] {
        background-color: #2196f3;
      }
      
      .action-button[data-action="query"]:hover {
        background-color: #0b7dda;
      }
      
      .load-dataset-form {
        background-color: #f5f5f5;
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 15px;
        margin-top: 20px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .load-dataset-form {
        background-color: #444;
        border-color: #555;
      }
      
      .form-row {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
        align-items: center;
      }
      
      .form-row input {
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        flex: 1;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .form-row input {
        background-color: #333;
        border-color: #555;
        color: #eee;
      }
      
      .form-row button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background-color: #4caf50;
        color: white;
        cursor: pointer;
      }
      
      .form-row button:hover {
        background-color: #3e8e41;
      }
      
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }
      
      .metric-item {
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 12px;
        text-align: center;
        background-color: #fafafa;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .metric-item {
        border-color: #555;
        background-color: #444;
      }
      
      .metric-item h4 {
        margin-top: 0;
        margin-bottom: 10px;
        font-size: 1em;
        color: #555;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .metric-item h4 {
        color: #ccc;
      }
      
      .metric-value {
        font-size: 1.5em;
        font-weight: bold;
        margin: 0;
      }
      
      .operations-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      
      .operations-table th,
      .operations-table td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid #eee;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .operations-table th,
      .ipfs-datasets-dashboard[data-theme="dark"] .operations-table td {
        border-color: #555;
      }
      
      .operations-table th {
        background-color: #f5f5f5;
        font-weight: bold;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .operations-table th {
        background-color: #444;
      }
      
      .error-container {
        padding: 10px;
        margin-bottom: 15px;
        background-color: #ffebee;
        border-left: 4px solid #f44336;
        border-radius: 4px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .error-container {
        background-color: #5d3434;
      }
      
      .error {
        color: #f44336;
        margin: 0;
      }
      
      .init-prompt {
        padding: 20px;
        text-align: center;
        background-color: #e0f7fa;
        border-radius: 4px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .init-prompt {
        background-color: #3d4e51;
      }
      
      .init-prompt button {
        padding: 10px 20px;
        background-color: #2196f3;
        color: white;
        border: none;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 10px;
      }
      
      .init-prompt button:hover {
        background-color: #0b7dda;
      }
      
      .ipfs-datasets-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      
      .ipfs-datasets-query-form,
      .ipfs-datasets-query-results,
      .ipfs-datasets-test-results {
        background-color: white;
        border-radius: 4px;
        padding: 20px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .ipfs-datasets-query-form,
      .ipfs-datasets-dashboard[data-theme="dark"] .ipfs-datasets-query-results,
      .ipfs-datasets-dashboard[data-theme="dark"] .ipfs-datasets-test-results {
        background-color: #3d3d3d;
        color: #eee;
      }
      
      .ipfs-datasets-query-form h3,
      .ipfs-datasets-query-results h3,
      .ipfs-datasets-test-results h3 {
        margin-top: 0;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .ipfs-datasets-query-form h3,
      .ipfs-datasets-dashboard[data-theme="dark"] .ipfs-datasets-query-results h3,
      .ipfs-datasets-dashboard[data-theme="dark"] .ipfs-datasets-test-results h3 {
        border-color: #555;
      }
      
      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      
      .form-actions button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .form-actions button:first-child {
        background-color: #4caf50;
        color: white;
      }
      
      .form-actions button:last-child {
        background-color: #f44336;
        color: white;
      }
      
      .results-json {
        background-color: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        font-family: monospace;
        font-size: 0.9em;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .results-json {
        background-color: #333;
      }
      
      .ipfs-datasets-test-results .success {
        color: #4caf50;
        font-weight: bold;
      }
      
      .ipfs-datasets-test-results .failure {
        color: #f44336;
        font-weight: bold;
      }
      
      .execution-time {
        font-style: italic;
        color: #777;
        text-align: right;
        margin-top: 15px;
        border-top: 1px dashed #eee;
        padding-top: 10px;
      }
      
      .ipfs-datasets-dashboard[data-theme="dark"] .execution-time {
        color: #aaa;
        border-color: #555;
      }
    `;
    
    // Add to document
    document.head.appendChild(style);
  }
  
  /**
   * Clean up resources.
   */
  dispose() {
    // Stop refresh timer
    this.stopRefresh();
    
    // Stop IPFS Datasets
    this.rpcCall('stop').catch(error => {
      console.error('Error stopping IPFS Datasets:', error);
    });
  }
}

// Export the dashboard component
export default IPFSDatasetsDashboard;