/**
 * IPFS Kit Dashboard Module
 * 
 * Provides a comprehensive dashboard for IPFS Kit functionality
 * Integrates with ipfs_kit_py through the bridge
 */

import { IPFSKitClient } from '../ipfs_kit_client.js';

class IPFSKitDashboard {
  /**
   * Create a new IPFS Kit Dashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.element Container element for the dashboard
   * @param {Object} options.eventBus Event bus for dashboard events
   * @param {Object} options.ipfsKit IPFS Kit client instance (optional)
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.eventBus = options.eventBus;
    this.ipfsKit = options.ipfsKit || null;
    this.initialized = false;
    this.testResults = [];
    this.status = {
      connected: false,
      nodePeers: 0,
      nodeId: '',
      version: '',
      repo: {
        size: 0,
        objects: 0
      },
      modules: {}
    };
  }
  
  /**
   * Initialize the dashboard
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Initialize IPFS Kit client if not provided
      if (!this.ipfsKit) {
        this.ipfsKit = new IPFSKitClient();
        await this.ipfsKit.start();
      }
      
      // Register event listeners
      this.eventBus.on('refresh-ipfs-status', () => this.refreshStatus());
      this.eventBus.on('test-ipfs-module', (moduleId) => this.testModule(moduleId));
      
      // Get initial status
      await this.refreshStatus();
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize IPFS Kit dashboard:', error);
      return false;
    }
  }
  
  /**
   * Refresh IPFS Kit status
   */
  async refreshStatus() {
    try {
      // Check if IPFS Kit is connected
      const isConnected = await this.ipfsKit.isRunning();
      this.status.connected = isConnected;
      
      if (!isConnected) {
        this.updateStatusUI();
        return;
      }
      
      // Get basic node info
      const [nodeInfo, version, stats, moduleStatus] = await Promise.all([
        this.ipfsKit.getNodeInfo().catch(() => ({})),
        this.ipfsKit.getVersion().catch(() => ''),
        this.ipfsKit.getStats().catch(() => ({})),
        this.ipfsKit.getModuleStatus().catch(() => ({}))
      ]);
      
      // Update status
      this.status.nodeId = nodeInfo.id || '';
      this.status.nodePeers = nodeInfo.peers || 0;
      this.status.version = version;
      this.status.repo = stats.repo || { size: 0, objects: 0 };
      this.status.modules = moduleStatus;
      
      // Update UI
      this.updateStatusUI();
    } catch (error) {
      console.error('Failed to refresh IPFS status:', error);
      this.status.connected = false;
      this.updateStatusUI();
    }
  }
  
