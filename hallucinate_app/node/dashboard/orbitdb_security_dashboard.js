/**
 * OrbitDB Security Dashboard Component
 * 
 * Provides UI for monitoring and managing OrbitDB database security
 * Shows capability assignments, access statistics, and resource usage
 * Allows capability management and database security configuration
 */

import { secureOrbitdbManager, ORBITDB_CAPABILITIES } from '../secure_orbitdb_manager.js';
import { authManager } from '../auth.js';

class OrbitDBSecurityDashboard {
  /**
   * Create a new OrbitDB security dashboard component
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.container Container element for dashboard
   * @param {Object} options.resources Resource pool
   */
  constructor(options = {}) {
    this.container = options.container || document.createElement('div');
    this.resources = options.resources || {};
    this.auth = this.resources.auth || authManager;
    this.secureOrbitdb = this.resources.secureOrbitdb || secureOrbitdbManager;
    
    this.initialized = false;
    this.databases = {};
    this.principals = {};
    this.capabilities = {};
    this.stats = {};
    
    // Configuration
    this.config = {
      refreshInterval: options.refreshInterval || 5000,
      maxDatabasesToShow: options.maxDatabasesToShow || 10,
      maxCapabilitiesToShow: options.maxCapabilitiesToShow || 20,
      theme: options.theme || 'light',
      dateFormat: options.dateFormat || 'short',
      adminPrincipal: options.adminPrincipal || 'root'
    };
    
    // Event callbacks
    this.callbacks = {
      onCapabilityIssued: options.onCapabilityIssued || null,
      onCapabilityRevoked: options.onCapabilityRevoked || null,
      onDatabaseSelected: options.onDatabaseSelected || null,
      onPrincipalSelected: options.onPrincipalSelected || null,
      onError: options.onError || null,
    };
    
    // Setup container
    this.container.classList.add('orbitdb-security-dashboard');
    this.container.classList.add(`theme-${this.config.theme}`);
    
    // Create main dashboard sections
    this._createDashboardLayout();
    
    console.log('OrbitDB Security Dashboard initialized');
  }
  
  /**
   * Initialize the dashboard component
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Ensure secure OrbitDB manager is initialized
      if (!this.secureOrbitdb.initialized) {
        await this.secureOrbitdb.init();
      }
      
      // Fetch initial data
      await this._refreshData();
      
      // Setup event listeners
      this._setupEventListeners();
      
      // Start auto-refresh if enabled
      if (this.config.refreshInterval > 0) {
        this._startAutoRefresh();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize OrbitDB security dashboard:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      return false;
    }
  }
  
  /**
   * Render the dashboard UI
   */
  render() {
    if (!this.initialized) {
      console.warn('OrbitDB security dashboard not initialized. Call init() first');
      return;
    }
    
    this._renderStats();
    this._renderDatabases();
    this._renderPrincipals();
    this._renderCapabilities();
    this._renderTopResources();
  }
  
