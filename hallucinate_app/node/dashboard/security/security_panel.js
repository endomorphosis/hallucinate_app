/**
 * Security Panel Component for PyArrow Content Index Dashboard
 * Provides UI for managing UCAN-based security capabilities
 */

class SecurityPanel {
  /**
   * Create a new Security Panel
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} options.ucanManager - UCAN manager for capability management
   * @param {Object} options.eventBus - Event bus for communication
   */
  constructor(options = {}) {
    this.container = options.container;
    this.ucanManager = options.ucanManager;
    this.eventBus = options.eventBus || { on: () => {}, emit: () => {} };
    
    // Component state
    this.initialized = false;
    this.activeTab = 'principals';
    this.principals = [];
    this.capabilities = [];
    this.selectedPrincipal = null;
    this.selectedCapability = null;
    this.principalFilter = null;
    this.contentFilter = null; // content object to filter capabilities by CID or path
    
    // Bind methods to maintain this context
    this._handleTabChange = this._handleTabChange.bind(this);
    this._handleAddPrincipal = this._handleAddPrincipal.bind(this);
    this._handleImportPrincipal = this._handleImportPrincipal.bind(this);
    this._handlePrincipalSelect = this._handlePrincipalSelect.bind(this);
    this._handleCreateCapability = this._handleCreateCapability.bind(this);
    this._handleRevokeCapability = this._handleRevokeCapability.bind(this);
    this._handleCapabilitySelect = this._handleCapabilitySelect.bind(this);
    this._handleDialogClose = this._handleDialogClose.bind(this);
    this._handleFormSubmit = this._handleFormSubmit.bind(this);
    this._handleSearch = this._handleSearch.bind(this);
    this._handleResourceTypeChange = this._handleResourceTypeChange.bind(this);
    this._handleConfirmRevoke = this._handleConfirmRevoke.bind(this);
    this._handleCopyToken = this._handleCopyToken.bind(this);
  }
  
