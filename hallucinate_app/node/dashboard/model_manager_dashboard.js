/**
 * Model Manager Dashboard Component
 * 
 * Provides visualization and management of models with secure access control
 * Displays loaded models, capabilities and resource usage statistics
 * Implements secure access patterns for model operations
 */

import { authManager } from '../auth.js';
import { secureModelManager, MODEL_CAPABILITIES } from '../secure_model_manager.js';

class ModelManagerDashboard {
  /**
   * Create a new ModelManagerDashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.element Container element for the dashboard
   * @param {Object} options.eventBus Event bus for communication
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.eventBus = options.eventBus;
    
    this.auth = options.auth || authManager;
    this.modelManager = options.modelManager || secureModelManager;
    
    this.initialized = false;
    this.tokens = {};
    this.models = [];
  }
  
  /**
   * Initialize the dashboard component
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure resources are initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      if (!this.modelManager.initialized) {
        await this.modelManager.init();
      }
      
      // Get required capability tokens
      this.tokens = {
        admin: await this.auth.getCapabilityToken(`${MODEL_CAPABILITIES.ADMIN}:*`),
        load: await this.auth.getCapabilityToken(`${MODEL_CAPABILITIES.LOAD}:*`),
        inference: await this.auth.getCapabilityToken(`${MODEL_CAPABILITIES.INFERENCE}:*`),
        list: await this.auth.getCapabilityToken(`${MODEL_CAPABILITIES.LIST}:*`),
        cache: await this.auth.getCapabilityToken(`${MODEL_CAPABILITIES.CACHE}:status`),
      };
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize model manager dashboard:', error);
      this.showError('Failed to initialize. Check console for details.');
      return false;
    }
  }
  
  /**
   * Render the dashboard into the container element
   */
  async render() {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.element) {
      console.error('No container element provided for model manager dashboard');
      return;
    }
    
