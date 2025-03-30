/**
 * Authentication and Security Dashboard Component
 * 
 * Provides visualization and management of auth and keystore modules
 * Displays active principals, capabilities, and API keys
 * Implements secure access control for sensitive information
 */

import { authManager } from '../auth.js';
import { keystore } from '../keystore.js';
import { authKeystoreIntegration } from '../auth_keystore_integration.js';
import NotificationSystem from './notifications.js';

class AuthDashboard {
  /**
   * Create a new AuthDashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.element Container element for the dashboard
   * @param {Object} options.eventBus Event bus for communication
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.eventBus = options.eventBus;
    
    this.auth = options.auth || authManager;
    this.keystore = options.keystore || keystore;
    this.integration = options.integration || authKeystoreIntegration;
    
    this.initialized = false;
    this.adminToken = null;
    
    // Initialize notification system after the dashboard is rendered
    this.notifications = null;
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
      
      if (!this.keystore.initialized) {
        await this.keystore.init();
      }
      
      if (!this.integration.initialized) {
        await this.integration.init();
      }
      
      // Get admin token
      this.adminToken = await this.auth.getCapabilityToken('admin:*');
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize auth dashboard:', error);
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
      console.error('No container element provided for auth dashboard');
      return;
    }
    
    // Create main container
    this.element.innerHTML = `
      <div class="auth-dashboard">
        <div class="dashboard-header">
          <h2><i class="fas fa-shield-alt"></i> Authentication & Security</h2>
          <div class="status-indicator" id="auth-status">
            <span class="status-dot"></span>
            <span class="status-text">Initializing...</span>
          </div>
        </div>
        
        <div class="dashboard-tabs">
          <button class="tab-button active" data-tab="auth-summary">Summary</button>
          <button class="tab-button" data-tab="principals">Principals</button>
          <button class="tab-button" data-tab="capabilities">Capabilities</button>
          <button class="tab-button" data-tab="api-keys">API Keys</button>
        </div>
        
        <div class="dashboard-content">
          <!-- Summary Tab -->
          <div class="tab-content active" id="auth-summary-content">
            <div class="card-grid">
              <div class="mini-card">
                <div class="mini-card-value" id="principals-count">0</div>
                <div class="mini-card-label">Principals</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="capabilities-count">0</div>
                <div class="mini-card-label">Capabilities</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="apikeys-count">0</div>
                <div class="mini-card-label">API Keys</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="delegations-count">0</div>
                <div class="mini-card-label">Delegations</div>
              </div>
            </div>
            
            <div class="dashboard-card">
              <div class="card-header">
                <h3>System Status</h3>
              </div>
              <div class="card-body">
                <div class="status-grid">
                  <div class="status-item">
                    <span class="status-label">Auth Manager:</span>
                    <span class="status-value" id="auth-manager-status">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Keystore:</span>
                    <span class="status-value" id="keystore-status">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Integration:</span>
                    <span class="status-value" id="integration-status">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">UCAN Libraries:</span>
                    <span class="status-value" id="ucan-libraries-status">-</span>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn btn-primary" id="btn-run-auth-test">
                    <i class="fas fa-vial"></i> Run Tests
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Principals Tab -->
          <div class="tab-content" id="principals-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Principals</h3>
                <div class="card-actions">
                  <button class="btn btn-sm" id="btn-add-principal">
                    <i class="fas fa-plus"></i> Add Principal
                  </button>
                </div>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="principals-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>DID</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="4" class="text-center">Loading principals...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Capabilities Tab -->
          <div class="tab-content" id="capabilities-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Capabilities</h3>
                <div class="card-actions">
                  <button class="btn btn-sm" id="btn-issue-capability">
                    <i class="fas fa-key"></i> Issue Capability
                  </button>
                </div>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="capabilities-table">
                    <thead>
                      <tr>
                        <th>Issuer</th>
                        <th>Audience</th>
                        <th>Capability</th>
                        <th>Resource</th>
                        <th>Expires</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="6" class="text-center">Loading capabilities...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          <!-- API Keys Tab -->
          <div class="tab-content" id="api-keys-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>API Keys</h3>
                <div class="card-actions">
                  <button class="btn btn-sm" id="btn-add-api-key">
                    <i class="fas fa-plus"></i> Add API Key
                  </button>
                </div>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="api-keys-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Created</th>
                        <th>Last Used</th>
                        <th>Expires</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="6" class="text-center">Loading API keys...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Initialize notification system
    this.notifications = new NotificationSystem({
      container: this.element,
      position: 'top-right'
    });
    
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
    const runTestBtn = this.element.querySelector('#btn-run-auth-test');
    if (runTestBtn) {
      runTestBtn.addEventListener('click', () => this.runTests());
    }
    
    // Add principal button
    const addPrincipalBtn = this.element.querySelector('#btn-add-principal');
    if (addPrincipalBtn) {
      addPrincipalBtn.addEventListener('click', () => this.showAddPrincipalDialog());
    }
    
    // Issue capability button
    const issueCapabilityBtn = this.element.querySelector('#btn-issue-capability');
    if (issueCapabilityBtn) {
      issueCapabilityBtn.addEventListener('click', () => this.showIssueCapabilityDialog());
    }
    
    // Add API key button
    const addApiKeyBtn = this.element.querySelector('#btn-add-api-key');
    if (addApiKeyBtn) {
      addApiKeyBtn.addEventListener('click', () => this.showAddApiKeyDialog());
    }
  }
  
  /**
   * Load data for the dashboard
   */
  async loadData() {
    try {
      // Update status indicators
      this.updateStatus();
      
      // Load data for each tab
      await Promise.all([
        this.loadPrincipals(),
        this.loadCapabilities(),
        this.loadApiKeys()
      ]);
      
      // Update summary counts
      this.updateSummaryCounts();
    } catch (error) {
      console.error('Failed to load auth dashboard data:', error);
      this.showError('Failed to load data. Check console for details.');
    }
  }
  
