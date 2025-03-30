/**
 * IPFS Kit Dashboard Component
 * 
 * This module provides a dashboard component for displaying IPFS Kit status and operations.
 * It communicates with the Python backend through a JSON-RPC interface.
 */

class IPFSKitDashboard {
  /**
   * Initialize the IPFS Kit dashboard component.
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
      showOperations: this.options.showOperations !== false,
      showNodeInfo: this.options.showNodeInfo !== false,
      showPinSet: this.options.showPinSet !== false,
      showPeers: this.options.showPeers !== false,
      showPerformance: this.options.showPerformance !== false,
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
   * Initialize the IPFS Kit backend.
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
        this.lastError = result.error || 'Failed to initialize IPFS Kit';
      }
      
      this.render();
      return result;
    } catch (error) {
      this.lastError = error.message || 'Error initializing IPFS Kit';
      this.render();
      return { success: false, error: this.lastError };
    }
  }
  
  /**
   * Call a method on the IPFS Kit backend.
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
   * Refresh IPFS Kit status.
   */
  async refreshStatus() {
    try {
      // Get status
      const status = await this.rpcCall('get_status');
      this.status = status;
      
      // Get updates
      const updates = await this.rpcCall('get_updates');
      if (updates && updates.length > 0) {
        // Handle updates
        for (const update of updates) {
          if (update.type === 'status_update') {
            // Update status
            this.status = update.status;
          }
        }
      }
      
      // Render updated status
      this.render();
    } catch (error) {
      console.error('Error refreshing IPFS Kit status:', error);
      this.lastError = error.message || 'Error refreshing status';
      this.render();
    }
  }
  
