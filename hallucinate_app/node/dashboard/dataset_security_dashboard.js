/**
 * Dataset Security Dashboard Component
 * 
 * Provides visualization and management interface for dataset security
 * Displays capabilities, usage statistics, and provides access control UI
 */

import { secureDatasetManager, DATASET_CAPABILITIES } from '../secure_datasets_manager.js';
import { authManager } from '../auth.js';

class DatasetSecurityDashboard {
  /**
   * Create a new DatasetSecurityDashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.container Container element to render the dashboard
   * @param {Object} options.resources Resource pool containing necessary modules
   */
  constructor(options = {}) {
    this.container = options.container;
    this.resources = options.resources || {};
    
    // Use provided resources or default instances
    this.auth = this.resources.auth || authManager;
    this.secureDatasetManager = this.resources.secureDatasetManager || secureDatasetManager;
    
    // UI state
    this.state = {
      principals: [],
      datasets: {},
      capabilities: {},
      selectedPrincipal: null,
      selectedDataset: null,
      loading: false,
      stats: null,
      error: null
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
      
      if (!this.secureDatasetManager.initialized) {
        await this.secureDatasetManager.init();
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
      console.error('Failed to initialize dataset security dashboard:', error);
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
      <div class="dashboard-module dataset-security-dashboard">
        <h2>Dataset Security Dashboard</h2>
        <div class="dashboard-alert" id="dataset-security-alert" style="display: none;"></div>
        
        <div class="dashboard-panels">
          <!-- Statistics Panel -->
          <div class="dashboard-panel">
            <h3>Access Statistics</h3>
            <div id="dataset-security-stats" class="dashboard-stats">
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
          
          <!-- Datasets Panel -->
          <div class="dashboard-panel">
            <h3>Datasets</h3>
            <div id="datasets-list" class="dashboard-list">
              <div class="loading">Loading datasets...</div>
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
                <option value="${DATASET_CAPABILITIES.LOAD}">Load Dataset</option>
                <option value="${DATASET_CAPABILITIES.IMPORT}">Import Dataset</option>
                <option value="${DATASET_CAPABILITIES.REMOVE}">Remove Dataset</option>
                <option value="${DATASET_CAPABILITIES.LIST}">List Datasets</option>
                <option value="${DATASET_CAPABILITIES.SAMPLE}">Sample Dataset</option>
                <option value="${DATASET_CAPABILITIES.ADMIN}">Admin Access</option>
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
      const adminToken = await this.auth.getCapabilityToken(`${DATASET_CAPABILITIES.ADMIN}:*`);
      
      // Load principals, datasets, and stats in parallel
      const [principals, datasets, stats] = await Promise.all([
        this.loadPrincipals(),
        this.loadDatasets(adminToken),
        this.loadStats(adminToken)
      ]);
      
      // Update state
      this.state.principals = principals;
      this.state.datasets = datasets;
      this.state.stats = stats;
      
      // If a principal is selected, load its capabilities
      if (this.state.selectedPrincipal) {
        this.state.capabilities = await this.loadCapabilities(this.state.selectedPrincipal);
      }
      
      // Update UI with loaded data
      this.updateStatsPanel();
      this.updatePrincipalsPanel();
      this.updateDatasetsPanel();
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
   * Load datasets from the secure dataset manager
   */
  async loadDatasets(adminToken) {
    try {
      const datasets = await this.secureDatasetManager.listDatasets({
        authToken: adminToken
      });
      
      return datasets;
    } catch (error) {
      console.error('Failed to load datasets:', error);
      return {};
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
   * Load statistics from secure dataset manager
   */
  async loadStats(adminToken) {
    try {
      const stats = await this.secureDatasetManager.getStats({
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
    const statsEl = document.getElementById('dataset-security-stats');
    
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
          <div class="stat-value">${stats.datasetsLoaded || 0}</div>
          <div class="stat-label">Datasets Loaded</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.samplesRetrieved || 0}</div>
          <div class="stat-label">Samples Retrieved</div>
        </div>
      </div>
      
      <h4>Top Datasets by Usage</h4>
      <div class="dashboard-table">
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Loads</th>
              <th>Samples</th>
              <th>Last Access</th>
            </tr>
          </thead>
          <tbody>
            ${stats.resourceUsage && stats.resourceUsage.topDatasets ? 
              stats.resourceUsage.topDatasets.map(dataset => `
                <tr>
                  <td>${dataset.datasetId}</td>
                  <td>${dataset.loads}</td>
                  <td>${dataset.samples}</td>
                  <td>${this.formatDate(dataset.lastAccess)}</td>
                </tr>
              `).join('') : 
              '<tr><td colspan="4">No dataset usage data available</td></tr>'
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
   * Update the datasets panel with current data
   */
  updateDatasetsPanel() {
    const datasetsEl = document.getElementById('datasets-list');
    
    if (!datasetsEl) return;
    
    const datasets = this.state.datasets;
    
    if (!datasets || Object.keys(datasets).length === 0) {
      datasetsEl.innerHTML = '<div class="empty-state">No datasets available</div>';
      return;
    }
    
    datasetsEl.innerHTML = `
      <ul class="dashboard-select-list">
        ${Object.entries(datasets).map(([id, dataset]) => `
          <li class="${this.state.selectedDataset === id ? 'selected' : ''}" data-id="${id}">
            <div class="list-item-primary">${id}</div>
            <div class="list-item-secondary">
              ${dataset.lastAccess ? `Last used: ${this.formatDate(dataset.lastAccess)}` : ''}
              ${dataset.loadedBy ? `Loaded by: ${dataset.loadedBy}` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    
    // Add click handlers to dataset list items
    datasetsEl.querySelectorAll('li').forEach(item => {
      item.addEventListener('click', () => {
        const datasetId = item.getAttribute('data-id');
        this.selectDataset(datasetId);
      });
    });
    
    // Also update resource select in capability form
    const resourceSelect = document.getElementById('resource-select');
    
    if (resourceSelect) {
      // Keep the wildcard option
      resourceSelect.innerHTML = '<option value="*">All Resources (*)</option>';
      
      // Add dataset options
      Object.keys(datasets).forEach(datasetId => {
        const option = document.createElement('option');
        option.value = datasetId;
        option.textContent = datasetId;
        resourceSelect.appendChild(option);
      });
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
   * Select a dataset
   */
  selectDataset(datasetId) {
    if (this.state.selectedDataset === datasetId) {
      return;
    }
    
    this.state.selectedDataset = datasetId;
    
    // Update UI
    this.updateDatasetsPanel();
    
    // Optionally pre-select this dataset in the resource select
    const resourceSelect = document.getElementById('resource-select');
    if (resourceSelect && datasetId) {
      resourceSelect.value = datasetId;
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
    const alertEl = document.getElementById('dataset-security-alert');
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
    const alertEl = document.getElementById('dataset-security-alert');
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

export { DatasetSecurityDashboard };
export default DatasetSecurityDashboard;