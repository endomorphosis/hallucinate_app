/**
 * Transformers Security Dashboard Component
 * 
 * Provides visualization and management interface for transformer model security
 * Displays capabilities, usage statistics, and provides access control UI
 */

import { secureTransformersManager, TRANSFORMER_CAPABILITIES } from '../secure_transformers_manager.js';
import { authManager } from '../auth.js';

class TransformersSecurityDashboard {
  /**
   * Create a new TransformersSecurityDashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.container Container element to render the dashboard
   * @param {Object} options.resources Resource pool containing necessary modules
   */
  constructor(options = {}) {
    this.container = options.container;
    this.resources = options.resources || {};
    
    // Use provided resources or default instances
    this.auth = this.resources.auth || authManager;
    this.secureTransformersManager = this.resources.secureTransformersManager || secureTransformersManager;
    
    // UI state
    this.state = {
      principals: [],
      models: {},
      capabilities: {},
      selectedPrincipal: null,
      selectedModel: null,
      loading: false,
      stats: null,
      error: null,
      supportedTasks: [
        { id: 'text-generation', name: 'Text Generation' },
        { id: 'fill-mask', name: 'Fill Mask' },
        { id: 'token-classification', name: 'Token Classification' },
        { id: 'sequence-classification', name: 'Sequence Classification' },
        { id: 'question-answering', name: 'Question Answering' },
        { id: 'summarization', name: 'Summarization' },
        { id: 'translation', name: 'Translation' },
        { id: 'feature-extraction', name: 'Feature Extraction' }
      ]
    };
    
    // Initialize the dashboard
    this.initialize();
  }
  
  /**
   * Initialize the dashboard and load initial data
   */
  async initialize() {
    try {
      // Initialize required modules
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      if (!this.secureTransformersManager.initialized) {
        await this.secureTransformersManager.init();
      }
      
      // Render initial layout
      this.renderDashboard();
      
      // Load initial data
      await this.loadData();
      
      // Set up event handlers for UI interactions
      this.setupEventHandlers();
      
      // Set up auto-refresh
      this.startAutoRefresh();
    } catch (error) {
      console.error('Failed to initialize transformers security dashboard:', error);
      this.showError('Failed to initialize dashboard');
    }
  }
  