  /**
   * Initialize the security panel
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Create DOM structure
      this._setupDom();
      
      // Add event listeners
      this._setupEventListeners();
      
      // Load initial data
      await this._loadData();
      
      this.initialized = true;
      
      // Emit initialization event
      this.eventBus.emit('security-panel-initialized', { success: true });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize security panel:', error);
      
      // Emit error event
      this.eventBus.emit('security-panel-error', { 
        error: error.message, 
        phase: 'initialization' 
      });
      
      throw error;
    }
  }
  
  /**
   * Set up the DOM structure
   * @private
   */
  _setupDom() {
    // Set up main container
    this.container.innerHTML = `
      <div class="security-panel">
        <div class="security-header">
          <h2>Security Management</h2>
          <div class="tabs">
            <button class="tab-button active" data-tab="principals">Principals</button>
            <button class="tab-button" data-tab="capabilities">Capabilities</button>
          </div>
        </div>
        
        <div class="security-tabs">
          <!-- Principals Tab -->
          <div class="security-tab active" id="tab-principals">
            <div class="toolbar">
              <button id="btn-add-principal" class="primary-button">Add Principal</button>
              <button id="btn-import-principal">Import</button>
              <div class="search-box">
                <input type="text" id="principal-search" placeholder="Search principals...">
                <button id="btn-search-principal" aria-label="Search"><i class="icon-search"></i></button>
              </div>
            </div>
            
            <div class="principals-table-container table-container">
              <table class="principals-table data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>DID</th>
                    <th>Type</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="principals-list">
                  <!-- Principal rows inserted here -->
                  <tr class="empty-state">
                    <td colspan="5">No principals found</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div id="principal-details" class="details-panel">
              <!-- Principal details shown here -->
            </div>
          </div>
          
          <!-- Capabilities Tab -->
          <div class="security-tab" id="tab-capabilities">
            <div class="toolbar">
              <button id="btn-create-capability" class="primary-button">Create Capability</button>
              <button id="btn-revoke-selected" disabled>Revoke Selected</button>
              <div class="filter-control">
                <label for="capability-filter">Filter:</label>
                <select id="capability-filter">
                  <option value="">All Capabilities</option>
                  <option value="pyarrow:index:read">Read</option>
                  <option value="pyarrow:index:write">Write</option>
                  <option value="pyarrow:index:admin">Admin</option>
                  <option value="pyarrow:index:metadata:read">Metadata Read</option>
                  <option value="pyarrow:index:metadata:write">Metadata Write</option>
                </select>
              </div>
            </div>
            
            <div class="capabilities-table-container table-container">
              <table class="capabilities-table data-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" id="select-all-capabilities"></th>
                    <th>Capability</th>
                    <th>Resource</th>
                    <th>Issuer</th>
                    <th>Recipient</th>
                    <th>Expiration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="capabilities-list">
                  <!-- Capability rows inserted here -->
                  <tr class="empty-state">
                    <td colspan="7">No capabilities found</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div id="capability-details" class="details-panel">
              <!-- Capability details shown here -->
            </div>
          </div>
        </div>
        
        <!-- Dialog: Create Capability -->
        <div id="create-capability-dialog" class="dialog">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3>Create New Capability</h3>
              <button class="close-button" aria-label="Close">&times;</button>
            </div>
            
            <div class="dialog-body">
              <form id="create-capability-form">
                <div class="form-group">
                  <label for="capability-type">Capability Type</label>
                  <select id="capability-type" required>
                    <option value="pyarrow:index:read">Read Access</option>
                    <option value="pyarrow:index:write">Write Access</option>
                    <option value="pyarrow:index:admin">Admin Access</option>
                    <option value="pyarrow:index:metadata:read">Metadata Read</option>
                    <option value="pyarrow:index:metadata:write">Metadata Write</option>
                  </select>
                  <div class="help-text">The type of access to grant</div>
                </div>
                
                <div class="form-group">
                  <label for="resource-type">Resource Type</label>
                  <select id="resource-type">
                    <option value="path">Path</option>
                    <option value="cid">Content ID</option>
                    <option value="pattern">Pattern</option>
                    <option value="mimeType">MIME Type</option>
                  </select>
                  <div class="help-text">The type of resource to scope this capability to</div>
                </div>
                
                <div class="form-group">
                  <label for="resource-value">Resource Value</label>
                  <input type="text" id="resource-value" placeholder="/path/to/resource">
                  <div class="help-text resource-help" data-type="path">Path to the resource (e.g. /datasets/public)</div>
                  <div class="help-text resource-help" data-type="cid" style="display:none">Content ID (e.g. bafybeigdyrzt5sfp...)</div>
                  <div class="help-text resource-help" data-type="pattern" style="display:none">Pattern to match (e.g. *.jpg, /public/**)</div>
                  <div class="help-text resource-help" data-type="mimeType" style="display:none">MIME type (e.g. image/*, application/pdf)</div>
                </div>
                
                <div class="form-group">
                  <label for="recipient-did">Recipient DID</label>
                  <div class="input-with-button">
                    <input type="text" id="recipient-did" required placeholder="did:key:...">
                    <button type="button" id="select-recipient" class="input-button">Select</button>
                  </div>
                  <div class="help-text">The principal who will receive this capability</div>
                </div>
                
                <div class="form-group">
                  <label for="expiration">Expiration (days)</label>
                  <input type="number" id="expiration" min="1" max="365" value="30">
                  <div class="help-text">How long this capability will be valid</div>
                </div>
              </form>
            </div>
            
            <div class="dialog-footer">
              <button type="button" id="btn-cancel-capability" class="secondary-button">Cancel</button>
              <button type="button" id="btn-create-capability-confirm" class="primary-button">Create</button>
            </div>
          </div>
        </div>
        
        <!-- Dialog: Add Principal -->
        <div id="add-principal-dialog" class="dialog">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3>Add New Principal</h3>
              <button class="close-button" aria-label="Close">&times;</button>
            </div>
            
            <div class="dialog-body">
              <form id="add-principal-form">
                <div class="form-group">
                  <label for="principal-name">Name</label>
                  <input type="text" id="principal-name" required placeholder="User or Service Name">
                </div>
                
                <div class="form-group">
                  <label for="principal-type">Type</label>
                  <select id="principal-type" required>
                    <option value="user">User</option>
                    <option value="service">Service</option>
                    <option value="device">Device</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label for="principal-did">DID</label>
                  <div class="input-with-button">
                    <input type="text" id="principal-did" placeholder="Leave blank to generate new">
                    <button type="button" id="btn-generate-did" class="input-button">Generate</button>
                  </div>
                </div>
              </form>
            </div>
            
            <div class="dialog-footer">
              <button type="button" id="btn-cancel-principal" class="secondary-button">Cancel</button>
              <button type="button" id="btn-add-principal-confirm" class="primary-button">Add</button>
            </div>
          </div>
        </div>
        
        <!-- Dialog: Confirm Revocation -->
        <div id="confirm-revoke-dialog" class="dialog">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3>Confirm Revocation</h3>
              <button class="close-button" aria-label="Close">&times;</button>
            </div>
            
            <div class="dialog-body">
              <p>Are you sure you want to revoke this capability?</p>
              <p>This action cannot be undone.</p>
              <div id="revoke-details"></div>
            </div>
            
            <div class="dialog-footer">
              <button type="button" id="btn-cancel-revoke" class="secondary-button">Cancel</button>
              <button type="button" id="btn-confirm-revoke" class="danger-button">Revoke</button>
            </div>
          </div>
        </div>
        
        <!-- Dialog: Select Principal -->
        <div id="select-principal-dialog" class="dialog">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3>Select Principal</h3>
              <button class="close-button" aria-label="Close">&times;</button>
            </div>
            
            <div class="dialog-body">
              <div class="search-box">
                <input type="text" id="dialog-principal-search" placeholder="Search principals...">
              </div>
              
              <div class="select-list" id="select-principal-list">
                <!-- Principals will be inserted here -->
              </div>
            </div>
            
            <div class="dialog-footer">
              <button type="button" id="btn-cancel-select" class="secondary-button">Cancel</button>
            </div>
          </div>
        </div>
        
        <!-- Dialog: Edit Principal -->
        <div id="edit-principal-dialog" class="dialog">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3>Edit Principal</h3>
              <button class="close-button" aria-label="Close">&times;</button>
            </div>
            
            <div class="dialog-body">
              <form id="edit-principal-form">
                <div class="form-group">
                  <label for="edit-principal-name">Name</label>
                  <input type="text" id="edit-principal-name" required placeholder="User or Service Name">
                </div>
                
                <div class="form-group">
                  <label for="edit-principal-type">Type</label>
                  <select id="edit-principal-type" required>
                    <option value="user">User</option>
                    <option value="service">Service</option>
                    <option value="device">Device</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label for="edit-principal-did">DID</label>
                  <input type="text" id="edit-principal-did" readonly class="readonly-field">
                  <div class="help-text">DID is an immutable identifier and cannot be changed.</div>
                </div>
              </form>
            </div>
            
            <div class="dialog-footer">
              <button type="button" id="btn-cancel-edit-principal" class="secondary-button">Cancel</button>
              <button type="button" id="btn-save-principal" class="primary-button">Save</button>
            </div>
          </div>
        </div>
        
        <!-- Toast Notifications -->
        <div id="security-toast-container" class="toast-container"></div>
      </div>
    `;
  }
  