  /**
   * Execute an IPFS operation.
   * 
   * @param {string} operation - Operation to execute
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>} Operation result
   */
  async executeOperation(operation, params = {}) {
    try {
      const result = await this.rpcCall('execute_operation', {
        operation,
        params
      });
      
      // Refresh status after operation
      this.refreshStatus();
      
      return result;
    } catch (error) {
      console.error(`Error executing operation ${operation}:`, error);
      this.lastError = error.message || 'Error executing operation';
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
   * Show test results in the UI.
   * 
   * @param {Object} results - Test results
   */
  showTestResults(results) {
    // Create a modal or panel to display test results
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'ipfs-kit-test-results';
    
    // Add header
    const header = document.createElement('h3');
    header.textContent = `IPFS Kit Test: ${results.success ? 'PASSED' : 'FAILED'}`;
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
    modalContainer.className = 'ipfs-kit-modal';
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
    dashboardContainer.className = 'ipfs-kit-dashboard';
    dashboardContainer.dataset.theme = this.config.theme;
    
    // Add header
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    header.innerHTML = `
      <h2>IPFS Kit Dashboard</h2>
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
      // Node Info Section
      if (this.config.showNodeInfo && this.status.node_info) {
        dashboardContainer.appendChild(this.renderNodeInfo());
      }
      
      // Pins Section
      if (this.config.showPinSet && this.status.pin_set) {
        dashboardContainer.appendChild(this.renderPinSet());
      }
      
      // Peers Section
      if (this.config.showPeers && this.status.peers) {
        dashboardContainer.appendChild(this.renderPeers());
      }
      
      // Performance Section
      if (this.config.showPerformance && this.status.performance) {
        dashboardContainer.appendChild(this.renderPerformance());
      }
      
      // Operations Section
      if (this.config.showOperations) {
        dashboardContainer.appendChild(this.renderOperations());
      }
    }
    
    // Add initialization prompt if not initialized
    if (!this.initialized) {
      const initPrompt = document.createElement('div');
      initPrompt.className = 'init-prompt';
      initPrompt.innerHTML = `
        <p>IPFS Kit is not initialized.</p>
        <button onclick="this.closest('.ipfs-kit-dashboard').ipfskit.initialize()">Initialize Now</button>
      `;
      dashboardContainer.appendChild(initPrompt);
    }
    
    // Add to container
    this.container.appendChild(dashboardContainer);
    
    // Store reference for event handlers
    dashboardContainer.ipfskit = this;
  }
  
  /**
   * Render node information.
   * 
   * @returns {HTMLElement} Node info section
   */
  renderNodeInfo() {
    const nodeInfo = this.status.node_info;
    const section = document.createElement('section');
    section.className = 'dashboard-section node-info-section';
    
    section.innerHTML = `
      <h3>Node Information</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">ID:</span>
          <span class="info-value">${nodeInfo.id || 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Version:</span>
          <span class="info-value">${nodeInfo.version || 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Protocol:</span>
          <span class="info-value">${nodeInfo.protocol_version || 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Implementation:</span>
          <span class="info-value">${this.status.implementation || 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Mock Mode:</span>
          <span class="info-value">${this.status.use_mock ? 'Yes' : 'No'}</span>
        </div>
      </div>
      <div class="addresses-container">
        <h4>Addresses (${(nodeInfo.addresses || []).length}):</h4>
        <ul class="addresses-list">
          ${(nodeInfo.addresses || []).slice(0, 3).map(addr => `<li>${addr}</li>`).join('')}
          ${(nodeInfo.addresses || []).length > 3 ? `<li>... ${(nodeInfo.addresses || []).length - 3} more</li>` : ''}
        </ul>
      </div>
    `;
    
    return section;
  }
  
  /**
   * Render pin set.
   * 
   * @returns {HTMLElement} Pin set section
   */
  renderPinSet() {
    const pinSet = this.status.pin_set;
    const section = document.createElement('section');
    section.className = 'dashboard-section pin-set-section';
    
    section.innerHTML = `
      <h3>Pinned Content (${pinSet.count || 0})</h3>
      ${pinSet.count > 0 ? `
        <ul class="pin-list">
          ${(pinSet.sample || []).map(cid => `<li><span class="cid">${cid}</span></li>`).join('')}
          ${pinSet.count > (pinSet.sample || []).length ? `<li>... ${pinSet.count - (pinSet.sample || []).length} more</li>` : ''}
        </ul>
      ` : '<p>No pinned content</p>'}
    `;
    
    return section;
  }
  
  /**
   * Render peers.
   * 
   * @returns {HTMLElement} Peers section
   */
  renderPeers() {
    const peers = this.status.peers;
    const section = document.createElement('section');
    section.className = 'dashboard-section peers-section';
    
    section.innerHTML = `
      <h3>Connected Peers (${peers.count || 0})</h3>
      ${peers.count > 0 ? `
        <ul class="peer-list">
          ${(peers.sample || []).map(peer => `<li><span class="peer-id">${peer}</span></li>`).join('')}
          ${peers.count > (peers.sample || []).length ? `<li>... ${peers.count - (peers.sample || []).length} more</li>` : ''}
        </ul>
      ` : '<p>No connected peers</p>'}
    `;
    
    return section;
  }
  
  /**
   * Render performance metrics.
   * 
   * @returns {HTMLElement} Performance section
   */
  renderPerformance() {
    const performance = this.status.performance;
    const section = document.createElement('section');
    section.className = 'dashboard-section performance-section';
    
    // Format uptime
    const uptime = performance.uptime || 0;
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const uptimeText = days > 0 ? 
      `${days}d ${hours}h ${minutes}m ${seconds}s` : 
      hours > 0 ? 
        `${hours}h ${minutes}m ${seconds}s` : 
        `${minutes}m ${seconds}s`;
    
    // Get operations
    const operations = performance.operations || {};
    const operationEntries = Object.entries(operations);
    
    section.innerHTML = `
      <h3>Performance Metrics</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Uptime:</span>
          <span class="info-value">${uptimeText}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Last Refresh:</span>
          <span class="info-value">${performance.last_refresh ? new Date(performance.last_refresh * 1000).toLocaleTimeString() : 'Never'}</span>
        </div>
      </div>
      
      <h4>Operations:</h4>
      <table class="operations-table">
        <thead>
          <tr>
            <th>Operation</th>
            <th>Count</th>
            <th>Avg Time (ms)</th>
            <th>Last Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${operationEntries.map(([op, metrics]) => `
            <tr>
              <td>${op}</td>
              <td>${metrics.count || 0}</td>
              <td>${(metrics.avg_time * 1000).toFixed(2)}</td>
              <td>${(metrics.last_time * 1000).toFixed(2)}</td>
            </tr>
          `).join('')}
          ${operationEntries.length === 0 ? `<tr><td colspan="4">No operations recorded</td></tr>` : ''}
        </tbody>
      </table>
    `;
    
    return section;
  }
  
  /**
   * Render operations panel.
   * 
   * @returns {HTMLElement} Operations section
   */
  renderOperations() {
    const section = document.createElement('section');
    section.className = 'dashboard-section operations-section';
    
    section.innerHTML = `
      <h3>IPFS Operations</h3>
      <div class="operations-container">
        <div class="operation-row">
          <button class="operation-button" data-operation="add">Add File</button>
          <input type="file" id="ipfs-add-file" style="display: none;">
          <button class="operation-button" data-operation="pin_add">Pin Content</button>
          <input type="text" id="ipfs-pin-cid" placeholder="CID to pin">
        </div>
        <div class="operation-row">
          <button class="operation-button" data-operation="cat">Retrieve Content</button>
          <input type="text" id="ipfs-cat-cid" placeholder="CID to retrieve">
          <button class="operation-button" data-operation="pin_rm">Unpin Content</button>
          <input type="text" id="ipfs-unpin-cid" placeholder="CID to unpin">
        </div>
      </div>
      <div class="operation-result">
        <h4>Operation Result:</h4>
        <pre id="operation-result-display">No operations performed yet</pre>
      </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
      const addButton = section.querySelector('[data-operation="add"]');
      const pinButton = section.querySelector('[data-operation="pin_add"]');
      const catButton = section.querySelector('[data-operation="cat"]');
      const unpinButton = section.querySelector('[data-operation="pin_rm"]');
      
      const fileInput = section.querySelector('#ipfs-add-file');
      const pinCidInput = section.querySelector('#ipfs-pin-cid');
      const catCidInput = section.querySelector('#ipfs-cat-cid');
      const unpinCidInput = section.querySelector('#ipfs-unpin-cid');
      
      const resultDisplay = section.querySelector('#operation-result-display');
      
      // Add file
      addButton.addEventListener('click', () => {
        fileInput.click();
      });
      
      fileInput.addEventListener('change', async (event) => {
        if (event.target.files.length > 0) {
          const file = event.target.files[0];
          
          // Create a temporary file on the server
          // Note: This requires additional implementation for file transfer
          resultDisplay.textContent = 'Adding file to IPFS...';
          
          try {
            // This is a placeholder - actual implementation would require file upload capability
            const result = await this.executeOperation('add', { path: file.name });
            resultDisplay.textContent = JSON.stringify(result, null, 2);
          } catch (error) {
            resultDisplay.textContent = `Error: ${error.message}`;
          }
        }
      });
      
      // Pin content
      pinButton.addEventListener('click', async () => {
        const cid = pinCidInput.value.trim();
        if (cid) {
          resultDisplay.textContent = `Pinning content: ${cid}...`;
          
          try {
            const result = await this.executeOperation('pin_add', { cid });
            resultDisplay.textContent = JSON.stringify(result, null, 2);
          } catch (error) {
            resultDisplay.textContent = `Error: ${error.message}`;
          }
        } else {
          resultDisplay.textContent = 'Please enter a CID to pin';
        }
      });
      
      // Retrieve content
      catButton.addEventListener('click', async () => {
        const cid = catCidInput.value.trim();
        if (cid) {
          resultDisplay.textContent = `Retrieving content: ${cid}...`;
          
          try {
            const result = await this.executeOperation('cat', { cid });
            resultDisplay.textContent = JSON.stringify(result, null, 2);
          } catch (error) {
            resultDisplay.textContent = `Error: ${error.message}`;
          }
        } else {
          resultDisplay.textContent = 'Please enter a CID to retrieve';
        }
      });
      
      // Unpin content
      unpinButton.addEventListener('click', async () => {
        const cid = unpinCidInput.value.trim();
        if (cid) {
          resultDisplay.textContent = `Unpinning content: ${cid}...`;
          
          try {
            const result = await this.executeOperation('pin_rm', { cid });
            resultDisplay.textContent = JSON.stringify(result, null, 2);
          } catch (error) {
            resultDisplay.textContent = `Error: ${error.message}`;
          }
        } else {
          resultDisplay.textContent = 'Please enter a CID to unpin';
        }
      });
    }, 0);
    
    return section;
  }
  
  /**
   * Add dashboard styles.
   */
  addStyles() {
    // Check if styles already added
    if (document.getElementById('ipfs-kit-dashboard-styles')) {
      return;
    }
    
    // Create style element
    const style = document.createElement('style');
    style.id = 'ipfs-kit-dashboard-styles';
    style.innerHTML = `
      .ipfs-kit-dashboard {
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
      
      .ipfs-kit-dashboard[data-theme="dark"] {
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
      
      .ipfs-kit-dashboard[data-theme="dark"] .dashboard-header {
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
      
      .ipfs-kit-dashboard[data-theme="dark"] .dashboard-section {
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
      
      .ipfs-kit-dashboard[data-theme="dark"] .dashboard-section h3 {
        border-color: #555;
      }
      
      .dashboard-section h4 {
        margin-top: 15px;
        margin-bottom: 10px;
        font-size: 1.1em;
      }
      
      .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 10px;
      }
      
      .info-row {
        display: flex;
        margin-bottom: 5px;
      }
      
      .info-label {
        flex: 0 0 100px;
        font-weight: bold;
      }
      
      .info-value {
        flex: 1;
        word-break: break-all;
      }
      
      .addresses-container,
      .pin-list,
      .peer-list {
        margin-top: 10px;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 10px;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .addresses-container,
      .ipfs-kit-dashboard[data-theme="dark"] .pin-list,
      .ipfs-kit-dashboard[data-theme="dark"] .peer-list {
        border-color: #555;
      }
      
      .addresses-list,
      .pin-list,
      .peer-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .addresses-list li,
      .pin-list li,
      .peer-list li {
        padding: 5px 0;
        border-bottom: 1px solid #eee;
        word-break: break-all;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .addresses-list li,
      .ipfs-kit-dashboard[data-theme="dark"] .pin-list li,
      .ipfs-kit-dashboard[data-theme="dark"] .peer-list li {
        border-color: #555;
      }
      
      .addresses-list li:last-child,
      .pin-list li:last-child,
      .peer-list li:last-child {
        border-bottom: none;
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
      
      .ipfs-kit-dashboard[data-theme="dark"] .operations-table th,
      .ipfs-kit-dashboard[data-theme="dark"] .operations-table td {
        border-color: #555;
      }
      
      .operations-table th {
        background-color: #f5f5f5;
        font-weight: bold;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .operations-table th {
        background-color: #4d4d4d;
      }
      
      .operations-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .operation-row {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .operation-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background-color: #4caf50;
        color: white;
        cursor: pointer;
        font-weight: bold;
        min-width: 120px;
      }
      
      .operation-button:hover {
        background-color: #3e8e41;
      }
      
      .operation-row input[type="text"] {
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        flex: 1;
        min-width: 150px;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .operation-row input[type="text"] {
        background-color: #4d4d4d;
        border-color: #555;
        color: #eee;
      }
      
      .operation-result {
        margin-top: 20px;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 15px;
        background-color: #f5f5f5;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .operation-result {
        background-color: #4d4d4d;
        border-color: #555;
      }
      
      .operation-result h4 {
        margin-top: 0;
        margin-bottom: 10px;
      }
      
      #operation-result-display {
        background-color: white;
        padding: 10px;
        border-radius: 4px;
        max-height: 300px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] #operation-result-display {
        background-color: #2d2d2d;
        color: #eee;
      }
      
      .error-container {
        padding: 10px;
        margin-bottom: 15px;
        background-color: #ffebee;
        border-left: 4px solid #f44336;
        border-radius: 4px;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .error-container {
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
      
      .ipfs-kit-dashboard[data-theme="dark"] .init-prompt {
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
      
      .ipfs-kit-modal {
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
      
      .ipfs-kit-test-results {
        background-color: white;
        border-radius: 4px;
        padding: 20px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .ipfs-kit-test-results {
        background-color: #3d3d3d;
        color: #eee;
      }
      
      .ipfs-kit-test-results h3 {
        margin-top: 0;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .ipfs-kit-test-results h3 {
        border-color: #555;
      }
      
      .ipfs-kit-test-results ul {
        list-style: none;
        padding: 0;
      }
      
      .ipfs-kit-test-results li {
        padding: 8px 0;
        border-bottom: 1px solid #eee;
      }
      
      .ipfs-kit-dashboard[data-theme="dark"] .ipfs-kit-test-results li {
        border-color: #555;
      }
      
      .ipfs-kit-test-results .success {
        color: #4caf50;
        font-weight: bold;
      }
      
      .ipfs-kit-test-results .failure {
        color: #f44336;
        font-weight: bold;
      }
      
      .ipfs-kit-test-results button {
        padding: 8px 16px;
        background-color: #2196f3;
        color: white;
        border: none;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 15px;
      }
      
      .ipfs-kit-test-results button:hover {
        background-color: #0b7dda;
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
    
    // Stop IPFS Kit
    this.rpcCall('stop').catch(error => {
      console.error('Error stopping IPFS Kit:', error);
    });
  }
}

// Export the dashboard component
export default IPFSKitDashboard;