    // Create main container
    this.element.innerHTML = `
      <div class="model-manager-dashboard">
        <div class="dashboard-header">
          <h2><i class="fas fa-cubes"></i> Model Manager</h2>
          <div class="status-indicator" id="model-manager-status">
            <span class="status-dot"></span>
            <span class="status-text">Initializing...</span>
          </div>
        </div>
        
        <div class="dashboard-tabs">
          <button class="tab-button active" data-tab="models-summary">Summary</button>
          <button class="tab-button" data-tab="models-list">Models</button>
          <button class="tab-button" data-tab="model-operations">Operations</button>
          <button class="tab-button" data-tab="model-stats">Statistics</button>
        </div>
        
        <div class="dashboard-content">
          <!-- Summary Tab -->
          <div class="tab-content active" id="models-summary-content">
            <div class="card-grid">
              <div class="mini-card">
                <div class="mini-card-value" id="models-count">0</div>
                <div class="mini-card-label">Models</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="inferences-count">0</div>
                <div class="mini-card-label">Inferences</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="access-granted-count">0</div>
                <div class="mini-card-label">Access Granted</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="access-denied-count">0</div>
                <div class="mini-card-label">Access Denied</div>
              </div>
            </div>
            
            <div class="dashboard-card">
              <div class="card-header">
                <h3>System Status</h3>
              </div>
              <div class="card-body">
                <div class="status-grid">
                  <div class="status-item">
                    <span class="status-label">Model Manager:</span>
                    <span class="status-value" id="model-manager-module-status">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Cache Status:</span>
                    <span class="status-value" id="model-cache-status">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Auth Status:</span>
                    <span class="status-value" id="model-auth-status">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Last Request:</span>
                    <span class="status-value" id="last-request-status">-</span>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn btn-primary" id="btn-run-model-manager-test">
                    <i class="fas fa-vial"></i> Run Tests
                  </button>
                  <button class="btn btn-outline" id="btn-refresh-model-manager">
                    <i class="fas fa-sync"></i> Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Models List Tab -->
          <div class="tab-content" id="models-list-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Loaded Models</h3>
                <div class="card-actions">
                  <button class="btn btn-sm" id="btn-load-model">
                    <i class="fas fa-plus"></i> Load Model
                  </button>
                </div>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="models-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Loaded At</th>
                        <th>Last Used</th>
                        <th>Loaded By</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="5" class="text-center">Loading models...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Model Operations Tab -->
          <div class="tab-content" id="model-operations-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Model Operations</h3>
              </div>
              <div class="card-body">
                <div class="operation-panels">
                  <!-- Load Model Panel -->
                  <div class="operation-panel">
                    <h4>Load Model</h4>
                    <div class="form-group">
                      <label for="load-model-id">Model ID:</label>
                      <input type="text" id="load-model-id" placeholder="e.g., bert-base-uncased">
                    </div>
                    <div class="form-group">
                      <label for="load-model-source">Source:</label>
                      <select id="load-model-source">
                        <option value="huggingface">HuggingFace Hub</option>
                        <option value="ipfs">IPFS</option>
                      </select>
                    </div>
                    <div class="form-group" id="load-model-cid-group" style="display: none;">
                      <label for="load-model-cid">IPFS CID:</label>
                      <input type="text" id="load-model-cid" placeholder="IPFS Content ID">
                    </div>
                    <div class="actions">
                      <button class="btn btn-primary" id="btn-load-model-submit">
                        <i class="fas fa-download"></i> Load Model
                      </button>
                    </div>
                    <div id="load-model-result" class="result-area"></div>
                  </div>
                  
                  <!-- Run Inference Panel -->
                  <div class="operation-panel">
                    <h4>Run Inference</h4>
                    <div class="form-group">
                      <label for="inference-model-id">Model:</label>
                      <select id="inference-model-id">
                        <option value="">-- Select Model --</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="inference-input">Input:</label>
                      <textarea id="inference-input" placeholder="Enter input text for inference"></textarea>
                    </div>
                    <div class="actions">
                      <button class="btn btn-primary" id="btn-run-inference">
                        <i class="fas fa-play"></i> Run Inference
                      </button>
                    </div>
                    <div id="inference-result" class="result-area"></div>
                  </div>
                  
                  <!-- Unload Model Panel -->
                  <div class="operation-panel">
                    <h4>Unload Model</h4>
                    <div class="form-group">
                      <label for="unload-model-id">Model:</label>
                      <select id="unload-model-id">
                        <option value="">-- Select Model --</option>
                      </select>
                    </div>
                    <div class="actions">
                      <button class="btn btn-danger" id="btn-unload-model">
                        <i class="fas fa-trash"></i> Unload Model
                      </button>
                    </div>
                    <div id="unload-model-result" class="result-area"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Model Stats Tab -->
          <div class="tab-content" id="model-stats-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Resource Usage</h3>
              </div>
              <div class="card-body">
                <div class="stats-container">
                  <div class="stats-section">
                    <h4>Top Models by Inference</h4>
                    <div class="table-container">
                      <table class="data-table" id="top-models-table">
                        <thead>
                          <tr>
                            <th>Model ID</th>
                            <th>Inferences</th>
                            <th>Loads</th>
                            <th>Last Access</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colspan="4" class="text-center">Loading stats...</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div class="stats-section">
                    <h4>User Activity</h4>
                    <div class="table-container">
                      <table class="data-table" id="user-activity-table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Inferences</th>
                            <th>Loads</th>
                            <th>Models Used</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colspan="4" class="text-center">Loading stats...</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners
    this.addEventListeners();
    
    // Load initial data
    await this.loadData();
  }
  
  /**
   * Add event listeners to dashboard elements
   */
  addEventListeners() {
    // Tab switching
    const tabButtons = this.element.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all buttons and content
        tabButtons.forEach(btn => btn.classList.remove('active'));
        const contents = this.element.querySelectorAll('.tab-content');
        contents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(`${tabId}-content`).classList.add('active');
      });
    });
    
    // Run tests button
    const runTestBtn = this.element.querySelector('#btn-run-model-manager-test');
    if (runTestBtn) {
      runTestBtn.addEventListener('click', () => this.runTests());
    }
    
    // Refresh button
    const refreshBtn = this.element.querySelector('#btn-refresh-model-manager');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadData());
    }
    
    // Load model source selection
    const modelSourceSelect = this.element.querySelector('#load-model-source');
    if (modelSourceSelect) {
      modelSourceSelect.addEventListener('change', () => {
        const cidGroup = this.element.querySelector('#load-model-cid-group');
        cidGroup.style.display = modelSourceSelect.value === 'ipfs' ? 'block' : 'none';
      });
    }
    
    // Load model button
    const loadModelBtn = this.element.querySelector('#btn-load-model-submit');
    if (loadModelBtn) {
      loadModelBtn.addEventListener('click', () => this.handleLoadModel());
    }
    
    // Run inference button
    const runInferenceBtn = this.element.querySelector('#btn-run-inference');
    if (runInferenceBtn) {
      runInferenceBtn.addEventListener('click', () => this.handleRunInference());
    }
    
    // Unload model button
    const unloadModelBtn = this.element.querySelector('#btn-unload-model');
    if (unloadModelBtn) {
      unloadModelBtn.addEventListener('click', () => this.handleUnloadModel());
    }
    
    // Load model button in header
    const loadModelHeaderBtn = this.element.querySelector('#btn-load-model');
    if (loadModelHeaderBtn) {
      loadModelHeaderBtn.addEventListener('click', () => {
        // Switch to operations tab and focus on load model section
        this.element.querySelector('.tab-button[data-tab="model-operations"]').click();
        this.element.querySelector('#load-model-id').focus();
      });
    }
  }
  
  /**
   * Load data for the dashboard
   */
  async loadData() {
    try {
      // Update status indicators
      this.updateStatus();
      
      // Load models
      await this.loadModels();
      
      // Load stats
      await this.loadStats();
      
      // Update model dropdowns
      this.updateModelDropdowns();
    } catch (error) {
      console.error('Failed to load model manager dashboard data:', error);
      this.showError('Failed to load data. Check console for details.');
    }
  }
  
  /**
   * Update dashboard status indicators
   */
  async updateStatus() {
    // Overall status
    const statusEl = this.element.querySelector('#model-manager-status');
    statusEl.innerHTML = `
      <span class="status-dot online"></span>
      <span class="status-text">Active</span>
    `;
    
    // Component status
    this.element.querySelector('#model-manager-module-status').innerHTML = 
      this.modelManager.initialized ? 
      '<span class="status-badge online">Online</span>' : 
      '<span class="status-badge offline">Offline</span>';
    
    // Try to get cache status
    try {
      const cacheStatus = await this.modelManager.getCacheStatus({ authToken: this.tokens.cache });
      this.element.querySelector('#model-cache-status').innerHTML = 
        `<span class="status-badge online">${cacheStatus.cacheSize} models</span>`;
    } catch (error) {
      this.element.querySelector('#model-cache-status').innerHTML = 
        '<span class="status-badge offline">Error</span>';
    }
    
    // Auth status
    this.element.querySelector('#model-auth-status').innerHTML = 
      this.auth.initialized ? 
      '<span class="status-badge online">Authenticated</span>' : 
      '<span class="status-badge offline">Not Authenticated</span>';
    
    // Last request status
    try {
      const stats = await this.modelManager.getStats({ authToken: this.tokens.admin });
      if (stats.lastRequest) {
        const lastReq = stats.lastRequest;
        this.element.querySelector('#last-request-status').innerHTML = 
          `<span>${lastReq.action} at ${new Date(lastReq.timestamp).toLocaleTimeString()}</span>`;
      } else {
        this.element.querySelector('#last-request-status').innerHTML = 
          '<span>No requests yet</span>';
      }
    } catch (error) {
      this.element.querySelector('#last-request-status').innerHTML = 
        '<span>Unable to fetch</span>';
    }
  }
  
  /**
   * Load models data
   */
  async loadModels() {
    const tableBody = this.element.querySelector('#models-table tbody');
    
    try {
      // Get models
      this.models = await this.modelManager.listModels({ authToken: this.tokens.list });
      
      if (!this.models || this.models.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No models loaded</td></tr>';
        return;
      }
      
      // Build table rows
      let html = '';
      for (const model of this.models) {
        const loadedAt = model.loadedAt ? new Date(model.loadedAt).toLocaleString() : 'N/A';
        const lastUsed = model.lastUsed ? new Date(model.lastUsed).toLocaleString() : 'N/A';
        
        html += `
          <tr>
            <td>${model.id}</td>
            <td>${loadedAt}</td>
            <td>${lastUsed}</td>
            <td>${model.loadedBy || 'Unknown'}</td>
            <td>
              <button class="btn btn-sm btn-outline" data-model-id="${model.id}" data-action="view-model">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline" data-model-id="${model.id}" data-action="run-inference">
                <i class="fas fa-play"></i>
              </button>
              <button class="btn btn-sm btn-outline" data-model-id="${model.id}" data-action="unload-model">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }
      
      tableBody.innerHTML = html;
      
      // Update models count in summary
      this.element.querySelector('#models-count').textContent = this.models.length;
      
      // Add event listeners to action buttons
      tableBody.querySelectorAll('[data-action="view-model"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const modelId = e.target.closest('[data-model-id]').getAttribute('data-model-id');
          this.viewModelDetails(modelId);
        });
      });
      
      tableBody.querySelectorAll('[data-action="run-inference"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const modelId = e.target.closest('[data-model-id]').getAttribute('data-model-id');
          
          // Switch to operations tab and set selected model
          this.element.querySelector('.tab-button[data-tab="model-operations"]').click();
          this.element.querySelector('#inference-model-id').value = modelId;
          this.element.querySelector('#inference-input').focus();
        });
      });
      
      tableBody.querySelectorAll('[data-action="unload-model"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const modelId = e.target.closest('[data-model-id]').getAttribute('data-model-id');
          
          // Switch to operations tab and set selected model for unloading
          this.element.querySelector('.tab-button[data-tab="model-operations"]').click();
          this.element.querySelector('#unload-model-id').value = modelId;
          this.element.querySelector('#btn-unload-model').focus();
        });
      });
    } catch (error) {
      console.error('Failed to load models:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-error">
            Failed to load models: ${error.message}
          </td>
        </tr>
      `;
    }
  }
  
  /**
   * Load stats data
   */
  async loadStats() {
    try {
      // Get stats
      const stats = await this.modelManager.getStats({ authToken: this.tokens.admin });
      
      // Update summary counts
      this.element.querySelector('#models-count').textContent = stats.modelCount || 0;
      this.element.querySelector('#inferences-count').textContent = stats.inferencesRun || 0;
      this.element.querySelector('#access-granted-count').textContent = stats.accessGranted || 0;
      this.element.querySelector('#access-denied-count').textContent = stats.accessDenied || 0;
      
      // Update top models table
      const topModelsTable = this.element.querySelector('#top-models-table tbody');
      if (stats.resourceUsage && stats.resourceUsage.topModels && stats.resourceUsage.topModels.length > 0) {
        let html = '';
        for (const model of stats.resourceUsage.topModels) {
          const lastAccess = model.lastAccess ? new Date(model.lastAccess).toLocaleString() : 'N/A';
          
          html += `
            <tr>
              <td>${model.modelId}</td>
              <td>${model.inferences || 0}</td>
              <td>${model.loads || 0}</td>
              <td>${lastAccess}</td>
            </tr>
          `;
        }
        topModelsTable.innerHTML = html;
      } else {
        topModelsTable.innerHTML = '<tr><td colspan="4" class="text-center">No model usage data</td></tr>';
      }
      
      // Update user activity table
      const userActivityTable = this.element.querySelector('#user-activity-table tbody');
      if (stats.resourceUsage && stats.resourceUsage.byUser && Object.keys(stats.resourceUsage.byUser).length > 0) {
        let html = '';
        for (const [userId, userStats] of Object.entries(stats.resourceUsage.byUser)) {
          const modelsUsed = Array.isArray(userStats.models) ? userStats.models.join(', ') : 'None';
          
          html += `
            <tr>
              <td>${userId}</td>
              <td>${userStats.inferences || 0}</td>
              <td>${userStats.loads || 0}</td>
              <td>${modelsUsed}</td>
            </tr>
          `;
        }
        userActivityTable.innerHTML = html;
      } else {
        userActivityTable.innerHTML = '<tr><td colspan="4" class="text-center">No user activity data</td></tr>';
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }
  
  /**
   * Update model selection dropdowns
   */
  updateModelDropdowns() {
    const inferenceSelect = this.element.querySelector('#inference-model-id');
    const unloadSelect = this.element.querySelector('#unload-model-id');
    
    if (!inferenceSelect || !unloadSelect) return;
    
    // Clear current options except the default
    while (inferenceSelect.options.length > 1) {
      inferenceSelect.remove(1);
    }
    
    while (unloadSelect.options.length > 1) {
      unloadSelect.remove(1);
    }
    
    // Add options for each model
    for (const model of this.models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.text = model.id;
      
      inferenceSelect.add(option.cloneNode(true));
      unloadSelect.add(option);
    }
  }
  
  /**
   * Handle load model form submission
   */
  async handleLoadModel() {
    const modelId = this.element.querySelector('#load-model-id').value.trim();
    const source = this.element.querySelector('#load-model-source').value;
    const resultArea = this.element.querySelector('#load-model-result');
    const submitButton = this.element.querySelector('#btn-load-model-submit');
    
    if (!modelId) {
      resultArea.innerHTML = '<div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> Model ID is required</div>';
      return;
    }
    
    // Show loading state
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    resultArea.innerHTML = '<div class="loading">Loading model...</div>';
    
    try {
      // Prepare options
      const options = {
        authToken: this.tokens.load,
        source,
        userId: 'dashboard-user'
      };
      
      // Add CID for IPFS source
      if (source === 'ipfs') {
        const cid = this.element.querySelector('#load-model-cid').value.trim();
        if (!cid) {
          resultArea.innerHTML = '<div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> IPFS CID is required</div>';
          submitButton.disabled = false;
          submitButton.innerHTML = '<i class="fas fa-download"></i> Load Model';
          return;
        }
        options.cid = cid;
      }
      
      // Load the model
      const result = await this.modelManager.loadModel(modelId, options);
      
      if (result.success) {
        resultArea.innerHTML = `
          <div class="alert alert-success">
            <i class="fas fa-check-circle"></i> Model ${modelId} loaded successfully
          </div>
        `;
        
        // Clear the form
        this.element.querySelector('#load-model-id').value = '';
        if (source === 'ipfs') {
          this.element.querySelector('#load-model-cid').value = '';
        }
        
        // Refresh data
        await this.loadData();
      } else {
        resultArea.innerHTML = `
          <div class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> Failed to load model: ${result.error || 'Unknown error'}
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load model:', error);
      resultArea.innerHTML = `
        <div class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> Failed to load model: ${error.message}
        </div>
      `;
    } finally {
      // Restore button
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-download"></i> Load Model';
    }
  }
  
  /**
   * Handle run inference form submission
   */
  async handleRunInference() {
    const modelId = this.element.querySelector('#inference-model-id').value;
    const input = this.element.querySelector('#inference-input').value.trim();
    const resultArea = this.element.querySelector('#inference-result');
    const submitButton = this.element.querySelector('#btn-run-inference');
    
    if (!modelId) {
      resultArea.innerHTML = '<div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> Please select a model</div>';
      return;
    }
    
    if (!input) {
      resultArea.innerHTML = '<div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> Input is required</div>';
      return;
    }
    
    // Show loading state
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
    resultArea.innerHTML = '<div class="loading">Running inference...</div>';
    
    try {
      // Run inference
      const result = await this.modelManager.runInference(modelId, input, {
        authToken: this.tokens.inference,
        userId: 'dashboard-user'
      });
      
      if (result.success) {
        // Format result as JSON
        const formattedResult = JSON.stringify(result, null, 2);
        
        resultArea.innerHTML = `
          <div class="alert alert-success">
            <i class="fas fa-check-circle"></i> Inference completed successfully
          </div>
          <pre class="code-block">${formattedResult}</pre>
        `;
        
        // Refresh stats after successful inference
        await this.loadStats();
      } else {
        resultArea.innerHTML = `
          <div class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> Inference failed: ${result.error || 'Unknown error'}
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to run inference:', error);
      resultArea.innerHTML = `
        <div class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> Failed to run inference: ${error.message}
        </div>
      `;
    } finally {
      // Restore button
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-play"></i> Run Inference';
    }
  }
  
  /**
   * Handle unload model form submission
   */
  async handleUnloadModel() {
    const modelId = this.element.querySelector('#unload-model-id').value;
    const resultArea = this.element.querySelector('#unload-model-result');
    const submitButton = this.element.querySelector('#btn-unload-model');
    
    if (!modelId) {
      resultArea.innerHTML = '<div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> Please select a model</div>';
      return;
    }
    
    // Confirm unloading
    if (!confirm(`Are you sure you want to unload model ${modelId}?`)) {
      return;
    }
    
    // Show loading state
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unloading...';
    resultArea.innerHTML = '<div class="loading">Unloading model...</div>';
    
    try {
      // Unload the model
      const result = await this.modelManager.unloadModel(modelId, {
        authToken: this.tokens.admin,
        userId: 'dashboard-user'
      });
      
      if (result.success) {
        resultArea.innerHTML = `
          <div class="alert alert-success">
            <i class="fas fa-check-circle"></i> Model ${modelId} unloaded successfully
          </div>
        `;
        
        // Clear the select
        this.element.querySelector('#unload-model-id').value = '';
        
        // Refresh data
        await this.loadData();
      } else {
        resultArea.innerHTML = `
          <div class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> Failed to unload model: ${result.error || 'Unknown error'}
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to unload model:', error);
      resultArea.innerHTML = `
        <div class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> Failed to unload model: ${error.message}
        </div>
      `;
    } finally {
      // Restore button
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-trash"></i> Unload Model';
    }
  }
  
  /**
   * View model details
   * @param {string} modelId Model ID
   */
  viewModelDetails(modelId) {
    // Find model in the loaded models list
    const model = this.models.find(m => m.id === modelId);
    
    if (!model) {
      this.showError(`Model ${modelId} not found`);
      return;
    }
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Model Details</h3>
          <button class="dialog-close" id="close-model-details">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="detail-group">
            <div class="detail-label">ID:</div>
            <div class="detail-value">${model.id}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Loaded At:</div>
            <div class="detail-value">${model.loadedAt ? new Date(model.loadedAt).toLocaleString() : 'N/A'}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Last Used:</div>
            <div class="detail-value">${model.lastUsed ? new Date(model.lastUsed).toLocaleString() : 'N/A'}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Loaded By:</div>
            <div class="detail-value">${model.loadedBy || 'Unknown'}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Metadata:</div>
            <div class="detail-value">
              <pre class="code-block">${JSON.stringify(model.metadata || {}, null, 2)}</pre>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="btn-model-inference">Run Inference</button>
          <button class="btn btn-primary" id="btn-close-model-details">Close</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-model-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-close-model-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-model-inference').addEventListener('click', () => {
      document.body.removeChild(dialog);
      
      // Switch to operations tab and set selected model
      this.element.querySelector('.tab-button[data-tab="model-operations"]').click();
      this.element.querySelector('#inference-model-id').value = modelId;
      this.element.querySelector('#inference-input').focus();
    });
  }
  
  /**
   * Run tests for model manager
   */
  async runTests() {
    try {
      // Disable test button
      const testBtn = this.element.querySelector('#btn-run-model-manager-test');
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
      
      // Show testing status
      this.showMessage('info', 'Running model manager tests...');
      
      // Run test
      const result = await this.modelManager.test();
      
      // Show result
      if (result.success) {
        this.showMessage('success', 'Model manager tests passed successfully!');
      } else {
        this.showMessage('error', `Tests failed: ${result.error || 'Unknown error'}`);
      }
      
      // Show detailed test results dialog
      this.showTestResults(result);
      
      // Re-enable test button
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fas fa-vial"></i> Run Tests';
      
      // Refresh dashboard data
      await this.loadData();
    } catch (error) {
      console.error('Failed to run tests:', error);
      this.showError(`Failed to run tests: ${error.message}`);
      
      // Re-enable test button
      const testBtn = this.element.querySelector('#btn-run-model-manager-test');
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fas fa-vial"></i> Run Tests';
    }
  }
  
  /**
   * Show test results dialog
   * @param {Object} results Test results
   */
  showTestResults(results) {
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    let modelOperationsHtml = '';
    if (results.model_operations) {
      const ops = results.model_operations;
      modelOperationsHtml = `
        <ul>
          <li>Load Model: ${ops.load ? 'Pass' : 'Fail'}</li>
          <li>Run Inference: ${ops.inference ? 'Pass' : 'Fail'}</li>
          <li>List Models: ${ops.list ? 'Pass' : 'Fail'}</li>
          <li>Unload Model: ${ops.unload ? 'Pass' : 'Fail'}</li>
        </ul>
      `;
    }
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Model Manager Test Results</h3>
          <button class="dialog-close" id="close-test-dialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="test-results ${results.success ? 'success' : 'failure'}">
            <h4>
              <i class="fas fa-${results.success ? 'check' : 'times'}-circle"></i>
              ${results.success ? 'Tests Passed' : 'Tests Failed'}
            </h4>
            
            <div class="detail-group">
              <div class="detail-label">Initialization:</div>
              <div class="detail-value">${results.initialization ? 'Pass' : 'Fail'}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Capability Verification:</div>
              <div class="detail-value">${results.capability_verification ? 'Pass' : 'Fail'}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Model Operations:</div>
              <div class="detail-value">${modelOperationsHtml}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Stats Tracking:</div>
              <div class="detail-value">${results.stats_tracking ? 'Pass' : 'Fail'}</div>
            </div>
            
            ${results.error ? `
              <div class="detail-group">
                <div class="detail-label">Error:</div>
                <div class="detail-value text-error">${results.error}</div>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-primary" id="btn-close-test-results">Close</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-test-dialog').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-close-test-results').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
  }
  
  /**
   * Show error message
   * @param {string} message Error message
   */
  showError(message) {
    alert(`Error: ${message}`);
  }
  
  /**
   * Show message
   * @param {string} type Message type (success, error, info, warning)
   * @param {string} message Message text
   */
  showMessage(type, message) {
    alert(message);
  }
}

export default ModelManagerDashboard;