  /**
   * Refresh dashboard data and update UI
   * @returns {Promise<void>}
   */
  async refresh() {
    if (!this.initialized) {
      console.warn('OrbitDB security dashboard not initialized. Call init() first');
      return;
    }
    
    try {
      await this._refreshData();
      this.render();
    } catch (error) {
      console.error('Failed to refresh OrbitDB security dashboard:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }
  
  /**
   * Create a new capability for a principal
   * @param {string} principal Principal ID to grant capability to
   * @param {string} capability Capability to grant
   * @param {string} resource Resource the capability applies to
   * @returns {Promise<Object>} Capability token
   */
  async createCapability(principal, capability, resource) {
    if (!this.initialized) {
      throw new Error('OrbitDB security dashboard not initialized. Call init() first');
    }
    
    try {
      // Get admin token
      const adminToken = await this.auth.getAdminToken(this.config.adminPrincipal);
      
      // Issue capability
      const capabilityToken = await this.auth.issueCapability(
        this.config.adminPrincipal,
        principal,
        {
          can: capability,
          with: resource
        },
        { authToken: adminToken.token }
      );
      
      // Refresh data
      await this._refreshData();
      this.render();
      
      // Call callback if provided
      if (this.callbacks.onCapabilityIssued) {
        this.callbacks.onCapabilityIssued(capabilityToken);
      }
      
      return capabilityToken;
    } catch (error) {
      console.error('Failed to create capability:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Revoke a capability from a principal
   * @param {string} principal Principal ID to revoke capability from
   * @param {string} capabilityId Capability ID to revoke
   * @returns {Promise<boolean>} True if revocation successful
   */
  async revokeCapability(principal, capabilityId) {
    if (!this.initialized) {
      throw new Error('OrbitDB security dashboard not initialized. Call init() first');
    }
    
    try {
      // Get admin token
      const adminToken = await this.auth.getAdminToken(this.config.adminPrincipal);
      
      // Revoke capability
      const result = await this.auth.revokeCapability(
        principal,
        capabilityId,
        { authToken: adminToken.token }
      );
      
      // Refresh data
      await this._refreshData();
      this.render();
      
      // Call callback if provided
      if (this.callbacks.onCapabilityRevoked) {
        this.callbacks.onCapabilityRevoked({ principal, capabilityId });
      }
      
      return result;
    } catch (error) {
      console.error('Failed to revoke capability:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Select a database to display detailed information
   * @param {string} address OrbitDB database address
   */
  selectDatabase(address) {
    if (!this.initialized) {
      console.warn('OrbitDB security dashboard not initialized. Call init() first');
      return;
    }
    
    // Update selection state
    this.selectedDatabase = address;
    
    // Highlight selected database in UI
    const dbElements = this.container.querySelectorAll('.database-item');
    dbElements.forEach(el => {
      if (el.dataset.address === address) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
    
    // Display detailed view
    this._renderDatabaseDetails(address);
    
    // Call callback if provided
    if (this.callbacks.onDatabaseSelected) {
      this.callbacks.onDatabaseSelected(address);
    }
  }
  
  /**
   * Select a principal to display detailed information
   * @param {string} principalId Principal ID
   */
  selectPrincipal(principalId) {
    if (!this.initialized) {
      console.warn('OrbitDB security dashboard not initialized. Call init() first');
      return;
    }
    
    // Update selection state
    this.selectedPrincipal = principalId;
    
    // Highlight selected principal in UI
    const principalElements = this.container.querySelectorAll('.principal-item');
    principalElements.forEach(el => {
      if (el.dataset.id === principalId) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
    
    // Display detailed view
    this._renderPrincipalDetails(principalId);
    
    // Call callback if provided
    if (this.callbacks.onPrincipalSelected) {
      this.callbacks.onPrincipalSelected(principalId);
    }
  }
  
  /**
   * Set dashboard theme
   * @param {string} theme Theme name ('light' or 'dark')
   */
  setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn(`Invalid theme: ${theme}. Must be 'light' or 'dark'`);
      return;
    }
    
    this.config.theme = theme;
    this.container.classList.remove('theme-light', 'theme-dark');
    this.container.classList.add(`theme-${theme}`);
  }
  
  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * Start auto-refresh
   * @param {number} interval Refresh interval in milliseconds
   */
  startAutoRefresh(interval) {
    // Stop any existing timer
    this.stopAutoRefresh();
    
    // Set new interval if provided
    if (interval) {
      this.config.refreshInterval = interval;
    }
    
    // Start new timer
    if (this.config.refreshInterval > 0) {
      this._startAutoRefresh();
    }
  }
  
  /**
   * Create main dashboard layout
   * @private
   */
  _createDashboardLayout() {
    // Clear container
    this.container.innerHTML = '';
    
    // Create header
    const headerSection = document.createElement('div');
    headerSection.className = 'orbitdb-security-header';
    headerSection.innerHTML = `
      <h2>OrbitDB Security Dashboard</h2>
      <div class="refresh-controls">
        <button class="refresh-button">
          <span class="icon">↻</span> Refresh
        </button>
        <span class="last-updated">Last updated: Never</span>
      </div>
    `;
    this.container.appendChild(headerSection);
    
    // Create main sections
    
    // Stats section
    const statsSection = document.createElement('div');
    statsSection.className = 'section stats-section';
    statsSection.innerHTML = `
      <h3>Security Statistics</h3>
      <div class="stats-container">
        <div class="stat-loading">Loading stats...</div>
      </div>
    `;
    this.container.appendChild(statsSection);
    
    // Top resources section
    const topResourcesSection = document.createElement('div');
    topResourcesSection.className = 'section top-resources-section';
    topResourcesSection.innerHTML = `
      <h3>Top Resources</h3>
      <div class="top-resources-container">
        <div class="resource-loading">Loading resource usage...</div>
      </div>
    `;
    this.container.appendChild(topResourcesSection);
    
    // Two-column layout for databases and principals
    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'columns-container';
    
    // Databases section
    const databasesSection = document.createElement('div');
    databasesSection.className = 'section column databases-section';
    databasesSection.innerHTML = `
      <h3>Secure Databases</h3>
      <div class="search-box">
        <input type="text" placeholder="Search databases..." class="database-search">
      </div>
      <div class="databases-list">
        <div class="database-loading">Loading databases...</div>
      </div>
      <div class="database-details">
        <p class="select-prompt">Select a database to view details</p>
      </div>
    `;
    columnsContainer.appendChild(databasesSection);
    
    // Principals section
    const principalsSection = document.createElement('div');
    principalsSection.className = 'section column principals-section';
    principalsSection.innerHTML = `
      <h3>Principals</h3>
      <div class="search-box">
        <input type="text" placeholder="Search principals..." class="principal-search">
      </div>
      <div class="principals-list">
        <div class="principal-loading">Loading principals...</div>
      </div>
      <div class="principal-details">
        <p class="select-prompt">Select a principal to view details</p>
      </div>
    `;
    columnsContainer.appendChild(principalsSection);
    
    this.container.appendChild(columnsContainer);
    
    // Capabilities section
    const capabilitiesSection = document.createElement('div');
    capabilitiesSection.className = 'section capabilities-section';
    capabilitiesSection.innerHTML = `
      <h3>Capability Assignments</h3>
      <div class="capabilities-controls">
        <button class="new-capability-button">
          <span class="icon">+</span> New Capability
        </button>
        <div class="search-box">
          <input type="text" placeholder="Search capabilities..." class="capability-search">
        </div>
      </div>
      <div class="capabilities-list">
        <div class="capability-loading">Loading capabilities...</div>
      </div>
    `;
    this.container.appendChild(capabilitiesSection);
    
    // Create capability modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container hidden';
    modalContainer.innerHTML = `
      <div class="modal capability-modal">
        <div class="modal-header">
          <h3>Grant New Capability</h3>
          <button class="close-modal">✖</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="principal-select">Principal:</label>
            <select id="principal-select">
              <option value="">Select a principal...</option>
            </select>
          </div>
          <div class="form-group">
            <label for="capability-select">Capability:</label>
            <select id="capability-select">
              <option value="">Select a capability...</option>
              ${Object.values(ORBITDB_CAPABILITIES).map(cap => `<option value="${cap}">${cap}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="resource-input">Resource:</label>
            <input type="text" id="resource-input" placeholder="Resource (database address or name)">
            <div class="resource-options">
              <label><input type="radio" name="resource-type" value="specific" checked> Specific</label>
              <label><input type="radio" name="resource-type" value="wildcard"> Wildcard (*)</label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-button">Cancel</button>
          <button class="grant-button">Grant Capability</button>
        </div>
      </div>
    `;
    this.container.appendChild(modalContainer);
  }
  
  /**
   * Setup event listeners for UI interaction
   * @private
   */
  _setupEventListeners() {
    // Refresh button
    const refreshButton = this.container.querySelector('.refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refresh());
    }
    
    // Database search
    const databaseSearch = this.container.querySelector('.database-search');
    if (databaseSearch) {
      databaseSearch.addEventListener('input', () => {
        this._filterDatabases(databaseSearch.value);
      });
    }
    
    // Principal search
    const principalSearch = this.container.querySelector('.principal-search');
    if (principalSearch) {
      principalSearch.addEventListener('input', () => {
        this._filterPrincipals(principalSearch.value);
      });
    }
    
    // Capability search
    const capabilitySearch = this.container.querySelector('.capability-search');
    if (capabilitySearch) {
      capabilitySearch.addEventListener('input', () => {
        this._filterCapabilities(capabilitySearch.value);
      });
    }
    
    // New capability button
    const newCapabilityButton = this.container.querySelector('.new-capability-button');
    if (newCapabilityButton) {
      newCapabilityButton.addEventListener('click', () => {
        this._showNewCapabilityModal();
      });
    }
    
    // Close modal button
    const closeModalButton = this.container.querySelector('.close-modal');
    if (closeModalButton) {
      closeModalButton.addEventListener('click', () => {
        this._hideNewCapabilityModal();
      });
    }
    
    // Cancel button in modal
    const cancelButton = this.container.querySelector('.cancel-button');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        this._hideNewCapabilityModal();
      });
    }
    
    // Grant capability button in modal
    const grantButton = this.container.querySelector('.grant-button');
    if (grantButton) {
      grantButton.addEventListener('click', () => {
        this._handleCapabilityGrant();
      });
    }
    
    // Resource type radio buttons
    const resourceTypeRadios = this.container.querySelectorAll('input[name="resource-type"]');
    if (resourceTypeRadios.length) {
      resourceTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          const resourceInput = this.container.querySelector('#resource-input');
          if (radio.value === 'wildcard' && resourceInput) {
            resourceInput.value = '*';
            resourceInput.disabled = true;
          } else if (resourceInput) {
            resourceInput.disabled = false;
            if (resourceInput.value === '*') {
              resourceInput.value = '';
            }
          }
        });
      });
    }
  }
  
  /**
   * Start auto-refresh timer
   * @private
   */
  _startAutoRefresh() {
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, this.config.refreshInterval);
  }
  
  /**
   * Refresh dashboard data
   * @private
   * @returns {Promise<void>}
   */
  async _refreshData() {
    try {
      // Get admin token
      const adminToken = await this.auth.getAdminToken(this.config.adminPrincipal);
      
      // Fetch stats
      this.stats = await this.secureOrbitdb.getStats({ authToken: adminToken.token });
      
      // Fetch databases
      const databasesResult = await this.secureOrbitdb.listDatabases({ authToken: adminToken.token });
      this.databases = databasesResult.databases || {};
      
      // Fetch principals
      const principalsResult = await this.auth.listPrincipals({ authToken: adminToken.token });
      this.principals = principalsResult.principals || {};
      
      // Fetch capabilities
      const capabilitiesResult = await this.auth.listAllCapabilities({ authToken: adminToken.token });
      this.capabilities = capabilitiesResult.capabilities || {};
      
      // Update last updated timestamp
      const lastUpdatedElement = this.container.querySelector('.last-updated');
      if (lastUpdatedElement) {
        const formatter = new Intl.DateTimeFormat('en-US', { 
          dateStyle: this.config.dateFormat,
          timeStyle: 'medium'
        });
        lastUpdatedElement.textContent = `Last updated: ${formatter.format(new Date())}`;
      }
    } catch (error) {
      console.error('Failed to refresh dashboard data:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Render statistics section
   * @private
   */
  _renderStats() {
    const statsContainer = this.container.querySelector('.stats-container');
    if (!statsContainer) return;
    
    if (!this.stats || Object.keys(this.stats).length === 0) {
      statsContainer.innerHTML = '<div class="stat-loading">No stats available</div>';
      return;
    }
    
    const statsHtml = `
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-value">${this.stats.database_count || 0}</div>
          <div class="stat-label">Databases</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.stats.databases_created || 0}</div>
          <div class="stat-label">Created</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.stats.databases_opened || 0}</div>
          <div class="stat-label">Opened</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.stats.write_operations || 0}</div>
          <div class="stat-label">Writes</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.stats.read_operations || 0}</div>
          <div class="stat-label">Reads</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.stats.replication_events || 0}</div>
          <div class="stat-label">Replications</div>
        </div>
        <div class="stat-item">
          <div class="stat-value ${this.stats.access_granted > 0 ? 'positive' : ''}">${this.stats.access_granted || 0}</div>
          <div class="stat-label">Access Granted</div>
        </div>
        <div class="stat-item">
          <div class="stat-value ${this.stats.access_denied > 0 ? 'negative' : ''}">${this.stats.access_denied || 0}</div>
          <div class="stat-label">Access Denied</div>
        </div>
      </div>
    `;
    
    statsContainer.innerHTML = statsHtml;
  }
  
  /**
   * Render top resources section
   * @private
   */
  _renderTopResources() {
    const resourcesContainer = this.container.querySelector('.top-resources-container');
    if (!resourcesContainer) return;
    
    if (!this.stats || !this.stats.resource_usage) {
      resourcesContainer.innerHTML = '<div class="resource-loading">No resource data available</div>';
      return;
    }
    
    const { by_database: byDatabase, top_databases: topDatabases } = this.stats.resource_usage;
    
    if (!topDatabases || topDatabases.length === 0) {
      resourcesContainer.innerHTML = '<div class="resource-loading">No database usage data available</div>';
      return;
    }
    
    // Format resources for display
    const topDbsHtml = topDatabases.map(db => {
      const dbName = db.address.split('/').pop() || db.address;
      return `
        <div class="resource-item" data-address="${db.address}">
          <div class="resource-name" title="${db.address}">${dbName}</div>
          <div class="resource-metrics">
            <span class="metric reads" title="Reads">
              <span class="icon">📖</span> ${db.reads || 0}
            </span>
            <span class="metric writes" title="Writes">
              <span class="icon">✏️</span> ${db.writes || 0}
            </span>
            <span class="metric ops" title="Total Operations">
              <span class="icon">🔄</span> ${db.total_operations || 0}
            </span>
          </div>
          <div class="resource-last-access">
            Last: ${this._formatDate(db.last_access)}
          </div>
        </div>
      `;
    }).join('');
    
    resourcesContainer.innerHTML = `
      <div class="top-resources-header">
        <h4>Most Active Databases</h4>
      </div>
      <div class="top-resources-list">
        ${topDbsHtml}
      </div>
    `;
    
    // Add event listeners to resource items
    const resourceItems = resourcesContainer.querySelectorAll('.resource-item');
    resourceItems.forEach(item => {
      item.addEventListener('click', () => {
        const address = item.dataset.address;
        if (address) {
          this.selectDatabase(address);
        }
      });
    });
  }
  
  /**
   * Render databases section
   * @private
   */
  _renderDatabases() {
    const databasesList = this.container.querySelector('.databases-list');
    if (!databasesList) return;
    
    if (!this.databases || Object.keys(this.databases).length === 0) {
      databasesList.innerHTML = '<div class="database-loading">No databases available</div>';
      return;
    }
    
    // Sort databases by last used timestamp (most recent first)
    const sortedDatabases = Object.entries(this.databases)
      .sort(([, a], [, b]) => {
        const timeA = new Date(a.last_used || 0).getTime();
        const timeB = new Date(b.last_used || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, this.config.maxDatabasesToShow);
    
    const databasesHtml = sortedDatabases.map(([address, db]) => {
      const dbName = db.name || address.split('/').pop() || address;
      const isSelected = address === this.selectedDatabase;
      return `
        <div class="database-item ${isSelected ? 'selected' : ''}" data-address="${address}">
          <div class="database-name" title="${address}">${dbName}</div>
          <div class="database-type">${db.type || 'unknown'}</div>
          <div class="database-status ${db.closed ? 'closed' : 'open'}">
            ${db.closed ? 'Closed' : 'Open'}
          </div>
        </div>
      `;
    }).join('');
    
    databasesList.innerHTML = databasesHtml || '<div class="database-loading">No databases available</div>';
    
    // Add event listeners to database items
    const databaseItems = databasesList.querySelectorAll('.database-item');
    databaseItems.forEach(item => {
      item.addEventListener('click', () => {
        const address = item.dataset.address;
        if (address) {
          this.selectDatabase(address);
        }
      });
    });
    
    // If a database was previously selected, update its details
    if (this.selectedDatabase && this.databases[this.selectedDatabase]) {
      this._renderDatabaseDetails(this.selectedDatabase);
    }
  }
  
  /**
   * Render database details
   * @private
   * @param {string} address Database address
   */
  _renderDatabaseDetails(address) {
    const detailsContainer = this.container.querySelector('.database-details');
    if (!detailsContainer) return;
    
    if (!address || !this.databases[address]) {
      detailsContainer.innerHTML = '<p class="select-prompt">Select a database to view details</p>';
      return;
    }
    
    const db = this.databases[address];
    const dbName = db.name || address.split('/').pop() || address;
    
    // Find capabilities related to this database
    const dbCapabilities = Object.entries(this.capabilities)
      .filter(([, caps]) => {
        // Check for exact match or wildcard capabilities
        return caps.some(cap => {
          const resource = cap.with || '';
          return resource === dbName || 
                resource === address || 
                resource === '*';
        });
      })
      .slice(0, 5); // Limit to 5 principals for display
    
    const capabilitiesHtml = dbCapabilities.length > 0 ? 
      dbCapabilities.map(([principal, caps]) => {
        const principalName = this.principals[principal]?.name || principal;
        const capsList = caps
          .filter(cap => {
            const resource = cap.with || '';
            return resource === dbName || resource === address || resource === '*';
          })
          .map(cap => `<span class="cap-item">${cap.can}</span>`)
          .join('');
        
        return `
          <div class="db-capability">
            <span class="cap-principal">${principalName}</span>
            <div class="cap-list">${capsList}</div>
          </div>
        `;
      }).join('') : 
      '<p>No capabilities assigned</p>';
    
    // Get usage statistics if available
    let usageStats = {};
    if (this.stats && this.stats.resource_usage && this.stats.resource_usage.by_database) {
      usageStats = this.stats.resource_usage.by_database[address] || {};
    }
    
    detailsContainer.innerHTML = `
      <h4 class="db-detail-name" title="${address}">${dbName}</h4>
      <div class="db-detail-address">${address}</div>
      
      <div class="db-detail-section">
        <h5>Properties</h5>
        <div class="db-detail-props">
          <div class="db-detail-prop">
            <span class="prop-label">Type:</span>
            <span class="prop-value">${db.type || 'unknown'}</span>
          </div>
          <div class="db-detail-prop">
            <span class="prop-label">Status:</span>
            <span class="prop-value ${db.closed ? 'closed' : 'open'}">${db.closed ? 'Closed' : 'Open'}</span>
          </div>
          <div class="db-detail-prop">
            <span class="prop-label">Created:</span>
            <span class="prop-value">${this._formatDate(db.created_at)}</span>
          </div>
          <div class="db-detail-prop">
            <span class="prop-label">Last Used:</span>
            <span class="prop-value">${this._formatDate(db.last_used)}</span>
          </div>
          <div class="db-detail-prop">
            <span class="prop-label">Created By:</span>
            <span class="prop-value">${db.created_by || 'unknown'}</span>
          </div>
        </div>
      </div>
      
      <div class="db-detail-section">
        <h5>Usage Statistics</h5>
        <div class="db-detail-stats">
          <div class="db-stat">
            <span class="stat-label">Writes:</span>
            <span class="stat-value">${usageStats.writes || 0}</span>
          </div>
          <div class="db-stat">
            <span class="stat-label">Reads:</span>
            <span class="stat-value">${usageStats.reads || 0}</span>
          </div>
          <div class="db-stat">
            <span class="stat-label">Opens:</span>
            <span class="stat-value">${usageStats.opens || 0}</span>
          </div>
          <div class="db-stat">
            <span class="stat-label">Replications:</span>
            <span class="stat-value">${usageStats.replications || 0}</span>
          </div>
        </div>
      </div>
      
      <div class="db-detail-section">
        <h5>Assigned Capabilities</h5>
        <div class="db-detail-capabilities">
          ${capabilitiesHtml}
        </div>
      </div>
      
      <div class="db-detail-actions">
        <button class="add-capability-button" data-resource="${address}">
          <span class="icon">+</span> Add Capability
        </button>
      </div>
    `;
    
    // Add event listener to the add capability button
    const addCapabilityButton = detailsContainer.querySelector('.add-capability-button');
    if (addCapabilityButton) {
      addCapabilityButton.addEventListener('click', () => {
        this._showNewCapabilityModal(addCapabilityButton.dataset.resource);
      });
    }
  }
  
  /**
   * Render principals section
   * @private
   */
  _renderPrincipals() {
    const principalsList = this.container.querySelector('.principals-list');
    if (!principalsList) return;
    
    if (!this.principals || Object.keys(this.principals).length === 0) {
      principalsList.innerHTML = '<div class="principal-loading">No principals available</div>';
      return;
    }
    
    // Sort principals by creation date (most recent first)
    const sortedPrincipals = Object.entries(this.principals)
      .sort(([, a], [, b]) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, this.config.maxDatabasesToShow);
    
    const principalsHtml = sortedPrincipals.map(([id, principal]) => {
      const isSelected = id === this.selectedPrincipal;
      const capCount = this.capabilities[id]?.length || 0;
      
      return `
        <div class="principal-item ${isSelected ? 'selected' : ''}" data-id="${id}">
          <div class="principal-name" title="${id}">${principal.name || id}</div>
          <div class="principal-caps">
            ${capCount} capabilities
          </div>
          <div class="principal-created">
            ${this._formatDate(principal.created_at)}
          </div>
        </div>
      `;
    }).join('');
    
    principalsList.innerHTML = principalsHtml || '<div class="principal-loading">No principals available</div>';
    
    // Add event listeners to principal items
    const principalItems = principalsList.querySelectorAll('.principal-item');
    principalItems.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id) {
          this.selectPrincipal(id);
        }
      });
    });
    
    // If a principal was previously selected, update its details
    if (this.selectedPrincipal && this.principals[this.selectedPrincipal]) {
      this._renderPrincipalDetails(this.selectedPrincipal);
    }
  }
  
  /**
   * Render principal details
   * @private
   * @param {string} principalId Principal ID
   */
  _renderPrincipalDetails(principalId) {
    const detailsContainer = this.container.querySelector('.principal-details');
    if (!detailsContainer) return;
    
    if (!principalId || !this.principals[principalId]) {
      detailsContainer.innerHTML = '<p class="select-prompt">Select a principal to view details</p>';
      return;
    }
    
    const principal = this.principals[principalId];
    const principalName = principal.name || principalId;
    
    // Get capabilities for this principal
    const principalCapabilities = this.capabilities[principalId] || [];
    
    // Group capabilities by type
    const groupedCapabilities = {};
    principalCapabilities.forEach(cap => {
      const capability = cap.can || '';
      if (!groupedCapabilities[capability]) {
        groupedCapabilities[capability] = [];
      }
      groupedCapabilities[capability].push(cap);
    });
    
    // Generate capabilities HTML
    const capabilitiesHtml = Object.entries(groupedCapabilities).length > 0 ? 
      Object.entries(groupedCapabilities).map(([capability, caps]) => {
        const resourcesList = caps.map(cap => {
          const resource = cap.with || '';
          const isWildcard = resource === '*';
          return `
            <div class="principal-resource-item ${isWildcard ? 'wildcard' : ''}">
              <span class="resource-name">${resource}</span>
              <button class="revoke-button" data-id="${cap.id || ''}" data-principal="${principalId}" title="Revoke capability">×</button>
            </div>
          `;
        }).join('');
        
        return `
          <div class="principal-capability-group">
            <h6 class="capability-type">${capability}</h6>
            <div class="principal-resource-list">
              ${resourcesList}
            </div>
          </div>
        `;
      }).join('') : 
      '<p>No capabilities assigned</p>';
    
    // Get usage statistics if available
    let usageStats = {};
    if (this.stats && this.stats.resource_usage && this.stats.resource_usage.by_user) {
      usageStats = this.stats.resource_usage.by_user[principalId] || {};
    }
    
    // Format databases used by this principal
    const databasesUsed = Array.isArray(usageStats.databases) ? usageStats.databases.length : 0;
    
    detailsContainer.innerHTML = `
      <h4 class="principal-detail-name" title="${principalId}">${principalName}</h4>
      <div class="principal-detail-id">${principalId}</div>
      
      <div class="principal-detail-section">
        <h5>Properties</h5>
        <div class="principal-detail-props">
          <div class="principal-detail-prop">
            <span class="prop-label">Created:</span>
            <span class="prop-value">${this._formatDate(principal.created_at)}</span>
          </div>
          <div class="principal-detail-prop">
            <span class="prop-label">Type:</span>
            <span class="prop-value">${principal.type || 'normal'}</span>
          </div>
          ${principal.description ? `
          <div class="principal-detail-prop">
            <span class="prop-label">Description:</span>
            <span class="prop-value">${principal.description}</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      <div class="principal-detail-section">
        <h5>Usage Statistics</h5>
        <div class="principal-detail-stats">
          <div class="principal-stat">
            <span class="stat-label">Writes:</span>
            <span class="stat-value">${usageStats.writes || 0}</span>
          </div>
          <div class="principal-stat">
            <span class="stat-label">Reads:</span>
            <span class="stat-value">${usageStats.reads || 0}</span>
          </div>
          <div class="principal-stat">
            <span class="stat-label">Creates:</span>
            <span class="stat-value">${usageStats.creates || 0}</span>
          </div>
          <div class="principal-stat">
            <span class="stat-label">Databases:</span>
            <span class="stat-value">${databasesUsed}</span>
          </div>
        </div>
      </div>
      
      <div class="principal-detail-section">
        <h5>Assigned Capabilities</h5>
        <div class="principal-detail-capabilities">
          ${capabilitiesHtml}
        </div>
      </div>
      
      <div class="principal-detail-actions">
        <button class="add-capability-button" data-principal="${principalId}">
          <span class="icon">+</span> Add Capability
        </button>
      </div>
    `;
    
    // Add event listener to the add capability button
    const addCapabilityButton = detailsContainer.querySelector('.add-capability-button');
    if (addCapabilityButton) {
      addCapabilityButton.addEventListener('click', () => {
        this._showNewCapabilityModal(null, addCapabilityButton.dataset.principal);
      });
    }
    
    // Add event listeners to revoke buttons
    const revokeButtons = detailsContainer.querySelectorAll('.revoke-button');
    revokeButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        const capabilityId = button.dataset.id;
        const principal = button.dataset.principal;
        
        if (capabilityId && principal) {
          if (confirm('Are you sure you want to revoke this capability?')) {
            try {
              await this.revokeCapability(principal, capabilityId);
              // Refresh will be called by the revokeCapability method
            } catch (error) {
              console.error('Failed to revoke capability:', error);
              if (this.callbacks.onError) {
                this.callbacks.onError(error);
              }
            }
          }
        }
      });
    });
  }
  
  /**
   * Render capabilities section
   * @private
   */
  _renderCapabilities() {
    const capabilitiesList = this.container.querySelector('.capabilities-list');
    if (!capabilitiesList) return;
    
    if (!this.capabilities || Object.keys(this.capabilities).length === 0) {
      capabilitiesList.innerHTML = '<div class="capability-loading">No capabilities available</div>';
      return;
    }
    
    // Flatten capabilities for display
    const flatCapabilities = [];
    Object.entries(this.capabilities).forEach(([principal, caps]) => {
      caps.forEach(cap => {
        flatCapabilities.push({
          principal,
          principalName: this.principals[principal]?.name || principal,
          id: cap.id || '',
          capability: cap.can || '',
          resource: cap.with || '',
          issuedAt: cap.iat || '',
          expiresAt: cap.exp || ''
        });
      });
    });
    
    // Sort capabilities by issuance date (most recent first)
    flatCapabilities.sort((a, b) => {
      const timeA = new Date(a.issuedAt || 0).getTime();
      const timeB = new Date(b.issuedAt || 0).getTime();
      return timeB - timeA;
    });
    
    // Take only the first N capabilities
    const limitedCapabilities = flatCapabilities.slice(0, this.config.maxCapabilitiesToShow);
    
    const capabilitiesHtml = limitedCapabilities.map(cap => {
      const isExpired = cap.expiresAt && new Date(cap.expiresAt) < new Date();
      const isWildcard = cap.resource === '*';
      
      return `
        <div class="capability-item ${isExpired ? 'expired' : ''}" data-id="${cap.id}" data-principal="${cap.principal}">
          <div class="capability-principal" title="${cap.principal}">${cap.principalName}</div>
          <div class="capability-type">${cap.capability}</div>
          <div class="capability-resource ${isWildcard ? 'wildcard' : ''}" title="${cap.resource}">
            ${cap.resource}
          </div>
          <div class="capability-issued">
            ${this._formatDate(cap.issuedAt)}
          </div>
          <div class="capability-actions">
            <button class="revoke-capability-button" data-id="${cap.id}" data-principal="${cap.principal}" title="Revoke capability">
              Revoke
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    capabilitiesList.innerHTML = capabilitiesHtml || '<div class="capability-loading">No capabilities available</div>';
    
    // Add event listeners to capability items
    const capabilityItems = capabilitiesList.querySelectorAll('.capability-item');
    capabilityItems.forEach(item => {
      item.addEventListener('click', () => {
        const principalId = item.dataset.principal;
        if (principalId) {
          this.selectPrincipal(principalId);
        }
      });
    });
    
    // Add event listeners to revoke buttons
    const revokeButtons = capabilitiesList.querySelectorAll('.revoke-capability-button');
    revokeButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        const capabilityId = button.dataset.id;
        const principal = button.dataset.principal;
        
        if (capabilityId && principal) {
          if (confirm('Are you sure you want to revoke this capability?')) {
            try {
              await this.revokeCapability(principal, capabilityId);
              // Refresh will be called by the revokeCapability method
            } catch (error) {
              console.error('Failed to revoke capability:', error);
              if (this.callbacks.onError) {
                this.callbacks.onError(error);
              }
            }
          }
        }
      });
    });
  }
  
  /**
   * Filter databases by search term
   * @private
   * @param {string} searchTerm Search term
   */
  _filterDatabases(searchTerm) {
    if (!searchTerm) {
      // If search term is empty, show all databases
      this._renderDatabases();
      return;
    }
    
    const databasesList = this.container.querySelector('.databases-list');
    if (!databasesList) return;
    
    const searchTermLower = searchTerm.toLowerCase();
    
    // Filter database items
    const databaseItems = databasesList.querySelectorAll('.database-item');
    databaseItems.forEach(item => {
      const database = this.databases[item.dataset.address] || {};
      const dbName = database.name || item.dataset.address.split('/').pop() || item.dataset.address;
      
      if (
        dbName.toLowerCase().includes(searchTermLower) ||
        item.dataset.address.toLowerCase().includes(searchTermLower) ||
        (database.type && database.type.toLowerCase().includes(searchTermLower))
      ) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }
  
  /**
   * Filter principals by search term
   * @private
   * @param {string} searchTerm Search term
   */
  _filterPrincipals(searchTerm) {
    if (!searchTerm) {
      // If search term is empty, show all principals
      this._renderPrincipals();
      return;
    }
    
    const principalsList = this.container.querySelector('.principals-list');
    if (!principalsList) return;
    
    const searchTermLower = searchTerm.toLowerCase();
    
    // Filter principal items
    const principalItems = principalsList.querySelectorAll('.principal-item');
    principalItems.forEach(item => {
      const principal = this.principals[item.dataset.id] || {};
      const principalName = principal.name || item.dataset.id;
      
      if (
        principalName.toLowerCase().includes(searchTermLower) ||
        item.dataset.id.toLowerCase().includes(searchTermLower)
      ) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }
  
  /**
   * Filter capabilities by search term
   * @private
   * @param {string} searchTerm Search term
   */
  _filterCapabilities(searchTerm) {
    if (!searchTerm) {
      // If search term is empty, show all capabilities
      this._renderCapabilities();
      return;
    }
    
    const capabilitiesList = this.container.querySelector('.capabilities-list');
    if (!capabilitiesList) return;
    
    const searchTermLower = searchTerm.toLowerCase();
    
    // Filter capability items
    const capabilityItems = capabilitiesList.querySelectorAll('.capability-item');
    capabilityItems.forEach(item => {
      const principal = this.principals[item.dataset.principal] || {};
      const principalName = principal.name || item.dataset.principal;
      const capabilityType = item.querySelector('.capability-type')?.textContent || '';
      const resource = item.querySelector('.capability-resource')?.textContent || '';
      
      if (
        principalName.toLowerCase().includes(searchTermLower) ||
        item.dataset.principal.toLowerCase().includes(searchTermLower) ||
        capabilityType.toLowerCase().includes(searchTermLower) ||
        resource.toLowerCase().includes(searchTermLower)
      ) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }
  
  /**
   * Show new capability modal
   * @private
   * @param {string} resource Optional pre-selected resource
   * @param {string} principal Optional pre-selected principal
   */
  _showNewCapabilityModal(resource = null, principal = null) {
    const modalContainer = this.container.querySelector('.modal-container');
    if (!modalContainer) return;
    
    // Show modal
    modalContainer.classList.remove('hidden');
    
    // Populate principal select
    const principalSelect = modalContainer.querySelector('#principal-select');
    if (principalSelect) {
      principalSelect.innerHTML = '<option value="">Select a principal...</option>';
      
      if (this.principals && Object.keys(this.principals).length > 0) {
        Object.entries(this.principals).forEach(([id, p]) => {
          const principalName = p.name || id;
          principalSelect.innerHTML += `<option value="${id}" ${id === principal ? 'selected' : ''}>${principalName}</option>`;
        });
      }
    }
    
    // Set resource if provided
    const resourceInput = modalContainer.querySelector('#resource-input');
    if (resourceInput && resource) {
      resourceInput.value = resource;
    }
    
    // If wildcard is set, disable resource input
    const wildcardRadio = modalContainer.querySelector('input[name="resource-type"][value="wildcard"]');
    if (wildcardRadio) {
      if (resource === '*') {
        wildcardRadio.checked = true;
        if (resourceInput) {
          resourceInput.value = '*';
          resourceInput.disabled = true;
        }
      } else {
        const specificRadio = modalContainer.querySelector('input[name="resource-type"][value="specific"]');
        if (specificRadio) {
          specificRadio.checked = true;
        }
        if (resourceInput) {
          resourceInput.disabled = false;
        }
      }
    }
  }
  
  /**
   * Hide new capability modal
   * @private
   */
  _hideNewCapabilityModal() {
    const modalContainer = this.container.querySelector('.modal-container');
    if (!modalContainer) return;
    
    // Hide modal
    modalContainer.classList.add('hidden');
  }
  
  /**
   * Handle capability grant
   * @private
   */
  async _handleCapabilityGrant() {
    const modalContainer = this.container.querySelector('.modal-container');
    if (!modalContainer) return;
    
    // Get form values
    const principalSelect = modalContainer.querySelector('#principal-select');
    const capabilitySelect = modalContainer.querySelector('#capability-select');
    const resourceInput = modalContainer.querySelector('#resource-input');
    const wildcardRadio = modalContainer.querySelector('input[name="resource-type"][value="wildcard"]');
    
    const principal = principalSelect?.value;
    const capability = capabilitySelect?.value;
    let resource = resourceInput?.value;
    
    // Check if wildcard is selected
    if (wildcardRadio?.checked) {
      resource = '*';
    }
    
    // Validate input
    if (!principal) {
      alert('Please select a principal');
      return;
    }
    
    if (!capability) {
      alert('Please select a capability');
      return;
    }
    
    if (!resource) {
      alert('Please enter a resource or select wildcard');
      return;
    }
    
    try {
      // Create capability
      await this.createCapability(principal, capability, resource);
      
      // Hide modal
      this._hideNewCapabilityModal();
      
      // Refresh will be called by createCapability
    } catch (error) {
      console.error('Failed to create capability:', error);
      alert(`Failed to create capability: ${error.message}`);
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }
  
  /**
   * Format date for display
   * @private
   * @param {string} dateString Date string
   * @returns {string} Formatted date
   */
  _formatDate(dateString) {
    if (!dateString) return 'unknown';
    
    try {
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        return dateString;
      }
      
      const formatter = new Intl.DateTimeFormat('en-US', { 
        dateStyle: this.config.dateFormat,
        timeStyle: 'short'
      });
      
      return formatter.format(date);
    } catch (error) {
      return dateString;
    }
  }
}

export { OrbitDBSecurityDashboard };
export default OrbitDBSecurityDashboard;