  /**
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // Tab switching
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', this._handleTabChange);
    });
    
    // Principal management
    this.container.querySelector('#btn-add-principal').addEventListener('click', this._handleAddPrincipal);
    this.container.querySelector('#btn-import-principal').addEventListener('click', this._handleImportPrincipal);
    this.container.querySelector('#principal-search').addEventListener('input', this._handleSearch);
    
    // Capability management
    this.container.querySelector('#btn-create-capability').addEventListener('click', this._handleCreateCapability);
    this.container.querySelector('#btn-revoke-selected').addEventListener('click', this._handleRevokeCapability);
    this.container.querySelector('#capability-filter').addEventListener('change', () => this._renderCapabilities());
    this.container.querySelector('#select-all-capabilities').addEventListener('change', this._handleSelectAllCapabilities.bind(this));
    
    // Dialogs
    const closeButtons = this.container.querySelectorAll('.close-button');
    closeButtons.forEach(button => {
      button.addEventListener('click', this._handleDialogClose);
    });
    
    // Create capability dialog
    this.container.querySelector('#btn-cancel-capability').addEventListener('click', () => this._closeDialog('create-capability-dialog'));
    this.container.querySelector('#btn-create-capability-confirm').addEventListener('click', () => this._handleFormSubmit('create-capability'));
    this.container.querySelector('#resource-type').addEventListener('change', this._handleResourceTypeChange);
    this.container.querySelector('#select-recipient').addEventListener('click', this._handleSelectRecipient.bind(this));
    
    // Add principal dialog
    this.container.querySelector('#btn-cancel-principal').addEventListener('click', () => this._closeDialog('add-principal-dialog'));
    this.container.querySelector('#btn-add-principal-confirm').addEventListener('click', () => this._handleFormSubmit('add-principal'));
    this.container.querySelector('#btn-generate-did').addEventListener('click', this._handleGenerateDid.bind(this));
    
    // Revocation confirmation dialog
    this.container.querySelector('#btn-cancel-revoke').addEventListener('click', () => this._closeDialog('confirm-revoke-dialog'));
    this.container.querySelector('#btn-confirm-revoke').addEventListener('click', this._handleConfirmRevoke);
    
    // Select principal dialog
    this.container.querySelector('#btn-cancel-select').addEventListener('click', () => this._closeDialog('select-principal-dialog'));
    this.container.querySelector('#dialog-principal-search').addEventListener('input', this._handleDialogPrincipalSearch.bind(this));
    
    // Edit principal dialog
    this.container.querySelector('#btn-cancel-edit-principal').addEventListener('click', () => this._closeDialog('edit-principal-dialog'));
    this.container.querySelector('#btn-save-principal').addEventListener('click', () => this._handleFormSubmit('edit-principal'));
    
    // External events
    this.eventBus.on('content-selected', this._handleContentSelected.bind(this));
    this.eventBus.on('principal-selected', this._handleExternalPrincipalSelect.bind(this));
  }
  
  /**
   * Load initial data
   * @private
   * @returns {Promise<void>}
   */
  async _loadData() {
    try {
      // Load principals
      this.principals = await this.ucanManager.listPrincipals();
      this._renderPrincipals();
      
      // Load capabilities
      this.capabilities = await this.ucanManager.listCapabilities();
      this._renderCapabilities();
      
      return true;
    } catch (error) {
      console.error('Failed to load security data:', error);
      
      // Show error state
      this._showToast('Failed to load security data', 'error');
      
      throw error;
    }
  }
  