  /**
   * Render the dashboard layout
   */
  renderDashboard() {
    if (!this.container) {
      console.error('No container element provided for dashboard');
      return;
    }
    
    this.container.innerHTML = `
      <div class="dashboard-module transformers-security-dashboard">
        <h2>Transformer Models Security Dashboard</h2>
        <div class="dashboard-alert" id="transformers-security-alert" style="display: none;"></div>
        
        <div class="dashboard-panels">
          <!-- Statistics Panel -->
          <div class="dashboard-panel">
            <h3>Access Statistics</h3>
            <div id="transformers-security-stats" class="dashboard-stats">
              <div class="loading">Loading statistics...</div>
            </div>
          </div>
          
          <!-- Principals Panel -->
          <div class="dashboard-panel">
            <h3>Principals</h3>
            <div class="dashboard-action-bar">
              <button id="create-principal-btn" class="dashboard-btn">Create Principal</button>
            </div>
            <div id="principals-list" class="dashboard-list">
              <div class="loading">Loading principals...</div>
            </div>
          </div>
          
          <!-- Models Panel -->
          <div class="dashboard-panel">
            <h3>Transformer Models</h3>
            <div class="dashboard-action-bar">
              <button id="load-model-btn" class="dashboard-btn">Load Model</button>
            </div>
            <div id="models-list" class="dashboard-list">
              <div class="loading">Loading models...</div>
            </div>
          </div>
          
          <!-- Capabilities Panel -->
          <div class="dashboard-panel">
            <h3>Capabilities</h3>
            <div class="dashboard-action-bar">
              <button id="issue-capability-btn" class="dashboard-btn">Issue Capability</button>
              <button id="revoke-capability-btn" class="dashboard-btn">Revoke Capability</button>
            </div>
            <div id="capabilities-list" class="dashboard-list">
              <p>Select a principal to view capabilities</p>
            </div>
          </div>
        </div>
        
        <!-- Capability Assignment Form -->
        <div id="capability-assignment-form" class="dashboard-form" style="display: none;">
          <h3>Assign Capability</h3>
          <form>
            <div class="form-group">
              <label for="issuer-select">Issuer</label>
              <select id="issuer-select"></select>
            </div>
            <div class="form-group">
              <label for="audience-select">Audience</label>
              <select id="audience-select"></select>
            </div>
            <div class="form-group">
              <label for="capability-select">Capability</label>
              <select id="capability-select">
                <option value="${TRANSFORMER_CAPABILITIES.LOAD}">Load Model</option>
                <option value="${TRANSFORMER_CAPABILITIES.INFERENCE}">Run Inference</option>
                <option value="${TRANSFORMER_CAPABILITIES.LIST}">List Models</option>
                <option value="${TRANSFORMER_CAPABILITIES.ADMIN}">Admin Access</option>
              </select>
            </div>
            <div class="form-group">
              <label for="resource-select">Resource</label>
              <select id="resource-select">
                <option value="*">All Resources (*)</option>
              </select>
            </div>
            <div class="form-actions">
              <button type="button" id="cancel-capability-btn" class="dashboard-btn">Cancel</button>
              <button type="button" id="assign-capability-btn" class="dashboard-btn primary">Assign</button>
            </div>
          </form>
        </div>
        
        <!-- Load Model Form -->
        <div id="load-model-form" class="dashboard-form" style="display: none;">
          <h3>Load Transformer Model</h3>
          <form>
            <div class="form-group">
              <label for="model-id-input">Model ID</label>
              <input type="text" id="model-id-input" placeholder="huggingface/model-name" required>
            </div>
            <div class="form-group">
              <label for="task-select">Task</label>
              <select id="task-select">
                ${this.state.supportedTasks.map(task => 
                  `<option value="${task.id}">${task.name}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-actions">
              <button type="button" id="cancel-load-model-btn" class="dashboard-btn">Cancel</button>
              <button type="button" id="load-model-submit-btn" class="dashboard-btn primary">Load Model</button>
            </div>
          </form>
        </div>
        
        <!-- Inference Form -->
        <div id="run-inference-form" class="dashboard-form" style="display: none;">
          <h3>Run Inference</h3>
          <form>
            <div class="form-group">
              <label for="model-select">Model</label>
              <select id="model-select"></select>
            </div>
            <div class="form-group">
              <label for="input-text">Input Text</label>
              <textarea id="input-text" rows="5" placeholder="Enter text for inference..." required></textarea>
            </div>
            <div class="form-group">
              <label for="inference-params">Parameters (JSON)</label>
              <textarea id="inference-params" rows="3" placeholder='{"max_length": 50, "temperature": 0.7}'></textarea>
            </div>
            <div class="form-actions">
              <button type="button" id="cancel-inference-btn" class="dashboard-btn">Cancel</button>
              <button type="button" id="run-inference-btn" class="dashboard-btn primary">Run Inference</button>
            </div>
          </form>
        </div>
        
        <!-- Inference Results -->
        <div id="inference-results" class="dashboard-form" style="display: none;">
          <h3>Inference Results</h3>
          <div id="inference-results-content"></div>
          <div class="form-actions">
            <button type="button" id="close-results-btn" class="dashboard-btn">Close</button>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Load all necessary data for the dashboard
   */
  async loadData() {
    this.state.loading = true;
    this.showLoading();
    
    try {
      // Get admin token for operations
      const adminToken = await this.auth.getCapabilityToken(`${TRANSFORMER_CAPABILITIES.ADMIN}:*`);
      
      // Load principals, models, and stats in parallel
      const [principals, models, stats] = await Promise.all([
        this.loadPrincipals(),
        this.loadModels(adminToken),
        this.loadStats(adminToken)
      ]);
      
      // Update state
      this.state.principals = principals;
      this.state.models = models.models || {};
      this.state.stats = stats;
      
      // If a principal is selected, load its capabilities
      if (this.state.selectedPrincipal) {
        this.state.capabilities = await this.loadCapabilities(this.state.selectedPrincipal);
      }
      
      // Update UI with loaded data
      this.updateStatsPanel();
      this.updatePrincipalsPanel();
      this.updateModelsPanel();
      this.updateCapabilitiesPanel();
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.showError('Failed to load dashboard data');
    } finally {
      this.state.loading = false;
      this.hideLoading();
    }
  }
  
  /**
   * Load principals from auth manager
   */
  async loadPrincipals() {
    try {
      // In a real implementation, this would get all principals from auth manager
      // For now, we'll return a sample list including any from the auth manager
      const principalIds = Object.keys(this.auth.principals || {});
      
      // Ensure we always have root and app principals
      if (!principalIds.includes('root')) {
        principalIds.push('root');
      }
      
      if (!principalIds.includes('app')) {
        principalIds.push('app');
      }
      
      return principalIds;
    } catch (error) {
      console.error('Failed to load principals:', error);
      return [];
    }
  }
  
  /**
   * Load models from the secure transformers manager
   */
  async loadModels(adminToken) {
    try {
      const models = await this.secureTransformersManager.listModels({
        authToken: adminToken
      });
      
      return models;
    } catch (error) {
      console.error('Failed to load models:', error);
      return { models: {} };
    }
  }
  
  /**
   * Load capabilities for a specific principal
   */
  async loadCapabilities(principalId) {
    try {
      // Get delegations issued by this principal
      const delegations = await this.auth.getDelegations(principalId);
      
      return delegations;
    } catch (error) {
      console.error(`Failed to load capabilities for ${principalId}:`, error);
      return {};
    }
  }
  
  /**
   * Load statistics from secure transformers manager
   */
  async loadStats(adminToken) {
    try {
      const stats = await this.secureTransformersManager.getStats({
        authToken: adminToken
      });
      
      return stats;
    } catch (error) {
      console.error('Failed to load statistics:', error);
      return null;
    }
  }
  
  /**
   * Update the statistics panel with current data
   */
  updateStatsPanel() {
    const statsEl = document.getElementById('transformers-security-stats');
    
    if (!statsEl) return;
    
    if (!this.state.stats) {
      statsEl.innerHTML = '<div class="empty-state">No statistics available</div>';
      return;
    }
    
    // Format stats for display
    const { stats } = this.state;
    
    statsEl.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${stats.accessGranted || 0}</div>
          <div class="stat-label">Access Granted</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.accessDenied || 0}</div>
          <div class="stat-label">Access Denied</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.modelsLoaded || 0}</div>
          <div class="stat-label">Models Loaded</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.inferencesRun || 0}</div>
          <div class="stat-label">Inferences Run</div>
        </div>
      </div>
      
      <h4>Top Models by Usage</h4>
      <div class="dashboard-table">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Loads</th>
              <th>Inferences</th>
              <th>Last Access</th>
            </tr>
          </thead>
          <tbody>
            ${stats.resourceUsage && stats.resourceUsage.topModels ? 
              stats.resourceUsage.topModels.map(model => `
                <tr>
                  <td>${model.modelId}</td>
                  <td>${model.loads}</td>
                  <td>${model.inferences}</td>
                  <td>${this.formatDate(model.lastAccess)}</td>
                </tr>
              `).join('') : 
              '<tr><td colspan="4">No model usage data available</td></tr>'
            }
          </tbody>
        </table>
      </div>
    `;
  }
  
  /**
   * Update the principals panel with current data
   */
  updatePrincipalsPanel() {
    const principalsEl = document.getElementById('principals-list');
    
    if (!principalsEl) return;
    
    if (!this.state.principals || this.state.principals.length === 0) {
      principalsEl.innerHTML = '<div class="empty-state">No principals available</div>';
      return;
    }
    
    principalsEl.innerHTML = `
      <ul class="dashboard-select-list">
        ${this.state.principals.map(id => `
          <li class="${this.state.selectedPrincipal === id ? 'selected' : ''}" data-id="${id}">
            <div class="list-item-primary">${id}</div>
            ${id === 'root' ? '<div class="list-item-secondary">Root Principal</div>' : ''}
          </li>
        `).join('')}
      </ul>
    `;
    
    // Add click handlers to principal list items
    principalsEl.querySelectorAll('li').forEach(item => {
      item.addEventListener('click', () => {
        const principalId = item.getAttribute('data-id');
        this.selectPrincipal(principalId);
      });
    });
  }
  
  /**
   * Update the models panel with current data
   */
  updateModelsPanel() {
    const modelsEl = document.getElementById('models-list');
    
    if (!modelsEl) return;
    
    const models = this.state.models;
    
    if (!models || Object.keys(models).length === 0) {
      modelsEl.innerHTML = '<div class="empty-state">No transformer models loaded</div>';
      return;
    }
    
    modelsEl.innerHTML = `
      <ul class="dashboard-select-list">
        ${Object.entries(models).map(([id, model]) => `
          <li class="${this.state.selectedModel === id ? 'selected' : ''}" data-id="${id}">
            <div class="list-item-primary">${id}</div>
            <div class="list-item-secondary">
              ${model.task ? `Task: ${model.task}` : ''}
              ${model.lastUsed ? `Last used: ${this.formatDate(model.lastUsed)}` : ''}
              ${model.loadedBy ? `Loaded by: ${model.loadedBy}` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    
    // Add click handlers to model list items
    modelsEl.querySelectorAll('li').forEach(item => {
      item.addEventListener('click', () => {
        const modelId = item.getAttribute('data-id');
        this.selectModel(modelId);
      });
    });
    
    // Also update resource select in capability form
    const resourceSelect = document.getElementById('resource-select');
    
    if (resourceSelect) {
      // Keep the wildcard option
      resourceSelect.innerHTML = '<option value="*">All Resources (*)</option>';
      
      // Add model options
      Object.keys(models).forEach(modelId => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        resourceSelect.appendChild(option);
      });
    }
    
    // Update model select in inference form
    const modelSelect = document.getElementById('model-select');
    
    if (modelSelect) {
      modelSelect.innerHTML = '';
      
      // Add model options
      Object.keys(models).forEach(modelId => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        modelSelect.appendChild(option);
      });
      
      // Pre-select the current model if available
      if (this.state.selectedModel && models[this.state.selectedModel]) {
        modelSelect.value = this.state.selectedModel;
      }
    }
  }
  
  /**
   * Update the capabilities panel with current data
   */
  updateCapabilitiesPanel() {
    const capabilitiesEl = document.getElementById('capabilities-list');
    
    if (!capabilitiesEl) return;
    
    if (!this.state.selectedPrincipal) {
      capabilitiesEl.innerHTML = '<p>Select a principal to view capabilities</p>';
      return;
    }
    
    const capabilities = this.state.capabilities;
    
    if (!capabilities || Object.keys(capabilities).length === 0) {
      capabilitiesEl.innerHTML = `<div class="empty-state">No capabilities issued by ${this.state.selectedPrincipal}</div>`;
      return;
    }
    
    let html = '<div class="capabilities-container">';
    
    Object.entries(capabilities).forEach(([audienceId, delegations]) => {
      html += `<h4>To: ${audienceId}</h4>`;
      html += '<div class="dashboard-table"><table>';
      html += '<thead><tr><th>Capability</th><th>Resource</th><th>Issued At</th><th>Expires</th></tr></thead>';
      html += '<tbody>';
      
      delegations.forEach(delegation => {
        const capability = delegation.capability || {};
        html += `
          <tr data-token-id="${delegation.token_id}">
            <td>${capability.can || 'Unknown'}</td>
            <td>${capability.with || '*'}</td>
            <td>${this.formatDate(delegation.issued_at)}</td>
            <td>${this.formatDate(delegation.expiration)}</td>
          </tr>
        `;
      });
      
      html += '</tbody></table></div>';
    });
    
    html += '</div>';
    capabilitiesEl.innerHTML = html;
    
    // Add click handlers to capability rows for selection
    capabilitiesEl.querySelectorAll('tr[data-token-id]').forEach(row => {
      row.addEventListener('click', () => {
        // Toggle selection
        if (row.classList.contains('selected')) {
          row.classList.remove('selected');
        } else {
          // Deselect others
          capabilitiesEl.querySelectorAll('tr.selected').forEach(selected => {
            selected.classList.remove('selected');
          });
          row.classList.add('selected');
        }
        
        // Update revoke button state
        const revokeBtn = document.getElementById('revoke-capability-btn');
        if (revokeBtn) {
          revokeBtn.disabled = capabilitiesEl.querySelectorAll('tr.selected').length === 0;
        }
      });
    });
  }
  
  /**
   * Set up event handlers for UI interactions
   */
  setupEventHandlers() {
    // Create principal button
    const createPrincipalBtn = document.getElementById('create-principal-btn');
    if (createPrincipalBtn) {
      createPrincipalBtn.addEventListener('click', () => {
        this.showCreatePrincipalDialog();
      });
    }
    
    // Issue capability button
    const issueCapabilityBtn = document.getElementById('issue-capability-btn');
    if (issueCapabilityBtn) {
      issueCapabilityBtn.addEventListener('click', () => {
        this.showCapabilityForm();
      });
    }
    
    // Revoke capability button
    const revokeCapabilityBtn = document.getElementById('revoke-capability-btn');
    if (revokeCapabilityBtn) {
      revokeCapabilityBtn.addEventListener('click', () => {
        this.revokeSelectedCapability();
      });
      // Disable by default until a capability is selected
      revokeCapabilityBtn.disabled = true;
    }
    
    // Capability form buttons
    const cancelCapabilityBtn = document.getElementById('cancel-capability-btn');
    if (cancelCapabilityBtn) {
      cancelCapabilityBtn.addEventListener('click', () => {
        this.hideCapabilityForm();
      });
    }
    
    const assignCapabilityBtn = document.getElementById('assign-capability-btn');
    if (assignCapabilityBtn) {
      assignCapabilityBtn.addEventListener('click', () => {
        this.assignCapability();
      });
    }
    
    // Load model button
    const loadModelBtn = document.getElementById('load-model-btn');
    if (loadModelBtn) {
      loadModelBtn.addEventListener('click', () => {
        this.showLoadModelForm();
      });
    }
    
    // Load model form buttons
    const cancelLoadModelBtn = document.getElementById('cancel-load-model-btn');
    if (cancelLoadModelBtn) {
      cancelLoadModelBtn.addEventListener('click', () => {
        this.hideLoadModelForm();
      });
    }
    
    const loadModelSubmitBtn = document.getElementById('load-model-submit-btn');
    if (loadModelSubmitBtn) {
      loadModelSubmitBtn.addEventListener('click', () => {
        this.loadModel();
      });
    }
    
    // Add double-click handler to models for inference
    const modelsList = document.getElementById('models-list');
    if (modelsList) {
      modelsList.addEventListener('dblclick', event => {
        const listItem = event.target.closest('li');
        if (listItem) {
          const modelId = listItem.getAttribute('data-id');
          this.showInferenceForm(modelId);
        }
      });
    }
    
    // Inference form buttons
    const cancelInferenceBtn = document.getElementById('cancel-inference-btn');
    if (cancelInferenceBtn) {
      cancelInferenceBtn.addEventListener('click', () => {
        this.hideInferenceForm();
      });
    }
    
    const runInferenceBtn = document.getElementById('run-inference-btn');
    if (runInferenceBtn) {
      runInferenceBtn.addEventListener('click', () => {
        this.runInference();
      });
    }
    
    // Inference results close button
    const closeResultsBtn = document.getElementById('close-results-btn');
    if (closeResultsBtn) {
      closeResultsBtn.addEventListener('click', () => {
        this.hideInferenceResults();
      });
    }
  }
  
  /**
   * Show dialog to create a new principal
   */
  async showCreatePrincipalDialog() {
    const principalId = prompt('Enter ID for the new principal:');
    
    if (!principalId || principalId.trim() === '') {
      return;
    }
    
    try {
      this.showLoading();
      
      // Create the principal
      await this.auth.createPrincipal(principalId.trim());
      
      // Reload data
      await this.loadData();
      
      this.showSuccess(`Principal ${principalId} created successfully`);
    } catch (error) {
      console.error(`Failed to create principal ${principalId}:`, error);
      this.showError(`Failed to create principal: ${error.message || error}`);
    } finally {
      this.hideLoading();
    }
  }
  
  /**
   * Show the capability assignment form
   */
  showCapabilityForm() {
    const form = document.getElementById('capability-assignment-form');
    if (!form) return;
    
    // Fill in issuer and audience selects
    const issuerSelect = document.getElementById('issuer-select');
    const audienceSelect = document.getElementById('audience-select');
    
    if (issuerSelect && audienceSelect) {
      // Clear existing options
      issuerSelect.innerHTML = '';
      audienceSelect.innerHTML = '';
      
      // Add principal options to both selects
      this.state.principals.forEach(principalId => {
        const issuerOption = document.createElement('option');
        issuerOption.value = principalId;
        issuerOption.textContent = principalId;
        issuerSelect.appendChild(issuerOption);
        
        const audienceOption = document.createElement('option');
        audienceOption.value = principalId;
        audienceOption.textContent = principalId;
        audienceSelect.appendChild(audienceOption);
      });
      
      // Pre-select the current principal as issuer if available
      if (this.state.selectedPrincipal) {
        issuerSelect.value = this.state.selectedPrincipal;
      }
    }
    
    // Show the form
    form.style.display = 'block';
  }
  
  /**
   * Hide the capability assignment form
   */
  hideCapabilityForm() {
    const form = document.getElementById('capability-assignment-form');
    if (form) {
      form.style.display = 'none';
    }
  }
  
  /**
   * Assign a capability based on form inputs
   */
  async assignCapability() {
    // Get form values
    const issuer = document.getElementById('issuer-select')?.value;
    const audience = document.getElementById('audience-select')?.value;
    const capability = document.getElementById('capability-select')?.value;
    const resource = document.getElementById('resource-select')?.value;
    
    if (!issuer || !audience || !capability) {
      this.showError('Please fill in all required fields');
      return;
    }
    
    try {
      this.showLoading();
      
      // Issue the capability
      await this.auth.issueCapability(issuer, audience, {
        can: capability,
        with: resource || '*'
      });
      
      // Hide the form
      this.hideCapabilityForm();
      
      // Reload data
      await this.loadData();
      
      this.showSuccess('Capability assigned successfully');
    } catch (error) {
      console.error('Failed to assign capability:', error);
      this.showError(`Failed to assign capability: ${error.message || error}`);
    } finally {
      this.hideLoading();
    }
  }
  
  /**
   * Revoke the selected capability
   */
  async revokeSelectedCapability() {
    const selectedRow = document.querySelector('#capabilities-list tr.selected');
    
    if (!selectedRow) {
      this.showError('No capability selected');
      return;
    }
    
    const tokenId = selectedRow.getAttribute('data-token-id');
    
    if (!tokenId) {
      this.showError('Invalid capability selection');
      return;
    }
    
    if (!confirm('Are you sure you want to revoke this capability?')) {
      return;
    }
    
    try {
      this.showLoading();
      
      // Revoke the capability
      await this.auth.revokeCapability(tokenId);
      
      // Reload data
      await this.loadData();
      
      this.showSuccess('Capability revoked successfully');
    } catch (error) {
      console.error('Failed to revoke capability:', error);
      this.showError(`Failed to revoke capability: ${error.message || error}`);
    } finally {
      this.hideLoading();
    }
  }
  
  /**
   * Show the load model form
   */
  showLoadModelForm() {
    const form = document.getElementById('load-model-form');
    if (form) {
      form.style.display = 'block';
    }
  }
  
  /**
   * Hide the load model form
   */
  hideLoadModelForm() {
    const form = document.getElementById('load-model-form');
    if (form) {
      form.style.display = 'none';
    }
  }
  
  /**
   * Load a model based on form inputs
   */
  async loadModel() {
    // Get form values
    const modelId = document.getElementById('model-id-input')?.value;
    const task = document.getElementById('task-select')?.value;
    
    if (!modelId) {
      this.showError('Please enter a model ID');
      return;
    }
    
    try {
      this.showLoading();
      
      // Get load capability token
      const loadToken = await this.auth.getCapabilityToken(`${TRANSFORMER_CAPABILITIES.LOAD}:${modelId}`);
      
      // Load the model
      const result = await this.secureTransformersManager.loadModel(modelId, {
        authToken: loadToken,
        task: task
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load model');
      }
      
      // Hide the form
      this.hideLoadModelForm();
      
      // Reload data
      await this.loadData();
      
      // Select the new model
      this.selectModel(modelId);
      
      this.showSuccess(`Model ${modelId} loaded successfully`);
    } catch (error) {
      console.error(`Failed to load model ${modelId}:`, error);
      this.showError(`Failed to load model: ${error.message || error}`);
    } finally {
      this.hideLoading();
    }
  }
  
  /**
   * Show the inference form for a model
   */
  showInferenceForm(modelId = null) {
    const form = document.getElementById('run-inference-form');
    if (!form) return;
    
    // Set the selected model if provided
    if (modelId) {
      this.selectModel(modelId);
    }
    
    // Update model select in inference form
    const modelSelect = document.getElementById('model-select');
    if (modelSelect && this.state.selectedModel) {
      modelSelect.value = this.state.selectedModel;
    }
    
    // Show the form
    form.style.display = 'block';
  }
  
  /**
   * Hide the inference form
   */
  hideInferenceForm() {
    const form = document.getElementById('run-inference-form');
    if (form) {
      form.style.display = 'none';
    }
  }
  
  /**
   * Run inference based on form inputs
   */
  async runInference() {
    // Get form values
    const modelId = document.getElementById('model-select')?.value;
    const inputText = document.getElementById('input-text')?.value;
    const paramsText = document.getElementById('inference-params')?.value;
    
    if (!modelId || !inputText) {
      this.showError('Please select a model and enter input text');
      return;
    }
    
    // Parse parameters if provided
    let params = {};
    if (paramsText) {
      try {
        params = JSON.parse(paramsText);
      } catch (error) {
        this.showError('Invalid JSON in parameters field');
        return;
      }
    }
    
    try {
      this.showLoading();
      
      // Get inference capability token
      const inferenceToken = await this.auth.getCapabilityToken(`${TRANSFORMER_CAPABILITIES.INFERENCE}:${modelId}`);
      
      // Run inference
      const result = await this.secureTransformersManager.runInference(inputText, {
        authToken: inferenceToken,
        modelId: modelId,
        params: params
      });
      
      // Hide the form
      this.hideInferenceForm();
      
      // Show results
      this.showInferenceResults(result);
      
      // Reload data to update stats
      await this.loadData();
    } catch (error) {
      console.error('Failed to run inference:', error);
      this.showError(`Failed to run inference: ${error.message || error}`);
    } finally {
      this.hideLoading();
    }
  }
  
  /**
   * Show inference results
   */
  showInferenceResults(result) {
    const resultsEl = document.getElementById('inference-results');
    const contentEl = document.getElementById('inference-results-content');
    
    if (!resultsEl || !contentEl) return;
    
    // Format results as pretty JSON
    let formattedResults = JSON.stringify(result, null, 2);
    
    // Display the results
    contentEl.innerHTML = `
      <div class="form-group">
        <label>Model: ${result.modelId || 'Unknown'}</label>
      </div>
      <div class="form-group">
        <label>Input:</label>
        <div class="code-block">${this.escapeHtml(result.input || '')}</div>
      </div>
      <div class="form-group">
        <label>Results:</label>
        <pre class="code-block">${this.escapeHtml(formattedResults)}</pre>
      </div>
    `;
    
    // Show the results container
    resultsEl.style.display = 'block';
  }
  
  /**
   * Hide inference results
   */
  hideInferenceResults() {
    const resultsEl = document.getElementById('inference-results');
    if (resultsEl) {
      resultsEl.style.display = 'none';
    }
  }
  
  /**
   * Select a principal and load its capabilities
   */
  async selectPrincipal(principalId) {
    if (this.state.selectedPrincipal === principalId) {
      return;
    }
    
    this.state.selectedPrincipal = principalId;
    
    // Update UI
    this.updatePrincipalsPanel();
    
    // Load capabilities for this principal
    try {
      this.showLoading();
      this.state.capabilities = await this.loadCapabilities(principalId);
      this.updateCapabilitiesPanel();
    } catch (error) {
      console.error(`Failed to load capabilities for ${principalId}:`, error);
      this.showError(`Failed to load capabilities: ${error.message || error}`);
    } finally {
      this.hideLoading();
    }
  }
  
  /**
   * Select a model
   */
  selectModel(modelId) {
    if (this.state.selectedModel === modelId) {
      return;
    }
    
    this.state.selectedModel = modelId;
    
    // Update UI
    this.updateModelsPanel();
    
    // Optionally pre-select this model in the resource select
    const resourceSelect = document.getElementById('resource-select');
    if (resourceSelect && modelId) {
      resourceSelect.value = modelId;
    }
  }
  
  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    // Refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadData();
    }, 30000);
  }
  
  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
  
  /**
   * Show a success message
   */
  showSuccess(message) {
    const alertEl = document.getElementById('transformers-security-alert');
    if (!alertEl) return;
    
    alertEl.textContent = message;
    alertEl.className = 'dashboard-alert success';
    alertEl.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      alertEl.style.display = 'none';
    }, 5000);
  }
  
  /**
   * Show an error message
   */
  showError(message) {
    const alertEl = document.getElementById('transformers-security-alert');
    if (!alertEl) return;
    
    alertEl.textContent = message;
    alertEl.className = 'dashboard-alert error';
    alertEl.style.display = 'block';
  }
  
  /**
   * Show loading indicators
   */
  showLoading() {
    const loadingEls = document.querySelectorAll('.loading');
    loadingEls.forEach(el => {
      el.style.display = 'block';
    });
  }
  
  /**
   * Hide loading indicators
   */
  hideLoading() {
    const loadingEls = document.querySelectorAll('.loading');
    loadingEls.forEach(el => {
      el.style.display = 'none';
    });
  }
  
  /**
   * Format a date string for display
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch (error) {
      return dateStr;
    }
  }
  
  /**
   * Escape HTML entities in a string
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  /**
   * Clean up the dashboard
   */
  destroy() {
    this.stopAutoRefresh();
    
    // Remove event listeners
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

export { TransformersSecurityDashboard };
export default TransformersSecurityDashboard;