  /**
   * Update status UI
   */
  updateStatusUI() {
    if (!this.element) return;
    
    const statusEl = this.element.querySelector('#ipfs-kit-status');
    if (!statusEl) return;
    
    statusEl.innerHTML = `
      <div class="status-indicator ${this.status.connected ? 'status-green' : 'status-red'}">
        <i class="fas fa-${this.status.connected ? 'check-circle' : 'times-circle'}"></i>
        ${this.status.connected ? 'Connected' : 'Disconnected'}
      </div>
      
      <div class="status-details">
        <div class="status-row">
          <span class="status-label">Node ID:</span>
          <span class="status-value">${this.status.nodeId || 'Unknown'}</span>
        </div>
        <div class="status-row">
          <span class="status-label">Version:</span>
          <span class="status-value">${this.status.version || 'Unknown'}</span>
        </div>
        <div class="status-row">
          <span class="status-label">Peers:</span>
          <span class="status-value">${this.status.nodePeers}</span>
        </div>
        <div class="status-row">
          <span class="status-label">Repository Size:</span>
          <span class="status-value">${this.formatBytes(this.status.repo.size || 0)}</span>
        </div>
        <div class="status-row">
          <span class="status-label">Objects:</span>
          <span class="status-value">${this.status.repo.objects || 0}</span>
        </div>
      </div>
    `;
    
    // Update module status section
    const modulesEl = this.element.querySelector('#ipfs-kit-modules');
    if (!modulesEl) return;
    
    modulesEl.innerHTML = Object.entries(this.status.modules).map(([moduleId, moduleStatus]) => `
      <div class="module-card">
        <div class="module-header">
          <h3>${moduleId}</h3>
          <div class="status-indicator ${moduleStatus.available ? 'status-green' : 'status-red'}">
            <i class="fas fa-${moduleStatus.available ? 'check-circle' : 'times-circle'}"></i>
            ${moduleStatus.available ? 'Available' : 'Unavailable'}
          </div>
        </div>
        <div class="module-details">
          <div class="status-row">
            <span class="status-label">Version:</span>
            <span class="status-value">${moduleStatus.version || 'Unknown'}</span>
          </div>
          <div class="module-actions">
            <button class="btn btn-primary test-module-btn" data-module-id="${moduleId}">
              <i class="fas fa-vial"></i> Test Module
            </button>
          </div>
        </div>
      </div>
    `).join('');
    
    // Add event listeners to test buttons
    modulesEl.querySelectorAll('.test-module-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const moduleId = btn.getAttribute('data-module-id');
        this.testModule(moduleId);
      });
    });
  }
  
  /**
   * Format bytes to human-readable string
   * @param {number} bytes Bytes to format
   * @param {number} decimals Number of decimal places
   * @returns {string} Formatted string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  /**
   * Test IPFS Kit module
   * @param {string} moduleId Module ID to test
   */
  async testModule(moduleId) {
    try {
      // Show loading indicator
      this.updateTestResultUI(`Running test for ${moduleId}...`, true);
      
      // Run test
      const result = await this.ipfsKit.testModule(moduleId);
      
      // Add timestamp and store result
      result.timestamp = new Date().toISOString();
      this.testResults.unshift(result);
      
      // Keep only the last 10 results
      if (this.testResults.length > 10) {
        this.testResults.pop();
      }
      
      // Update test results UI
      this.updateTestResultUI();
      
      // Emit test result event
      this.eventBus.emit('ipfs-test-result', result);
      
      return result;
    } catch (error) {
      console.error(`Failed to test ${moduleId}:`, error);
      
      // Create error result
      const errorResult = {
        module: moduleId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      // Store error result
      this.testResults.unshift(errorResult);
      
      // Update test results UI
      this.updateTestResultUI();
      
      // Emit test result event
      this.eventBus.emit('ipfs-test-result', errorResult);
      
      return errorResult;
    }
  }
  
  /**
   * Update test result UI
   * @param {string} loadingMessage Optional loading message to display
   * @param {boolean} isLoading Whether a test is currently running
   */
  updateTestResultUI(loadingMessage = null, isLoading = false) {
    if (!this.element) return;
    
    const testResultsEl = this.element.querySelector('#ipfs-kit-test-results');
    if (!testResultsEl) return;
    
    if (isLoading) {
      testResultsEl.innerHTML = `
        <div class="loading-indicator">
          <i class="fas fa-spinner fa-spin"></i>
          <span>${loadingMessage}</span>
        </div>
      `;
      return;
    }
    
    if (this.testResults.length === 0) {
      testResultsEl.innerHTML = '<div class="no-results">No test results available</div>';
      return;
    }
    
    testResultsEl.innerHTML = `
      <div class="results-list">
        ${this.testResults.map(result => `
          <div class="result-card ${result.success ? 'result-success' : 'result-failure'}">
            <div class="result-header">
              <h4>${result.module}</h4>
              <div class="status-indicator ${result.success ? 'status-green' : 'status-red'}">
                <i class="fas fa-${result.success ? 'check-circle' : 'times-circle'}"></i>
                ${result.success ? 'Success' : 'Failure'}
              </div>
            </div>
            <div class="result-timestamp">
              <i class="fas fa-clock"></i>
              ${new Date(result.timestamp).toLocaleString()}
            </div>
            ${result.error ? `
              <div class="result-error">
                <i class="fas fa-exclamation-triangle"></i>
                ${result.error}
              </div>
            ` : ''}
            ${result.steps ? `
              <div class="result-steps">
                <h5>Test Steps</h5>
                <ul>
                  ${Object.entries(result.steps).map(([step, stepResult]) => `
                    <li class="${stepResult.success ? 'step-success' : 'step-failure'}">
                      <i class="fas fa-${stepResult.success ? 'check' : 'times'}"></i>
                      <span class="step-name">${step}:</span>
                      <span class="step-message">${stepResult.message || ''}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  /**
   * Render the metadata index browser
   */
  async renderMetadataIndexBrowser() {
    if (!this.element) return;
    
    const metadataIndexEl = this.element.querySelector('#ipfs-kit-metadata-index');
    if (!metadataIndexEl) return;
    
    try {
      // Check if metadata index is available
      const moduleStatus = await this.ipfsKit.getModuleStatus();
      const metadataIndexAvailable = moduleStatus?.metadata_index?.available || false;
      
      if (!metadataIndexAvailable) {
        metadataIndexEl.innerHTML = `
          <div class="notice warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Metadata Index is not available. Please ensure it is enabled in your IPFS Kit configuration.</span>
          </div>
        `;
        return;
      }
      
      // Create search form
      metadataIndexEl.innerHTML = `
        <div class="metadata-search">
          <h3>PyArrow Metadata Index</h3>
          <form id="metadata-search-form">
            <div class="form-group">
              <label for="search-type">Search By:</label>
              <select id="search-type" class="form-control">
                <option value="cid">CID</option>
                <option value="path">Path</option>
                <option value="query">Query</option>
              </select>
            </div>
            
            <div class="form-group" id="cid-search-group">
              <label for="cid-input">CID:</label>
              <input type="text" id="cid-input" class="form-control" placeholder="Enter CID...">
            </div>
            
            <div class="form-group" id="path-search-group" style="display:none;">
              <label for="path-input">Path:</label>
              <input type="text" id="path-input" class="form-control" placeholder="Enter path...">
            </div>
            
            <div class="form-group" id="query-search-group" style="display:none;">
              <label for="query-input">Query:</label>
              <textarea id="query-input" class="form-control" rows="3" placeholder="Enter query..."></textarea>
            </div>
            
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-search"></i> Search
            </button>
          </form>
        </div>
        
        <div id="metadata-results" class="metadata-results">
          <div class="no-results">No search results yet. Try searching for metadata.</div>
        </div>
      `;
      
      // Handle search type change
      const searchTypeSelect = metadataIndexEl.querySelector('#search-type');
      searchTypeSelect.addEventListener('change', () => {
        const searchType = searchTypeSelect.value;
        
        // Hide all search groups
        metadataIndexEl.querySelector('#cid-search-group').style.display = 'none';
        metadataIndexEl.querySelector('#path-search-group').style.display = 'none';
        metadataIndexEl.querySelector('#query-search-group').style.display = 'none';
        
        // Show selected search group
        metadataIndexEl.querySelector(`#${searchType}-search-group`).style.display = 'block';
      });
      
      // Handle form submission
      const searchForm = metadataIndexEl.querySelector('#metadata-search-form');
      searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const searchType = searchTypeSelect.value;
        const resultsContainer = metadataIndexEl.querySelector('#metadata-results');
        
        // Show loading indicator
        resultsContainer.innerHTML = `
          <div class="loading-indicator">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Searching metadata index...</span>
          </div>
        `;
        
        try {
          let results;
          
          if (searchType === 'cid') {
            const cid = metadataIndexEl.querySelector('#cid-input').value;
            results = await this.ipfsKit.getMetadataForCid(cid);
          } else if (searchType === 'path') {
            const path = metadataIndexEl.querySelector('#path-input').value;
            results = await this.ipfsKit.getMetadataForPath(path);
          } else if (searchType === 'query') {
            const query = metadataIndexEl.querySelector('#query-input').value;
            results = await this.ipfsKit.metadataQuery(query);
          }
          
          // Display results
          if (!results || (Array.isArray(results) && results.length === 0)) {
            resultsContainer.innerHTML = `
              <div class="no-results">No results found. Try a different search.</div>
            `;
            return;
          }
          
          // Handle both single result and array of results
          const resultArray = Array.isArray(results) ? results : [results];
          
          resultsContainer.innerHTML = `
            <div class="results-count">
              <i class="fas fa-list"></i>
              <span>Found ${resultArray.length} result${resultArray.length === 1 ? '' : 's'}</span>
            </div>
            <div class="results-list">
              ${resultArray.map(item => this.renderMetadataItem(item)).join('')}
            </div>
          `;
        } catch (error) {
          console.error('Metadata search failed:', error);
          resultsContainer.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-circle"></i>
              <span>Error: ${error.message}</span>
            </div>
          `;
        }
      });
    } catch (error) {
      console.error('Failed to render metadata index browser:', error);
      metadataIndexEl.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <span>Error: ${error.message}</span>
        </div>
      `;
    }
  }
  
  /**
   * Render a metadata item
   * @param {Object} item Metadata item to render
   * @returns {string} HTML for the metadata item
   */
  renderMetadataItem(item) {
    return `
      <div class="metadata-item">
        <div class="metadata-header">
          <h4>${item.path || item.cid || 'Unknown'}</h4>
        </div>
        <div class="metadata-details">
          <div class="metadata-row">
            <span class="metadata-label">CID:</span>
            <span class="metadata-value">${item.cid || 'Unknown'}</span>
          </div>
          ${item.path ? `
            <div class="metadata-row">
              <span class="metadata-label">Path:</span>
              <span class="metadata-value">${item.path}</span>
            </div>
          ` : ''}
          ${item.size ? `
            <div class="metadata-row">
              <span class="metadata-label">Size:</span>
              <span class="metadata-value">${this.formatBytes(item.size)}</span>
            </div>
          ` : ''}
          ${item.created ? `
            <div class="metadata-row">
              <span class="metadata-label">Created:</span>
              <span class="metadata-value">${new Date(item.created).toLocaleString()}</span>
            </div>
          ` : ''}
          ${item.mimetype ? `
            <div class="metadata-row">
              <span class="metadata-label">MIME Type:</span>
              <span class="metadata-value">${item.mimetype}</span>
            </div>
          ` : ''}
          ${item.locations ? `
            <div class="metadata-row">
              <span class="metadata-label">Locations:</span>
              <span class="metadata-value">
                ${Object.keys(item.locations).join(', ')}
              </span>
            </div>
          ` : ''}
        </div>
        
        <div class="metadata-actions">
          <button class="btn btn-sm btn-primary metadata-action-btn" data-action="view" data-cid="${item.cid}">
            <i class="fas fa-eye"></i> View Content
          </button>
          <button class="btn btn-sm btn-secondary metadata-action-btn" data-action="details" data-cid="${item.cid}">
            <i class="fas fa-info-circle"></i> Full Details
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * Render the dashboard
   */
  async render() {
    if (!this.element) {
      console.error('No container element provided for IPFS Kit dashboard');
      return;
    }
    
    // Initialize if not already initialized
    if (!this.initialized) {
      await this.init();
    }
    
    // Create dashboard layout
    this.element.innerHTML = `
      <div class="ipfs-kit-dashboard">
        <div class="dashboard-header">
          <h2><i class="fas fa-network-wired"></i> IPFS Kit Dashboard</h2>
          <div class="header-actions">
            <button id="refresh-status-btn" class="btn btn-sm btn-primary">
              <i class="fas fa-sync"></i> Refresh Status
            </button>
            <button id="start-stop-btn" class="btn btn-sm ${this.status.connected ? 'btn-danger' : 'btn-success'}">
              <i class="fas fa-${this.status.connected ? 'stop-circle' : 'play-circle'}"></i>
              ${this.status.connected ? 'Stop IPFS Kit' : 'Start IPFS Kit'}
            </button>
          </div>
        </div>
        
        <div class="dashboard-grid">
          <div class="grid-section">
            <div class="section-header">
              <h3><i class="fas fa-info-circle"></i> Status</h3>
            </div>
            <div id="ipfs-kit-status" class="section-content">
              <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading IPFS status...</span>
              </div>
            </div>
          </div>
          
          <div class="grid-section">
            <div class="section-header">
              <h3><i class="fas fa-cubes"></i> Modules</h3>
            </div>
            <div id="ipfs-kit-modules" class="section-content">
              <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading module status...</span>
              </div>
            </div>
          </div>
          
          <div class="grid-section full-width">
            <div class="section-header">
              <h3><i class="fas fa-vial"></i> Test Results</h3>
            </div>
            <div id="ipfs-kit-test-results" class="section-content">
              <div class="no-results">No test results available</div>
            </div>
          </div>
          
          <div class="grid-section full-width">
            <div class="section-header">
              <h3><i class="fas fa-database"></i> Metadata Index</h3>
            </div>
            <div id="ipfs-kit-metadata-index" class="section-content">
              <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading metadata index browser...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners
    this.element.querySelector('#refresh-status-btn').addEventListener('click', () => {
      this.refreshStatus();
    });
    
    this.element.querySelector('#start-stop-btn').addEventListener('click', async () => {
      const button = this.element.querySelector('#start-stop-btn');
      button.disabled = true;
      
      if (this.status.connected) {
        // Stop IPFS Kit
        try {
          await this.ipfsKit.stop();
          button.innerHTML = '<i class="fas fa-play-circle"></i> Start IPFS Kit';
          button.classList.remove('btn-danger');
          button.classList.add('btn-success');
        } catch (error) {
          console.error('Failed to stop IPFS Kit:', error);
        }
      } else {
        // Start IPFS Kit
        try {
          await this.ipfsKit.start();
          button.innerHTML = '<i class="fas fa-stop-circle"></i> Stop IPFS Kit';
          button.classList.remove('btn-success');
          button.classList.add('btn-danger');
        } catch (error) {
          console.error('Failed to start IPFS Kit:', error);
        }
      }
      
      button.disabled = false;
      this.refreshStatus();
    });
    
    // Update UI with current status
    this.updateStatusUI();
    
    // Render metadata index browser
    await this.renderMetadataIndexBrowser();
    
    // Set up periodic refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => this.refreshStatus(), 30000); // Refresh every 30 seconds
  }
  
  /**
   * Clean up resources when the dashboard is destroyed
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Only stop IPFS Kit if we created it
    if (this.ipfsKit && !this.options.ipfsKit) {
      this.ipfsKit.stop().catch(error => {
        console.error('Failed to stop IPFS Kit:', error);
      });
    }
  }
}

export default IPFSKitDashboard;