  /**
   * Render principals list
   * @private
   */
  _renderPrincipals() {
    const searchTerm = this.container.querySelector('#principal-search').value.toLowerCase();
    const principalsList = this.container.querySelector('#principals-list');
    
    // Filter principals by search term
    const filteredPrincipals = searchTerm
      ? this.principals.filter(principal => 
          principal.name.toLowerCase().includes(searchTerm) ||
          principal.did.toLowerCase().includes(searchTerm) ||
          principal.type.toLowerCase().includes(searchTerm)
        )
      : this.principals;
    
    // Clear existing content
    principalsList.innerHTML = '';
    
    // Show empty state if no principals
    if (filteredPrincipals.length === 0) {
      principalsList.innerHTML = `
        <tr class="empty-state">
          <td colspan="5">${searchTerm ? 'No matching principals found' : 'No principals found'}</td>
        </tr>
      `;
      return;
    }
    
    // Render each principal
    filteredPrincipals.forEach(principal => {
      const row = document.createElement('tr');
      row.className = 'principal-row';
      row.dataset.did = principal.did;
      
      // Add selected class if this is the selected principal
      if (this.selectedPrincipal && this.selectedPrincipal.did === principal.did) {
        row.classList.add('selected');
      }
      
      // Create row content
      row.innerHTML = `
        <td>${this._escapeHtml(principal.name)}</td>
        <td class="did-cell">${this._truncateDid(principal.did)}</td>
        <td>${this._getPrincipalTypeLabel(principal.type)}</td>
        <td>${this._formatDate(principal.created)}</td>
        <td class="actions-cell">
          <button class="icon-button view-button" title="View Details" data-did="${principal.did}">
            <i class="icon-eye"></i>
          </button>
          <button class="icon-button copy-button" title="Copy DID" data-did="${principal.did}">
            <i class="icon-copy"></i>
          </button>
        </td>
      `;
      
      // Add click handlers
      row.addEventListener('click', () => this._handlePrincipalSelect(principal));
      
      const copyButton = row.querySelector('.copy-button');
      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this._copyToClipboard(principal.did);
        this._showToast('DID copied to clipboard', 'success');
      });
      
      principalsList.appendChild(row);
    });
  }
  
  /**
   * Render capabilities list
   * @private
   */
  _renderCapabilities() {
    const filterValue = this.container.querySelector('#capability-filter').value;
    const capabilitiesList = this.container.querySelector('#capabilities-list');
    
    // Filter capabilities by selected filter
    const filteredCapabilities = filterValue
      ? this.capabilities.filter(cap => cap.capability === filterValue)
      : this.capabilities;
    
    // Filter further by principal if a principal filter is active
    const principalFiltered = this.principalFilter
      ? filteredCapabilities.filter(cap => cap.audience === this.principalFilter || cap.issuer === this.principalFilter)
      : filteredCapabilities;

    // Filter further by content CID or path if a content filter is active
    const displayedCapabilities = this.contentFilter
      ? principalFiltered.filter(cap => {
          const resource = cap.resource || {};
          const matchesCid = this.contentFilter.cid && resource.cid === this.contentFilter.cid;
          const matchesPath = this.contentFilter.path && resource.path === this.contentFilter.path;
          return matchesCid || matchesPath;
        })
      : principalFiltered;
    
    // Clear existing content
    capabilitiesList.innerHTML = '';
    
    // Show empty state if no capabilities
    if (displayedCapabilities.length === 0) {
      capabilitiesList.innerHTML = `
        <tr class="empty-state">
          <td colspan="7">${filterValue || this.principalFilter || this.contentFilter ? 'No matching capabilities found' : 'No capabilities found'}</td>
        </tr>
      `;
      
      // Disable revoke selected button
      this.container.querySelector('#btn-revoke-selected').disabled = true;
      
      return;
    }
    
    // Render each capability
    displayedCapabilities.forEach(capability => {
      const row = document.createElement('tr');
      row.className = 'capability-row';
      row.dataset.id = capability.id;
      
      // Add selected class if this is the selected capability
      if (this.selectedCapability && this.selectedCapability.id === capability.id) {
        row.classList.add('selected');
      }
      
      // Format resource string
      const resourceStr = this._formatResourceString(capability.resource);
      
      // Create row content
      row.innerHTML = `
        <td><input type="checkbox" class="capability-checkbox" data-id="${capability.id}"></td>
        <td>${this._getCapabilityLabel(capability.capability)}</td>
        <td>${resourceStr}</td>
        <td class="did-cell">${this._truncateDid(capability.issuer)}</td>
        <td class="did-cell">${this._truncateDid(capability.audience)}</td>
        <td>${this._formatDate(capability.expiration)}</td>
        <td class="actions-cell">
          <button class="icon-button view-button" title="View Details" data-id="${capability.id}">
            <i class="icon-eye"></i>
          </button>
          <button class="icon-button revoke-button" title="Revoke" data-id="${capability.id}">
            <i class="icon-trash"></i>
          </button>
        </td>
      `;
      
      // Add click handlers
      row.addEventListener('click', (e) => {
        // Don't trigger row selection when clicking checkbox
        if (!e.target.matches('input[type="checkbox"]')) {
          this._handleCapabilitySelect(capability);
        }
      });
      
      const revokeButton = row.querySelector('.revoke-button');
      revokeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showRevokeConfirmation(capability);
      });
      
      const checkbox = row.querySelector('.capability-checkbox');
      checkbox.addEventListener('change', () => {
        this._updateRevokeSelectedButton();
      });
      
      capabilitiesList.appendChild(row);
    });
    
    // Initialize revoke selected button state
    this._updateRevokeSelectedButton();
  }
  
  /**
   * Render principal details
   * @private
   * @param {Object} principal - Principal object
   */
  _renderPrincipalDetails(principal) {
    const detailsPanel = this.container.querySelector('#principal-details');
    
    // Show the panel
    detailsPanel.style.display = 'block';
    
    // Calculate capability counts
    const capabilities = this.capabilities.filter(cap => cap.audience === principal.did);
    const readCount = capabilities.filter(cap => cap.capability.includes('read')).length;
    const writeCount = capabilities.filter(cap => cap.capability.includes('write')).length;
    const adminCount = capabilities.filter(cap => cap.capability.includes('admin')).length;
    
    // Render details
    detailsPanel.innerHTML = `
      <div class="details-header">
        <h3>${this._escapeHtml(principal.name)}</h3>
        <div class="details-actions">
          <button id="btn-edit-principal" class="text-button">
            <i class="icon-edit"></i> Edit
          </button>
          <button id="btn-close-details" class="text-button">
            <i class="icon-close"></i> Close
          </button>
        </div>
      </div>
      
      <div class="details-content">
        <div class="details-section">
          <h4>Basic Information</h4>
          <table class="details-table">
            <tr>
              <th>DID:</th>
              <td>${principal.did}</td>
            </tr>
            <tr>
              <th>Type:</th>
              <td>${this._getPrincipalTypeLabel(principal.type)}</td>
            </tr>
            <tr>
              <th>Created:</th>
              <td>${this._formatDate(principal.created)}</td>
            </tr>
          </table>
        </div>
        
        <div class="details-section">
          <h4>Capabilities</h4>
          <div class="capability-counts">
            <div class="capability-count">
              <span class="count">${readCount}</span>
              <span class="label">Read</span>
            </div>
            <div class="capability-count">
              <span class="count">${writeCount}</span>
              <span class="label">Write</span>
            </div>
            <div class="capability-count">
              <span class="count">${adminCount}</span>
              <span class="label">Admin</span>
            </div>
          </div>
          
          <div class="capability-actions">
            <button id="btn-add-capability" class="secondary-button">
              <i class="icon-plus"></i> Add Capability
            </button>
            <button id="btn-view-capabilities" class="secondary-button">
              <i class="icon-list"></i> View All
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners
    detailsPanel.querySelector('#btn-close-details').addEventListener('click', () => {
      detailsPanel.style.display = 'none';
      this.selectedPrincipal = null;
      
      // Remove selected class from all rows
      const rows = this.container.querySelectorAll('.principal-row');
      rows.forEach(row => row.classList.remove('selected'));
    });
    
    detailsPanel.querySelector('#btn-edit-principal').addEventListener('click', () => {
      this._openEditPrincipalDialog(principal);
    });
    
    detailsPanel.querySelector('#btn-add-capability').addEventListener('click', () => {
      this._openDialog('create-capability-dialog');
      // Pre-fill recipient field with the selected principal
      this.container.querySelector('#recipient-did').value = principal.did;
    });
    
    detailsPanel.querySelector('#btn-view-capabilities').addEventListener('click', () => {
      // Switch to capabilities tab
      this._handleTabChange({ target: this.container.querySelector('[data-tab="capabilities"]') });
      
      // Filter capabilities to show only those for this principal
      this.principalFilter = principal.did;
      this._renderCapabilities();
      this._showToast('Filtered to show capabilities for ' + principal.name, 'info');
    });
  }
  
  /**
   * Render capability details
   * @private
   * @param {Object} capability - Capability object
   */
  _renderCapabilityDetails(capability) {
    const detailsPanel = this.container.querySelector('#capability-details');
    
    // Show the panel
    detailsPanel.style.display = 'block';
    
    // Format dates
    const issued = this._formatDate(capability.issuedAt);
    const expires = this._formatDate(capability.expiration);
    
    // Get issuer and audience names
    const issuer = this.principals.find(p => p.did === capability.issuer) || { name: 'Unknown' };
    const audience = this.principals.find(p => p.did === capability.audience) || { name: 'Unknown' };
    
    // Resource details
    const resourceType = Object.keys(capability.resource)[0];
    const resourceValue = capability.resource[resourceType];
    
    // Format the raw token for display
    const formattedToken = JSON.stringify(capability.rawToken, null, 2);
    
    // Render details
    detailsPanel.innerHTML = `
      <div class="details-header">
        <h3>${this._getCapabilityLabel(capability.capability)}</h3>
        <div class="details-actions">
          <button id="btn-copy-token" class="text-button">
            <i class="icon-copy"></i> Copy Token
          </button>
          <button id="btn-close-cap-details" class="text-button">
            <i class="icon-close"></i> Close
          </button>
        </div>
      </div>
      
      <div class="details-content">
        <div class="details-section">
          <h4>Basic Information</h4>
          <table class="details-table">
            <tr>
              <th>Capability:</th>
              <td><span class="capability-badge">${capability.capability}</span></td>
            </tr>
            <tr>
              <th>Issuer:</th>
              <td>
                <div class="did-with-name">
                  <span class="name">${this._escapeHtml(issuer.name)}</span>
                  <span class="did">${capability.issuer}</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>Audience:</th>
              <td>
                <div class="did-with-name">
                  <span class="name">${this._escapeHtml(audience.name)}</span>
                  <span class="did">${capability.audience}</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>Issued:</th>
              <td>${issued}</td>
            </tr>
            <tr>
              <th>Expires:</th>
              <td>${expires}</td>
            </tr>
          </table>
        </div>
        
        <div class="details-section">
          <h4>Resource Scope</h4>
          <table class="details-table">
            <tr>
              <th>Type:</th>
              <td>${this._capitalizeFirst(resourceType)}</td>
            </tr>
            <tr>
              <th>Value:</th>
              <td>${resourceValue}</td>
            </tr>
          </table>
        </div>
        
        <div class="details-section">
          <h4>Raw Token</h4>
          <div class="code-block">
            <pre><code>${formattedToken}</code></pre>
          </div>
        </div>
        
        <div class="details-actions-bottom">
          <button id="btn-revoke-capability" class="danger-button">
            <i class="icon-trash"></i> Revoke Capability
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    detailsPanel.querySelector('#btn-close-cap-details').addEventListener('click', () => {
      detailsPanel.style.display = 'none';
      this.selectedCapability = null;
      
      // Remove selected class from all rows
      const rows = this.container.querySelectorAll('.capability-row');
      rows.forEach(row => row.classList.remove('selected'));
    });
    
    detailsPanel.querySelector('#btn-copy-token').addEventListener('click', this._handleCopyToken);
    
    detailsPanel.querySelector('#btn-revoke-capability').addEventListener('click', () => {
      this._showRevokeConfirmation(capability);
    });
  }
  
  /**
   * Handle tab change
   * @private
   * @param {Event} event - Click event
   */
  _handleTabChange(event) {
    // Get tab name
    const tabName = event.target.dataset.tab;
    
    // Skip if already active
    if (tabName === this.activeTab) return;
    
    // Update active tab
    this.activeTab = tabName;
    
    // Update button states
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });
    
    // Update tab visibility
    const tabs = this.container.querySelectorAll('.security-tab');
    tabs.forEach(tab => {
      const isActive = tab.id === `tab-${tabName}`;
      tab.classList.toggle('active', isActive);
      
      // Hide details panels when switching tabs
      if (isActive) {
        tab.querySelector('.details-panel').style.display = 'none';
      }
    });
    
    // Clear selections
    this.selectedPrincipal = null;
    this.selectedCapability = null;
    
    // Clear principal filter when switching away from capabilities tab
    if (tabName !== 'capabilities') {
      this.principalFilter = null;
    }
  }
  
  /**
   * Handle add principal button click
   * @private
   */
  _handleAddPrincipal() {
    this._openDialog('add-principal-dialog');
  }
  
  /**
   * Handle import principal button click
   * @private
   */
  _handleImportPrincipal() {
    // Create a hidden file input and trigger it to let the user pick a JSON file
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      let parsed;
      try {
        const text = await file.text();
        parsed = JSON.parse(text);
      } catch {
        this._showToast('Invalid JSON file', 'error');
        return;
      }

      // Accept either a single principal object or an array of principals
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;

      for (const entry of entries) {
        if (!entry.did || !entry.name) {
          this._showToast('Principal file must include "did" and "name" fields', 'error');
          return;
        }
        try {
          await this.ucanManager.addPrincipal({
            name: entry.name,
            type: entry.type || 'user',
            did: entry.did
          });
          imported++;
        } catch (err) {
          console.error('Failed to import principal:', err);
          this._showToast(`Failed to import principal "${entry.name}": ${err.message}`, 'error');
          return;
        }
      }

      // Refresh principals list after successful import
      this.principals = await this.ucanManager.listPrincipals();
      this._renderPrincipals();
      this._showToast(
        imported === 1 ? 'Principal imported successfully' : `${imported} principals imported successfully`,
        'success'
      );
    });

    fileInput.click();
  }
  
  /**
   * Handle principal selection
   * @private
   * @param {Object} principal - Selected principal
   */
  _handlePrincipalSelect(principal) {
    this.selectedPrincipal = principal;
    
    // Update row selection
    const rows = this.container.querySelectorAll('.principal-row');
    rows.forEach(row => {
      row.classList.toggle('selected', row.dataset.did === principal.did);
    });
    
    // Show details panel
    this._renderPrincipalDetails(principal);
  }
  
  /**
   * Handle create capability button click
   * @private
   */
  _handleCreateCapability() {
    this._openDialog('create-capability-dialog');
  }
  
  /**
   * Handle revoke capability button click
   * @private
   */
  _handleRevokeCapability() {
    // Get selected capabilities
    const checkboxes = this.container.querySelectorAll('.capability-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    // If none selected, show error
    if (selectedIds.length === 0) {
      this._showToast('No capabilities selected', 'error');
      return;
    }
    
    // If one selected, show confirmation with details
    if (selectedIds.length === 1) {
      const capability = this.capabilities.find(cap => cap.id === selectedIds[0]);
      this._showRevokeConfirmation(capability);
      return;
    }
    
    // If multiple selected, show confirmation with count
    const revokeDetails = this.container.querySelector('#revoke-details');
    revokeDetails.innerHTML = `
      <div class="revoke-summary">
        <p><strong>${selectedIds.length}</strong> capabilities will be revoked.</p>
      </div>
    `;
    
    // Store selected IDs for confirmation handler
    this._revokeTargets = selectedIds;
    
    // Show dialog
    this._openDialog('confirm-revoke-dialog');
  }
  
  /**
   * Handle capability selection
   * @private
   * @param {Object} capability - Selected capability
   */
  _handleCapabilitySelect(capability) {
    this.selectedCapability = capability;
    
    // Update row selection
    const rows = this.container.querySelectorAll('.capability-row');
    rows.forEach(row => {
      row.classList.toggle('selected', row.dataset.id === capability.id);
    });
    
    // Show details panel
    this._renderCapabilityDetails(capability);
  }
  
  /**
   * Handle dialog close button click
   * @private
   * @param {Event} event - Click event
   */
  _handleDialogClose(event) {
    const dialog = event.target.closest('.dialog');
    this._closeDialog(dialog.id);
  }
  
  /**
   * Handle form submission
   * @private
   * @param {string} formType - Type of form
   */
  async _handleFormSubmit(formType) {
    try {
      if (formType === 'create-capability') {
        // Get form values
        const capabilityType = this.container.querySelector('#capability-type').value;
        const resourceType = this.container.querySelector('#resource-type').value;
        const resourceValue = this.container.querySelector('#resource-value').value;
        const recipientDid = this.container.querySelector('#recipient-did').value;
        const expiration = parseInt(this.container.querySelector('#expiration').value, 10);
        
        // Validate form
        if (!capabilityType || !resourceType || !resourceValue || !recipientDid) {
          this._showToast('Please fill in all required fields', 'error');
          return;
        }
        
        // Create resource object
        const resource = { [resourceType]: resourceValue };
        
        // Issue capability
        const expirationSeconds = expiration * 24 * 60 * 60; // Convert days to seconds
        const token = await this.ucanManager.issueCapability(
          capabilityType,
          resource,
          recipientDid,
          expirationSeconds
        );
        
        // Reload capabilities
        this.capabilities = await this.ucanManager.listCapabilities();
        this._renderCapabilities();
        
        // Show success message
        this._showToast('Capability created successfully', 'success');
        
        // Close dialog
        this._closeDialog('create-capability-dialog');
      }
      else if (formType === 'add-principal') {
        // Get form values
        const name = this.container.querySelector('#principal-name').value;
        const type = this.container.querySelector('#principal-type').value;
        let did = this.container.querySelector('#principal-did').value;
        
        // Validate form
        if (!name || !type) {
          this._showToast('Please fill in all required fields', 'error');
          return;
        }
        
        // Generate DID if not provided
        if (!did) {
          did = await this.ucanManager.generateDid();
        }
        
        // Add principal
        await this.ucanManager.addPrincipal({
          name,
          type,
          did
        });
        
        // Reload principals
        this.principals = await this.ucanManager.listPrincipals();
        this._renderPrincipals();
        
        // Show success message
        this._showToast('Principal added successfully', 'success');
        
        // Close dialog
        this._closeDialog('add-principal-dialog');
      }
      else if (formType === 'edit-principal') {
        // Get form values
        const name = this.container.querySelector('#edit-principal-name').value;
        const type = this.container.querySelector('#edit-principal-type').value;
        const did = this.container.querySelector('#edit-principal-did').value;
        
        // Validate form
        if (!name || !type) {
          this._showToast('Please fill in all required fields', 'error');
          return;
        }
        
        // Update principal
        await this.ucanManager.updatePrincipal({ did, name, type });
        
        // Reload principals
        this.principals = await this.ucanManager.listPrincipals();
        this._renderPrincipals();
        
        // Refresh details panel if the same principal is selected
        if (this.selectedPrincipal && this.selectedPrincipal.did === did) {
          this.selectedPrincipal = this.principals.find(p => p.did === did) || null;
          if (this.selectedPrincipal) {
            this._renderPrincipalDetails(this.selectedPrincipal);
          }
        }
        
        // Show success message
        this._showToast('Principal updated successfully', 'success');
        
        // Close dialog
        this._closeDialog('edit-principal-dialog');
      }
    } catch (error) {
      console.error(`Failed to handle ${formType}:`, error);
      this._showToast(`Error: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle search input
   * @private
   */
  _handleSearch() {
    this._renderPrincipals();
  }
  
  /**
   * Handle resource type change
   * @private
   */
  _handleResourceTypeChange() {
    const resourceType = this.container.querySelector('#resource-type').value;
    
    // Update help text visibility
    const helpTexts = this.container.querySelectorAll('.resource-help');
    helpTexts.forEach(help => {
      help.style.display = help.dataset.type === resourceType ? 'block' : 'none';
    });
    
    // Update placeholder based on type
    const resourceValue = this.container.querySelector('#resource-value');
    switch (resourceType) {
      case 'path':
        resourceValue.placeholder = '/path/to/resource';
        break;
      case 'cid':
        resourceValue.placeholder = 'bafybeigdyrzt5sfp...';
        break;
      case 'pattern':
        resourceValue.placeholder = '*.jpg, /public/**';
        break;
      case 'mimeType':
        resourceValue.placeholder = 'image/*, application/pdf';
        break;
    }
  }
  
  /**
   * Show revoke confirmation dialog
   * @private
   * @param {Object} capability - Capability to revoke
   */
  _showRevokeConfirmation(capability) {
    // Get details
    const capabilityLabel = this._getCapabilityLabel(capability.capability);
    const resourceStr = this._formatResourceString(capability.resource);
    
    // Find principal names
    const issuer = this.principals.find(p => p.did === capability.issuer) || { name: 'Unknown' };
    const audience = this.principals.find(p => p.did === capability.audience) || { name: 'Unknown' };
    
    // Update dialog content
    const revokeDetails = this.container.querySelector('#revoke-details');
    revokeDetails.innerHTML = `
      <div class="revoke-details">
        <table class="details-table">
          <tr>
            <th>Capability:</th>
            <td><span class="capability-badge">${capabilityLabel}</span></td>
          </tr>
          <tr>
            <th>Resource:</th>
            <td>${resourceStr}</td>
          </tr>
          <tr>
            <th>From:</th>
            <td>${this._escapeHtml(issuer.name)}</td>
          </tr>
          <tr>
            <th>To:</th>
            <td>${this._escapeHtml(audience.name)}</td>
          </tr>
        </table>
      </div>
    `;
    
    // Store capability ID for confirmation handler
    this._revokeTargets = [capability.id];
    
    // Show dialog
    this._openDialog('confirm-revoke-dialog');
  }
  
  /**
   * Handle revoke confirmation
   * @private
   */
  async _handleConfirmRevoke() {
    try {
      // Get targets
      const targets = this._revokeTargets;
      if (!targets || targets.length === 0) {
        this._showToast('No capabilities selected for revocation', 'error');
        return;
      }
      
      // Revoke capabilities
      for (const id of targets) {
        await this.ucanManager.revokeCapability(id);
      }
      
      // Reload capabilities
      this.capabilities = await this.ucanManager.listCapabilities();
      this._renderCapabilities();
      
      // Show success message
      const message = targets.length === 1
        ? 'Capability revoked successfully'
        : `${targets.length} capabilities revoked successfully`;
      this._showToast(message, 'success');
      
      // Close dialog
      this._closeDialog('confirm-revoke-dialog');
      
      // Clear revoke targets
      this._revokeTargets = null;
      
      // Clear capability details if it was revoked
      if (this.selectedCapability && targets.includes(this.selectedCapability.id)) {
        this.container.querySelector('#capability-details').style.display = 'none';
        this.selectedCapability = null;
      }
    } catch (error) {
      console.error('Failed to revoke capabilities:', error);
      this._showToast(`Error: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle copy token button click
   * @private
   */
  _handleCopyToken() {
    if (!this.selectedCapability) return;
    
    // Copy raw token to clipboard
    const token = JSON.stringify(this.selectedCapability.rawToken);
    this._copyToClipboard(token);
    
    this._showToast('Token copied to clipboard', 'success');
  }
  
  /**
   * Handle select all capabilities checkbox change
   * @private
   * @param {Event} event - Change event
   */
  _handleSelectAllCapabilities(event) {
    const checked = event.target.checked;
    
    // Update all checkboxes
    const checkboxes = this.container.querySelectorAll('.capability-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = checked;
    });
    
    // Update revoke selected button
    this._updateRevokeSelectedButton();
  }
  
  /**
   * Handle select recipient button click
   * @private
   */
  _handleSelectRecipient() {
    // Populate principal list
    this._populateSelectPrincipalList();
    
    // Show dialog
    this._openDialog('select-principal-dialog');
  }
  
  /**
   * Handle generate DID button click
   * @private
   */
  async _handleGenerateDid() {
    try {
      // Generate DID
      const did = await this.ucanManager.generateDid();
      
      // Update input
      this.container.querySelector('#principal-did').value = did;
    } catch (error) {
      console.error('Failed to generate DID:', error);
      this._showToast(`Error: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle dialog principal search
   * @private
   */
  _handleDialogPrincipalSearch() {
    // Update the principal list with filtered results
    this._populateSelectPrincipalList();
  }
  
  /**
   * Populate the select principal list
   * @private
   */
  _populateSelectPrincipalList() {
    const searchTerm = this.container.querySelector('#dialog-principal-search').value.toLowerCase();
    const selectList = this.container.querySelector('#select-principal-list');
    
    // Filter principals by search term
    const filteredPrincipals = searchTerm
      ? this.principals.filter(principal => 
          principal.name.toLowerCase().includes(searchTerm) ||
          principal.did.toLowerCase().includes(searchTerm) ||
          principal.type.toLowerCase().includes(searchTerm)
        )
      : this.principals;
    
    // Clear existing content
    selectList.innerHTML = '';
    
    // Show empty state if no principals
    if (filteredPrincipals.length === 0) {
      selectList.innerHTML = `
        <div class="empty-state">
          ${searchTerm ? 'No matching principals found' : 'No principals found'}
        </div>
      `;
      return;
    }
    
    // Render each principal
    filteredPrincipals.forEach(principal => {
      const item = document.createElement('div');
      item.className = 'select-item';
      item.dataset.did = principal.did;
      
      // Create item content
      item.innerHTML = `
        <div class="select-item-content">
          <div class="select-item-name">${this._escapeHtml(principal.name)}</div>
          <div class="select-item-details">
            <span class="select-item-type">${this._getPrincipalTypeLabel(principal.type)}</span>
            <span class="select-item-did">${this._truncateDid(principal.did)}</span>
          </div>
        </div>
      `;
      
      // Add click handler
      item.addEventListener('click', () => {
        // Update recipient input
        this.container.querySelector('#recipient-did').value = principal.did;
        
        // Close dialog
        this._closeDialog('select-principal-dialog');
      });
      
      selectList.appendChild(item);
    });
  }
  
  /**
   * Handle content selected event from main dashboard
   * @private
   * @param {Object} content - Selected content with optional cid and/or path properties
   */
  _handleContentSelected(content) {
    // Switch to capabilities tab
    this._handleTabChange({ target: this.container.querySelector('[data-tab="capabilities"]') });

    // Filter capabilities to show only those for this content (by CID or path)
    this.contentFilter = content || null;
    this._renderCapabilities();

    const label = (content && (content.cid || content.path)) || 'selected content';
    this._showToast(`Showing capabilities for ${label}`, 'info');
  }
  
  /**
   * Handle principal selected event from external source
   * @private
   * @param {Object} principal - Selected principal
   */
  _handleExternalPrincipalSelect(principal) {
    // Find the principal in our data
    const foundPrincipal = this.principals.find(p => p.did === principal.did);
    if (!foundPrincipal) {
      this._showToast('Principal not found', 'error');
      return;
    }
    
    // Switch to principals tab
    this._handleTabChange({ target: this.container.querySelector('[data-tab="principals"]') });
    
    // Select the principal
    this._handlePrincipalSelect(foundPrincipal);
  }
  
  /**
   * Update the revoke selected button state
   * @private
   */
  _updateRevokeSelectedButton() {
    const checkboxes = this.container.querySelectorAll('.capability-checkbox:checked');
    const revokeButton = this.container.querySelector('#btn-revoke-selected');
    
    revokeButton.disabled = checkboxes.length === 0;
  }
  
  /**
   * Open a dialog
   * @private
   * @param {string} dialogId - Dialog ID
   */
  _openDialog(dialogId) {
    const dialog = this.container.querySelector(`#${dialogId}`);
    dialog.style.display = 'flex';
    
    // Reset form if present
    const form = dialog.querySelector('form');
    if (form) form.reset();
    
    // Update resource help text for capability dialog
    if (dialogId === 'create-capability-dialog') {
      this._handleResourceTypeChange();
    }
  }
  
  /**
   * Close a dialog
   * @private
   * @param {string} dialogId - Dialog ID
   */
  _closeDialog(dialogId) {
    const dialog = this.container.querySelector(`#${dialogId}`);
    dialog.style.display = 'none';
  }
  
  /**
   * Show a toast notification
   * @private
   * @param {string} message - Toast message
   * @param {string} type - Toast type (success, error, info)
   */
  _showToast(message, type = 'info') {
    const container = this.container.querySelector('#security-toast-container');
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <i class="toast-icon icon-${type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info'}"></i>
        <span class="toast-message">${message}</span>
      </div>
      <button class="toast-close">&times;</button>
    `;
    
    // Add to container
    container.appendChild(toast);
    
    // Add close handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
      container.removeChild(toast);
    });
    
    // Auto remove after delay
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 5000);
  }
  
  /**
   * Copy text to clipboard
   * @private
   * @param {string} text - Text to copy
   */
  _copyToClipboard(text) {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    
    // Select and copy
    textarea.select();
    document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textarea);
  }
  
  /**
   * Get formatted capability label
   * @private
   * @param {string} capability - Capability string
   * @returns {string} Formatted label
   */
  _getCapabilityLabel(capability) {
    // Extract the last part of the capability
    const parts = capability.split(':');
    const lastPart = parts[parts.length - 1];
    
    // Capitalize and format
    return this._capitalizeFirst(lastPart);
  }
  
  /**
   * Get principal type label
   * @private
   * @param {string} type - Principal type
   * @returns {string} Formatted label
   */
  _getPrincipalTypeLabel(type) {
    switch (type) {
      case 'user':
        return 'User';
      case 'service':
        return 'Service';
      case 'device':
        return 'Device';
      default:
        return this._capitalizeFirst(type);
    }
  }
  
  /**
   * Format resource string
   * @private
   * @param {Object} resource - Resource object
   * @returns {string} Formatted resource string
   */
  _formatResourceString(resource) {
    if (!resource) return 'All Resources';
    
    const type = Object.keys(resource)[0];
    const value = resource[type];
    
    switch (type) {
      case 'path':
        return `Path: ${value}`;
      case 'cid':
        return `CID: ${this._truncateText(value, 20)}`;
      case 'pattern':
        return `Pattern: ${value}`;
      case 'mimeType':
        return `MIME: ${value}`;
      default:
        return `${this._capitalizeFirst(type)}: ${value}`;
    }
  }
  
  /**
   * Format date
   * @private
   * @param {string} dateStr - Date string
   * @returns {string} Formatted date
   */
  _formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (e) {
      return dateStr;
    }
  }
  
  /**
   * Truncate DID for display
   * @private
   * @param {string} did - DID string
   * @returns {string} Truncated DID
   */
  _truncateDid(did) {
    if (!did) return '';
    
    // Extract key part
    const parts = did.split(':');
    const key = parts[parts.length - 1];
    
    // Truncate if needed
    if (key.length > 16) {
      return `${parts.slice(0, -1).join(':')}:${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
    }
    
    return did;
  }
  
  /**
   * Truncate text for display
   * @private
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  _truncateText(text, maxLength = 30) {
    if (!text) return '';
    
    if (text.length <= maxLength) return text;
    
    return text.substring(0, maxLength / 2) + '...' + text.substring(text.length - maxLength / 2);
  }
  
  /**
   * Capitalize first letter of a string
   * @private
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  _capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  /**
   * Escape HTML to prevent XSS
   * @private
   * @param {string} html - HTML string
   * @returns {string} Escaped HTML
   */
  _escapeHtml(html) {
    if (!html) return '';
    
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }
  
  /**
   * Dispose and clean up resources
   * @returns {void}
   */
  dispose() {
    // Clean up event listeners
    if (this.container) {
      // Remove tab listeners
      const tabButtons = this.container.querySelectorAll('.tab-button');
      tabButtons.forEach(button => {
        button.removeEventListener('click', this._handleTabChange);
      });
      
      // Remove principal management listeners
      const addButton = this.container.querySelector('#btn-add-principal');
      if (addButton) {
        addButton.removeEventListener('click', this._handleAddPrincipal);
      }
      
      const importButton = this.container.querySelector('#btn-import-principal');
      if (importButton) {
        importButton.removeEventListener('click', this._handleImportPrincipal);
      }
      
      // Reset container content
      this.container.innerHTML = '';
    }
    
    // Clear state
    this.initialized = false;
    this.activeTab = 'principals';
    this.principals = [];
    this.capabilities = [];
    this.selectedPrincipal = null;
    this.selectedCapability = null;
  }
}

// Export component
export default SecurityPanel;