  /**
   * Update dashboard status indicators
   */
  async updateStatus() {
    // Overall status
    const statusEl = this.element.querySelector('#auth-status');
    statusEl.innerHTML = `
      <span class="status-dot online"></span>
      <span class="status-text">Active</span>
    `;
    
    // Component status
    this.element.querySelector('#auth-manager-status').innerHTML = this.auth.initialized ? 
      '<span class="status-badge online">Online</span>' : 
      '<span class="status-badge offline">Offline</span>';
    
    this.element.querySelector('#keystore-status').innerHTML = this.keystore.initialized ? 
      '<span class="status-badge online">Online</span>' : 
      '<span class="status-badge offline">Offline</span>';
    
    this.element.querySelector('#integration-status').innerHTML = this.integration.initialized ? 
      '<span class="status-badge online">Online</span>' : 
      '<span class="status-badge offline">Offline</span>';
    
    // UCAN libraries status
    const hasUcanLibs = !this.auth.options.useMockImplementation;
    this.element.querySelector('#ucan-libraries-status').innerHTML = hasUcanLibs ? 
      '<span class="status-badge online">Available</span>' : 
      '<span class="status-badge warning">Using Mock</span>';
  }
  
  /**
   * Load principals data
   */
  async loadPrincipals() {
    const tableBody = this.element.querySelector('#principals-table tbody');
    
    // Get principals
    const principals = this.auth.principals;
    
    if (Object.keys(principals).length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No principals found</td></tr>';
      return;
    }
    
    // Build table rows
    let html = '';
    for (const [id, principal] of Object.entries(principals)) {
      html += `
        <tr>
          <td>${id}</td>
          <td><code class="did">${principal.did}</code></td>
          <td>${new Date().toLocaleDateString()}</td>
          <td>
            <button class="btn btn-sm btn-outline" data-principal-id="${id}" data-action="view">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline" data-principal-id="${id}" data-action="delete">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }
    
    tableBody.innerHTML = html;
    
    // Add event listeners to action buttons
    tableBody.querySelectorAll('[data-action="view"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const principalId = e.target.getAttribute('data-principal-id');
        this.viewPrincipalDetails(principalId);
      });
    });
    
    tableBody.querySelectorAll('[data-action="delete"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const principalId = e.target.getAttribute('data-principal-id');
        this.confirmDeletePrincipal(principalId);
      });
    });
  }
  
  /**
   * Load capabilities data
   */
  async loadCapabilities() {
    const tableBody = this.element.querySelector('#capabilities-table tbody');
    
    // Get tokens
    const tokens = this.auth.tokens;
    
    if (Object.keys(tokens).length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No capabilities found</td></tr>';
      return;
    }
    
    // Build table rows
    let html = '';
    for (const [id, token] of Object.entries(tokens)) {
      // Check if token is expired
      const isExpired = new Date(token.expiration) <= new Date();
      const expiryClass = isExpired ? 'text-error' : '';
      
      html += `
        <tr>
          <td>${token.issuer}</td>
          <td>${token.audience}</td>
          <td>${token.capability.can}</td>
          <td>${token.capability.with}</td>
          <td class="${expiryClass}">${new Date(token.expiration).toLocaleString()}</td>
          <td>
            <button class="btn btn-sm btn-outline" data-token-id="${id}" data-action="view-token">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline" data-token-id="${id}" data-action="revoke">
              <i class="fas fa-ban"></i>
            </button>
          </td>
        </tr>
      `;
    }
    
    tableBody.innerHTML = html;
    
    // Add event listeners to action buttons
    tableBody.querySelectorAll('[data-action="view-token"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const tokenId = e.target.getAttribute('data-token-id');
        this.viewTokenDetails(tokenId);
      });
    });
    
    tableBody.querySelectorAll('[data-action="revoke"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const tokenId = e.target.getAttribute('data-token-id');
        this.confirmRevokeToken(tokenId);
      });
    });
  }
  
  /**
   * Load API keys data
   */
  async loadApiKeys() {
    const tableBody = this.element.querySelector('#api-keys-table tbody');
    
    try {
      // Get API key listing capabilities
      const listToken = await this.auth.getCapabilityToken(`${this.integration.CAPABILITIES.KEY_LIST}:*`);
      
      // Get list of providers
      const providers = await this.integration.listAuthorizedProviders(listToken);
      
      if (!providers || providers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No API keys found</td></tr>';
        return;
      }
      
      // Build table rows
      let html = '';
      for (const provider of providers) {
        // Get key info
        const keyInfo = await this.integration.getAuthorizedKeyInfo(provider, listToken);
        
        if (!keyInfo) continue;
        
        // Determine status
        let status = 'Active';
        let statusClass = 'status-badge online';
        
        if (keyInfo.is_expired) {
          status = 'Expired';
          statusClass = 'status-badge offline';
        }
        
        html += `
          <tr>
            <td>${provider}</td>
            <td>${keyInfo.created_at ? new Date(keyInfo.created_at).toLocaleString() : 'N/A'}</td>
            <td>${keyInfo.last_used ? new Date(keyInfo.last_used).toLocaleString() : 'Never'}</td>
            <td>${keyInfo.expires_at ? new Date(keyInfo.expires_at).toLocaleString() : 'Never'}</td>
            <td><span class="${statusClass}">${status}</span></td>
            <td>
              <button class="btn btn-sm btn-outline" data-provider="${provider}" data-action="view-key">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline" data-provider="${provider}" data-action="rotate-key">
                <i class="fas fa-sync"></i>
              </button>
              <button class="btn btn-sm btn-outline" data-provider="${provider}" data-action="delete-key">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }
      
      tableBody.innerHTML = html;
      
      // Add event listeners to action buttons
      tableBody.querySelectorAll('[data-action="view-key"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const provider = e.target.getAttribute('data-provider');
          this.viewKeyDetails(provider);
        });
      });
      
      tableBody.querySelectorAll('[data-action="rotate-key"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const provider = e.target.getAttribute('data-provider');
          this.showRotateKeyDialog(provider);
        });
      });
      
      tableBody.querySelectorAll('[data-action="delete-key"]').forEach(button => {
        button.addEventListener('click', (e) => {
          const provider = e.target.getAttribute('data-provider');
          this.confirmDeleteKey(provider);
        });
      });
    } catch (error) {
      console.error('Failed to load API keys:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-error">
            Failed to load API keys: ${error.message}
          </td>
        </tr>
      `;
    }
  }
  
  /**
   * Update summary counts
   */
  updateSummaryCounts() {
    // Principals count
    const principalsCount = Object.keys(this.auth.principals).length;
    this.element.querySelector('#principals-count').textContent = principalsCount;
    
    // Capabilities count
    const capabilitiesCount = Object.keys(this.auth.tokens).length;
    this.element.querySelector('#capabilities-count').textContent = capabilitiesCount;
    
    // Delegations count
    let delegationsCount = 0;
    for (const issuer of Object.values(this.auth.delegations)) {
      for (const audience of Object.values(issuer)) {
        delegationsCount += audience.length;
      }
    }
    this.element.querySelector('#delegations-count').textContent = delegationsCount;
    
    // API keys count (async - we already have loaded this data)
    const apiKeysTable = this.element.querySelector('#api-keys-table tbody');
    const apiKeysCount = apiKeysTable.querySelectorAll('tr:not([colspan])').length;
    this.element.querySelector('#apikeys-count').textContent = apiKeysCount;
  }
  
  /**
   * Run tests for auth components
   */
  async runTests() {
    try {
      // Disable test button
      const testBtn = this.element.querySelector('#btn-run-auth-test');
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
      
      // Show testing status
      this.showMessage('info', 'Running auth component tests...');
      
      // Run tests
      const results = {
        auth: await this.auth.test(),
        keystore: await this.keystore.test(),
        integration: await this.integration.test()
      };
      
      // Show results
      const allSuccess = Object.values(results).every(r => r.success);
      
      if (allSuccess) {
        this.showMessage('success', 'All auth component tests passed successfully!');
      } else {
        // Find failing component
        const failingComponents = Object.entries(results)
          .filter(([_, result]) => !result.success)
          .map(([component]) => component)
          .join(', ');
        
        this.showMessage('error', `Tests failed for components: ${failingComponents}`);
      }
      
      // Show detailed results dialog
      this.showTestResultsDialog(results);
      
      // Re-enable test button
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fas fa-vial"></i> Run Tests';
    } catch (error) {
      console.error('Failed to run auth tests:', error);
      this.showError(`Failed to run tests: ${error.message}`);
      
      // Re-enable test button
      const testBtn = this.element.querySelector('#btn-run-auth-test');
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fas fa-vial"></i> Run Tests';
    }
  }
  
  /**
   * Show test results dialog
   * @param {Object} results Test results
   */
  showTestResultsDialog(results) {
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    // Format results
    let authResults = '';
    if (results.auth.success) {
      authResults = `
        <div class="test-results success">
          <h4><i class="fas fa-check-circle"></i> Auth Manager Tests Passed</h4>
          <ul>
            <li>Initialization: ${results.auth.initialization ? 'Pass' : 'Fail'}</li>
            <li>Principal Creation: ${results.auth.principal_creation ? 'Pass' : 'Fail'}</li>
            <li>Capability Issuance: ${results.auth.capability_issuance ? 'Pass' : 'Fail'}</li>
            <li>Capability Verification: ${results.auth.capability_verification ? 'Pass' : 'Fail'}</li>
            <li>Capability Revocation: ${results.auth.capability_revocation ? 'Pass' : 'Fail'}</li>
          </ul>
        </div>
      `;
    } else {
      authResults = `
        <div class="test-results failure">
          <h4><i class="fas fa-times-circle"></i> Auth Manager Tests Failed</h4>
          <p>Error: ${results.auth.error || 'Unknown error'}</p>
        </div>
      `;
    }
    
    let keystoreResults = '';
    if (results.keystore.success) {
      keystoreResults = `
        <div class="test-results success">
          <h4><i class="fas fa-check-circle"></i> Keystore Tests Passed</h4>
          <ul>
            <li>Initialization: ${results.keystore.initialization ? 'Pass' : 'Fail'}</li>
            <li>Key Operations: ${Object.values(results.keystore.key_operations).every(Boolean) ? 'Pass' : 'Fail'}</li>
            <li>Persistence: ${results.keystore.persistence ? 'Pass' : 'Fail'}</li>
          </ul>
        </div>
      `;
    } else {
      keystoreResults = `
        <div class="test-results failure">
          <h4><i class="fas fa-times-circle"></i> Keystore Tests Failed</h4>
          <p>Error: ${results.keystore.error || 'Unknown error'}</p>
        </div>
      `;
    }
    
    let integrationResults = '';
    if (results.integration.success) {
      integrationResults = `
        <div class="test-results success">
          <h4><i class="fas fa-check-circle"></i> Integration Tests Passed</h4>
          <ul>
            <li>Initialization: ${results.integration.initialization ? 'Pass' : 'Fail'}</li>
            <li>Capabilities: ${results.integration.capabilities ? 'Pass' : 'Fail'}</li>
            <li>Authorized Operations: ${Object.values(results.integration.authorized_operations).every(Boolean) ? 'Pass' : 'Fail'}</li>
          </ul>
        </div>
      `;
    } else {
      integrationResults = `
        <div class="test-results failure">
          <h4><i class="fas fa-times-circle"></i> Integration Tests Failed</h4>
          <p>Error: ${results.integration.error || 'Unknown error'}</p>
        </div>
      `;
    }
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Auth Component Test Results</h3>
          <button class="dialog-close" id="close-test-dialog">&times;</button>
        </div>
        <div class="dialog-body">
          ${authResults}
          ${keystoreResults}
          ${integrationResults}
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
   * Show add principal dialog
   */
  showAddPrincipalDialog() {
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Add Principal</h3>
          <button class="dialog-close" id="close-principal-dialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label for="principal-id">Principal ID:</label>
            <input type="text" id="principal-id" placeholder="Enter principal ID">
            <div class="form-hint">A unique identifier for this principal</div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="btn-cancel-principal">Cancel</button>
          <button class="btn btn-primary" id="btn-create-principal">Create Principal</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-principal-dialog').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-cancel-principal').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-create-principal').addEventListener('click', async () => {
      try {
        const principalId = document.getElementById('principal-id').value.trim();
        
        if (!principalId) {
          this.showError('Principal ID is required');
          return;
        }
        
        // Create principal
        await this.auth.createPrincipal(principalId);
        
        // Remove dialog
        document.body.removeChild(dialog);
        
        // Show success message
        this.showMessage('success', `Principal ${principalId} created successfully`);
        
        // Reload data
        await this.loadPrincipals();
        this.updateSummaryCounts();
      } catch (error) {
        console.error('Failed to create principal:', error);
        this.showError(`Failed to create principal: ${error.message}`);
      }
    });
  }
  
  /**
   * Show issue capability dialog
   */
  showIssueCapabilityDialog() {
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    // Get principals for dropdown
    const principalOptions = Object.keys(this.auth.principals)
      .map(id => `<option value="${id}">${id}</option>`)
      .join('');
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Issue Capability</h3>
          <button class="dialog-close" id="close-capability-dialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label for="issuer-id">Issuer:</label>
            <select id="issuer-id">
              ${principalOptions}
            </select>
          </div>
          
          <div class="form-group">
            <label for="audience-id">Audience:</label>
            <select id="audience-id">
              ${principalOptions}
            </select>
          </div>
          
          <div class="form-group">
            <label for="capability-can">Capability:</label>
            <select id="capability-can">
              <option value="model:load">model:load</option>
              <option value="model:inference">model:inference</option>
              <option value="dataset:read">dataset:read</option>
              <option value="dataset:write">dataset:write</option>
              <option value="${this.integration.CAPABILITIES.KEY_ACCESS}">${this.integration.CAPABILITIES.KEY_ACCESS}</option>
              <option value="${this.integration.CAPABILITIES.KEY_LIST}">${this.integration.CAPABILITIES.KEY_LIST}</option>
              <option value="admin:all">admin:all</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
          
          <div class="form-group" id="custom-capability-group" style="display: none;">
            <label for="custom-capability">Custom Capability:</label>
            <input type="text" id="custom-capability" placeholder="Enter custom capability">
          </div>
          
          <div class="form-group">
            <label for="resource">Resource:</label>
            <input type="text" id="resource" placeholder="Resource identifier or *">
          </div>
          
          <div class="form-group">
            <label for="expiration-days">Expiration (days):</label>
            <input type="number" id="expiration-days" value="30" min="1" max="365">
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="btn-cancel-capability">Cancel</button>
          <button class="btn btn-primary" id="btn-issue-capability">Issue Capability</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-capability-dialog').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-cancel-capability').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    // Show/hide custom capability input
    document.getElementById('capability-can').addEventListener('change', (e) => {
      const customGroup = document.getElementById('custom-capability-group');
      customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
    
    document.getElementById('btn-issue-capability').addEventListener('click', async () => {
      try {
        const issuerId = document.getElementById('issuer-id').value;
        const audienceId = document.getElementById('audience-id').value;
        const capabilityCan = document.getElementById('capability-can').value;
        const customCapability = document.getElementById('custom-capability').value;
        const resource = document.getElementById('resource').value || '*';
        const expirationDays = parseInt(document.getElementById('expiration-days').value, 10);
        
        // Validate
        if (issuerId === audienceId) {
          this.showError('Issuer and audience cannot be the same');
          return;
        }
        
        const capability = {
          can: capabilityCan === 'custom' ? customCapability : capabilityCan,
          with: resource
        };
        
        // Calculate expiration
        const expiration = new Date();
        expiration.setDate(expiration.getDate() + expirationDays);
        
        // Issue capability
        await this.auth.issueCapability(issuerId, audienceId, capability, {
          expiration
        });
        
        // Remove dialog
        document.body.removeChild(dialog);
        
        // Show success message
        this.showMessage('success', `Capability ${capability.can}:${capability.with} issued to ${audienceId}`);
        
        // Reload data
        await this.loadCapabilities();
        this.updateSummaryCounts();
      } catch (error) {
        console.error('Failed to issue capability:', error);
        this.showError(`Failed to issue capability: ${error.message}`);
      }
    });
  }
  
  /**
   * Show add API key dialog
   */
  async showAddApiKeyDialog() {
    try {
      // Get management token
      const manageToken = await this.auth.getCapabilityToken(`${this.integration.CAPABILITIES.KEY_MANAGE}:*`);
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'dialog-overlay';
      
      dialog.innerHTML = `
        <div class="dialog">
          <div class="dialog-header">
            <h3>Add API Key</h3>
            <button class="dialog-close" id="close-key-dialog">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="form-group">
              <label for="key-provider">Provider:</label>
              <input type="text" id="key-provider" placeholder="e.g., openai, huggingface">
              <div class="form-hint">Service provider for this API key</div>
            </div>
            
            <div class="form-group">
              <label for="key-name">Name:</label>
              <input type="text" id="key-name" placeholder="e.g., Production, Development">
              <div class="form-hint">Optional descriptive name for this key</div>
            </div>
            
            <div class="form-group">
              <label for="key-value">API Key:</label>
              <input type="password" id="key-value" placeholder="Enter API key">
              <div class="form-hint">The actual API key (will be stored securely)</div>
            </div>
            
            <div class="form-group">
              <label for="key-expiration">Expires (optional):</label>
              <input type="date" id="key-expiration">
              <div class="form-hint">Leave blank for no expiration</div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-outline" id="btn-cancel-key">Cancel</button>
            <button class="btn btn-primary" id="btn-save-key">Save API Key</button>
          </div>
        </div>
      `;
      
      // Add to page
      document.body.appendChild(dialog);
      
      // Add event listeners
      document.getElementById('close-key-dialog').addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      document.getElementById('btn-cancel-key').addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      document.getElementById('btn-save-key').addEventListener('click', async () => {
        try {
          const provider = document.getElementById('key-provider').value.trim();
          const name = document.getElementById('key-name').value.trim();
          const key = document.getElementById('key-value').value;
          const expirationStr = document.getElementById('key-expiration').value;
          
          if (!provider) {
            this.showError('Provider is required');
            return;
          }
          
          if (!key) {
            this.showError('API key is required');
            return;
          }
          
          // Set API key options
          const options = {
            name: name || 'default'
          };
          
          if (expirationStr) {
            options.expires_at = new Date(expirationStr).toISOString();
          }
          
          // Store API key
          const result = await this.integration.setAuthorizedKey(provider, key, manageToken, options);
          
          if (result) {
            // Remove dialog
            document.body.removeChild(dialog);
            
            // Show success message
            this.showMessage('success', `API key for ${provider} saved successfully`);
            
            // Reload data
            await this.loadApiKeys();
            this.updateSummaryCounts();
          } else {
            this.showError('Failed to save API key');
          }
        } catch (error) {
          console.error('Failed to save API key:', error);
          this.showError(`Failed to save API key: ${error.message}`);
        }
      });
    } catch (error) {
      console.error('Failed to get management token:', error);
      this.showError(`Failed to get management token: ${error.message}`);
    }
  }
  
  /**
   * Show error message
   * @param {string} message Error message
   */
  showError(message) {
    console.error(message);
    if (this.notifications) {
      this.notifications.error(message);
    } else {
      alert(`Error: ${message}`);
    }
  }
  
  /**
   * Show message
   * @param {string} type Message type (success, error, info, warning)
   * @param {string} message Message text
   */
  showMessage(type, message) {
    console.log(`[${type}] ${message}`);
    if (this.notifications) {
      this.notifications[type](message);
    } else {
      alert(message);
    }
  }
  
  /**
   * View principal details
   * @param {string} principalId Principal ID
   */
  viewPrincipalDetails(principalId) {
    // Get principal
    const principal = this.auth.principals[principalId];
    
    if (!principal) {
      this.showError(`Principal ${principalId} not found`);
      return;
    }
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Principal Details</h3>
          <button class="dialog-close" id="close-principal-details">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="detail-group">
            <div class="detail-label">ID:</div>
            <div class="detail-value">${principalId}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">DID:</div>
            <div class="detail-value"><code>${principal.did}</code></div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-primary" id="btn-close-principal-details">Close</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-principal-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-close-principal-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
  }
  
  /**
   * Confirm deleting a principal
   * @param {string} principalId Principal ID
   */
  confirmDeletePrincipal(principalId) {
    if (principalId === 'root') {
      this.showError('Cannot delete root principal');
      return;
    }
    
    if (confirm(`Are you sure you want to delete principal ${principalId}? This action cannot be undone.`)) {
      // Show deletion not implemented message
      this.showMessage('info', 'Principal deletion is not implemented yet');
      
      // TODO: Implement principal deletion
    }
  }
  
  /**
   * View token details
   * @param {string} tokenId Token ID
   */
  viewTokenDetails(tokenId) {
    // Get token
    const token = this.auth.tokens[tokenId];
    
    if (!token) {
      this.showError(`Token ${tokenId} not found`);
      return;
    }
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    // Determine if token is expired
    const isExpired = new Date(token.expiration) <= new Date();
    const expiryClass = isExpired ? 'text-error' : '';
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Capability Token Details</h3>
          <button class="dialog-close" id="close-token-details">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="detail-group">
            <div class="detail-label">Token ID:</div>
            <div class="detail-value">${tokenId}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Issuer:</div>
            <div class="detail-value">${token.issuer}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Audience:</div>
            <div class="detail-value">${token.audience}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Capability:</div>
            <div class="detail-value">${token.capability.can}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Resource:</div>
            <div class="detail-value">${token.capability.with}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Expiration:</div>
            <div class="detail-value ${expiryClass}">${new Date(token.expiration).toLocaleString()}</div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Status:</div>
            <div class="detail-value">
              <span class="status-badge ${isExpired ? 'offline' : 'online'}">
                ${isExpired ? 'Expired' : 'Active'}
              </span>
            </div>
          </div>
          
          <div class="detail-group">
            <div class="detail-label">Token Value:</div>
            <div class="detail-value">
              <pre class="token-display">${token.token}</pre>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="btn-revoke-token-details">Revoke</button>
          <button class="btn btn-primary" id="btn-close-token-details">Close</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-token-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-close-token-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-revoke-token-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
      this.confirmRevokeToken(tokenId);
    });
  }
  
  /**
   * Confirm revoking a token
   * @param {string} tokenId Token ID
   */
  async confirmRevokeToken(tokenId) {
    if (confirm(`Are you sure you want to revoke this capability token? This action cannot be undone.`)) {
      try {
        // Revoke token
        const result = await this.auth.revokeCapability(tokenId);
        
        if (result) {
          this.showMessage('success', 'Capability token revoked successfully');
          
          // Reload data
          await this.loadCapabilities();
          this.updateSummaryCounts();
        } else {
          this.showError('Failed to revoke capability token');
        }
      } catch (error) {
        console.error('Failed to revoke capability token:', error);
        this.showError(`Failed to revoke token: ${error.message}`);
      }
    }
  }
  
  /**
   * View API key details
   * @param {string} provider Provider name
   */
  async viewKeyDetails(provider) {
    try {
      // Get list token
      const listToken = await this.auth.getCapabilityToken(`${this.integration.CAPABILITIES.KEY_LIST}:${provider}`);
      
      // Get key info
      const keyInfo = await this.integration.getAuthorizedKeyInfo(provider, listToken);
      
      if (!keyInfo) {
        this.showError(`API key for ${provider} not found`);
        return;
      }
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'dialog-overlay';
      
      // Determine if key is expired
      const isExpired = keyInfo.is_expired;
      const expiryClass = isExpired ? 'text-error' : '';
      
      dialog.innerHTML = `
        <div class="dialog">
          <div class="dialog-header">
            <h3>API Key Details</h3>
            <button class="dialog-close" id="close-key-details">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="detail-group">
              <div class="detail-label">Provider:</div>
              <div class="detail-value">${provider}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Name:</div>
              <div class="detail-value">${keyInfo.name || 'default'}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Created:</div>
              <div class="detail-value">${keyInfo.created_at ? new Date(keyInfo.created_at).toLocaleString() : 'N/A'}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Last Used:</div>
              <div class="detail-value">${keyInfo.last_used ? new Date(keyInfo.last_used).toLocaleString() : 'Never'}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Use Count:</div>
              <div class="detail-value">${keyInfo.use_count || 0}</div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Expires:</div>
              <div class="detail-value ${expiryClass}">
                ${keyInfo.expires_at ? new Date(keyInfo.expires_at).toLocaleString() : 'Never'}
              </div>
            </div>
            
            <div class="detail-group">
              <div class="detail-label">Status:</div>
              <div class="detail-value">
                <span class="status-badge ${isExpired ? 'offline' : 'online'}">
                  ${isExpired ? 'Expired' : 'Active'}
                </span>
              </div>
            </div>
            
            ${keyInfo.rotated_from ? `
              <div class="detail-group">
                <div class="detail-label">Rotated From:</div>
                <div class="detail-value">
                  Key created at ${new Date(keyInfo.rotated_from.created_at).toLocaleString()},
                  rotated at ${new Date(keyInfo.rotated_from.rotated_at).toLocaleString()}
                </div>
              </div>
            ` : ''}
          </div>
          <div class="dialog-footer">
            <button class="btn btn-outline" id="btn-rotate-key-details">Rotate</button>
            <button class="btn btn-outline btn-danger" id="btn-delete-key-details">Delete</button>
            <button class="btn btn-primary" id="btn-close-key-details">Close</button>
          </div>
        </div>
      `;
      
      // Add to page
      document.body.appendChild(dialog);
      
      // Add event listeners
      document.getElementById('close-key-details').addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      document.getElementById('btn-close-key-details').addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      document.getElementById('btn-rotate-key-details').addEventListener('click', () => {
        document.body.removeChild(dialog);
        this.showRotateKeyDialog(provider);
      });
      
      document.getElementById('btn-delete-key-details').addEventListener('click', () => {
        document.body.removeChild(dialog);
        this.confirmDeleteKey(provider);
      });
    } catch (error) {
      console.error('Failed to view API key details:', error);
      this.showError(`Failed to view API key details: ${error.message}`);
    }
  }
  
  /**
   * Show rotate API key dialog
   * @param {string} provider Provider name
   */
  async showRotateKeyDialog(provider) {
    try {
      // Get rotation token
      const rotateToken = await this.auth.getCapabilityToken(`${this.integration.CAPABILITIES.KEY_ROTATE}:${provider}`);
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'dialog-overlay';
      
      dialog.innerHTML = `
        <div class="dialog">
          <div class="dialog-header">
            <h3>Rotate API Key for ${provider}</h3>
            <button class="dialog-close" id="close-rotate-dialog">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="alert alert-warning">
              <i class="fas fa-exclamation-triangle"></i>
              Rotating this API key will invalidate the existing key. Make sure you have updated
              your application to use the new key before completing this action.
            </div>
            
            <div class="form-group">
              <label for="new-key-value">New API Key:</label>
              <input type="password" id="new-key-value" placeholder="Enter new API key">
            </div>
            
            <div class="form-group">
              <label for="new-key-expiration">New Expiration (optional):</label>
              <input type="date" id="new-key-expiration">
              <div class="form-hint">Leave blank to keep current expiration</div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-outline" id="btn-cancel-rotate">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-rotate">Rotate Key</button>
          </div>
        </div>
      `;
      
      // Add to page
      document.body.appendChild(dialog);
      
      // Add event listeners
      document.getElementById('close-rotate-dialog').addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      document.getElementById('btn-cancel-rotate').addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
      
      document.getElementById('btn-confirm-rotate').addEventListener('click', async () => {
        try {
          const newKey = document.getElementById('new-key-value').value;
          const expirationStr = document.getElementById('new-key-expiration').value;
          
          if (!newKey) {
            this.showError('New API key is required');
            return;
          }
          
          // Set API key options
          const options = {};
          
          if (expirationStr) {
            options.expires_at = new Date(expirationStr).toISOString();
          }
          
          // Rotate API key
          const result = await this.integration.rotateAuthorizedKey(provider, newKey, rotateToken, options);
          
          if (result) {
            // Remove dialog
            document.body.removeChild(dialog);
            
            // Show success message
            this.showMessage('success', `API key for ${provider} rotated successfully`);
            
            // Reload data
            await this.loadApiKeys();
          } else {
            this.showError('Failed to rotate API key');
          }
        } catch (error) {
          console.error('Failed to rotate API key:', error);
          this.showError(`Failed to rotate API key: ${error.message}`);
        }
      });
    } catch (error) {
      console.error('Failed to get rotation token:', error);
      this.showError(`Failed to get rotation token: ${error.message}`);
    }
  }
  
  /**
   * Confirm deleting an API key
   * @param {string} provider Provider name
   */
  async confirmDeleteKey(provider) {
    if (confirm(`Are you sure you want to delete the API key for ${provider}? This action cannot be undone.`)) {
      try {
        // Get management token
        const manageToken = await this.auth.getCapabilityToken(`${this.integration.CAPABILITIES.KEY_MANAGE}:${provider}`);
        
        // Delete API key
        const result = await this.integration.deleteAuthorizedKey(provider, manageToken);
        
        if (result) {
          this.showMessage('success', `API key for ${provider} deleted successfully`);
          
          // Reload data
          await this.loadApiKeys();
          this.updateSummaryCounts();
        } else {
          this.showError('Failed to delete API key');
        }
      } catch (error) {
        console.error('Failed to delete API key:', error);
        this.showError(`Failed to delete API key: ${error.message}`);
      }
    }
  }
}

export default AuthDashboard;