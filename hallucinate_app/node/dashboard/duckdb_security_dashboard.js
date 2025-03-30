/**
 * DuckDB-IPLD Security Dashboard Component
 * 
 * Provides UI for monitoring and managing DuckDB-IPLD security
 * Shows database access patterns, capability assignments, and resource usage
 */

import { secureDuckDBIPLDManager, DUCKDB_IPLD_CAPABILITIES } from '../secure_duckdb_ipld_manager.js';
import { authManager } from '../auth.js';

/**
 * DuckDB-IPLD Security Dashboard
 * Manages visualization of DuckDB-IPLD security settings and usage patterns
 */
class DuckDBSecurityDashboard {
  /**
   * Create a new DuckDBSecurityDashboard
   * @param {Object} config Dashboard configuration
   */
  constructor(config = {}) {
    this.config = {
      containerId: config.containerId || 'duckdb-security-dashboard',
      refreshInterval: config.refreshInterval || 5000, // milliseconds
      theme: config.theme || 'light',
      ...config
    };
    
    this.manager = config.manager || secureDuckDBIPLDManager;
    this.auth = config.auth || authManager;
    
    this.statsData = null;
    this.principalsData = null;
    this.capabilities = DUCKDB_IPLD_CAPABILITIES;
    
    this.refreshTimer = null;
    this.initialized = false;
    
    console.log('DuckDB-IPLD Security Dashboard constructed');
  }
  
  /**
   * Initialize the dashboard
   * @returns {Promise<boolean>} Initialization status
   */
  async init() {
    try {
      if (!this.manager.initialized) {
        await this.manager.init();
      }
      
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize DuckDB-IPLD Security Dashboard:', error);
      return false;
    }
  }
  
  /**
   * Render the dashboard into the container
   */
  render() {
    if (!this.initialized) {
      console.warn('DuckDB-IPLD Security Dashboard not initialized. Call init() first.');
      return;
    }
    
    const container = document.getElementById(this.config.containerId);
    if (!container) {
      console.error(`Container with ID "${this.config.containerId}" not found.`);
      return;
    }
    
    // Create dashboard structure
    container.innerHTML = `
      <div class="duckdb-security-dashboard ${this.config.theme}">
        <div class="dashboard-header">
          <h2>DuckDB-IPLD Security Dashboard</h2>
          <div class="dashboard-controls">
            <button id="duckdb-refresh-btn" class="btn refresh-btn">Refresh</button>
            <select id="duckdb-theme-select" class="theme-select">
              <option value="light" ${this.config.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${this.config.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
          </div>
        </div>
        
        <div class="dashboard-statistics">
          <h3>Security Statistics</h3>
          <div id="duckdb-stats-container" class="stats-container">
            <div class="stats-loading">Loading statistics...</div>
          </div>
        </div>
        
        <div class="dashboard-tables">
          <h3>Database Tables</h3>
          <div id="duckdb-tables-container" class="tables-container">
            <div class="tables-loading">Loading tables...</div>
          </div>
        </div>
        
        <div class="dashboard-capabilities">
          <h3>Capability Management</h3>
          <div class="capability-actions">
            <select id="duckdb-principal-select" class="principal-select">
              <option value="">Select Principal...</option>
            </select>
            <select id="duckdb-capability-select" class="capability-select">
              <option value="">Select Capability...</option>
              ${Object.entries(this.capabilities).map(([key, value]) => 
                `<option value="${value}">${key}: ${value}</option>`
              ).join('')}
            </select>
            <input id="duckdb-resource-input" class="resource-input" placeholder="Resource (table name or '*')">
            <button id="duckdb-grant-btn" class="btn grant-btn">Grant</button>
          </div>
          <div id="duckdb-capabilities-container" class="capabilities-container">
            <div class="capabilities-loading">Loading capabilities...</div>
          </div>
        </div>
        
        <div class="dashboard-resource-usage">
          <h3>Resource Usage</h3>
          <div id="duckdb-resource-container" class="resource-container">
            <div class="resource-loading">Loading resource usage...</div>
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners
    document.getElementById('duckdb-refresh-btn').addEventListener('click', () => this.refreshData());
    document.getElementById('duckdb-theme-select').addEventListener('change', (e) => this.setTheme(e.target.value));
    document.getElementById('duckdb-grant-btn').addEventListener('click', () => this.grantCapability());
    
    // Start auto-refresh
    this.startAutoRefresh();
    
    // Load initial data
    this.refreshData();
  }
  
  /**
   * Set dashboard theme
   * @param {string} theme Theme name (light or dark)
   */
  setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn(`Invalid theme: ${theme}`);
      return;
    }
    
    this.config.theme = theme;
    
    const dashboard = document.querySelector('.duckdb-security-dashboard');
    if (dashboard) {
      dashboard.classList.remove('light', 'dark');
      dashboard.classList.add(theme);
    }
  }
  
  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(() => {
      this.refreshData();
    }, this.config.refreshInterval);
  }
  
  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * Refresh dashboard data
   */
  async refreshData() {
    try {
      // Get admin token
      const adminToken = await this.auth.issueCapability('root', 'admin', {
        can: this.capabilities.ADMIN,
        with: '*'
      });
      
      // Fetch statistics
      this.statsData = await this.manager.getStats({ authToken: adminToken.token });
      
      // Fetch principals
      this.principalsData = await this.auth.listPrincipals();
      
      // Update dashboard
      this.updateStatistics();
      this.updateTables();
      this.updateCapabilities();
      this.updateResourceUsage();
      this.updatePrincipalSelect();
    } catch (error) {
      console.error('Failed to refresh DuckDB-IPLD Security Dashboard data:', error);
    }
  }
  
  /**
   * Update statistics panel
   */
  updateStatistics() {
    if (!this.statsData) return;
    
    const container = document.getElementById('duckdb-stats-container');
    if (!container) return;
    
    const {
      accessGranted,
      accessDenied,
      queriesExecuted,
      tablesCreated,
      tableReads,
      tableWrites,
      ipldExports,
      ipldImports,
      parquetExports,
      parquetImports,
      arrowExports,
      arrowImports,
      tableCount,
      queryCount
    } = this.statsData;
    
    // Calculate success rate
    const totalAccess = accessGranted + accessDenied;
    const successRate = totalAccess > 0 ? ((accessGranted / totalAccess) * 100).toFixed(1) : '100.0';
    
    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${accessGranted}</div>
          <div class="stat-label">Access Granted</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${accessDenied}</div>
          <div class="stat-label">Access Denied</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${successRate}%</div>
          <div class="stat-label">Success Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${queriesExecuted}</div>
          <div class="stat-label">Queries Executed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tablesCreated}</div>
          <div class="stat-label">Tables Created</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tableCount || 0}</div>
          <div class="stat-label">Active Tables</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tableReads}</div>
          <div class="stat-label">Table Reads</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tableWrites}</div>
          <div class="stat-label">Table Writes</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${ipldExports + ipldImports}</div>
          <div class="stat-label">IPLD Operations</div>
        </div>
      </div>
    `;
  }
  
  /**
   * Update tables panel
   */
  updateTables() {
    if (!this.statsData || !this.statsData.resourceUsage) return;
    
    const container = document.getElementById('duckdb-tables-container');
    if (!container) return;
    
    const { topTables } = this.statsData.resourceUsage;
    
    if (!topTables || topTables.length === 0) {
      container.innerHTML = '<div class="no-data">No tables found</div>';
      return;
    }
    
    // Create table
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Table Name</th>
            <th>Reads</th>
            <th>Writes</th>
            <th>Total Operations</th>
            <th>Last Access</th>
          </tr>
        </thead>
        <tbody>
          ${topTables.map(table => `
            <tr>
              <td>${table.name}</td>
              <td>${table.reads}</td>
              <td>${table.writes}</td>
              <td>${table.totalOperations}</td>
              <td>${this._formatDate(table.lastAccess)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  /**
   * Update capabilities panel
   */
  updateCapabilities() {
    if (!this.principalsData) return;
    
    const container = document.getElementById('duckdb-capabilities-container');
    if (!container) return;
    
    // Filter capabilities related to DuckDB
    const duckdbCapabilities = [];
    
    for (const principal of Object.values(this.principalsData)) {
      if (principal.capabilities) {
        for (const cap of principal.capabilities) {
          if (Object.values(this.capabilities).some(c => cap.capability.startsWith(c))) {
            duckdbCapabilities.push({
              principal: principal.id,
              ...cap
            });
          }
        }
      }
    }
    
    if (duckdbCapabilities.length === 0) {
      container.innerHTML = '<div class="no-data">No DuckDB-IPLD capabilities found</div>';
      return;
    }
    
    // Create table
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Principal</th>
            <th>Capability</th>
            <th>Resource</th>
            <th>Issued At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${duckdbCapabilities.map(cap => {
            const [capability, resource] = cap.capability.split(':');
            return `
              <tr>
                <td>${cap.principal}</td>
                <td>${capability}</td>
                <td>${resource || '*'}</td>
                <td>${this._formatDate(cap.issuedAt)}</td>
                <td>
                  <button class="btn delete-btn" data-principal="${cap.principal}" data-capability="${cap.capability}">Revoke</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    
    // Add event listeners for revoke buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const principal = e.target.dataset.principal;
        const capability = e.target.dataset.capability;
        this.revokeCapability(principal, capability);
      });
    });
  }
  
  /**
   * Update resource usage panel
   */
  updateResourceUsage() {
    if (!this.statsData || !this.statsData.resourceUsage) return;
    
    const container = document.getElementById('duckdb-resource-container');
    if (!container) return;
    
    const { byUser } = this.statsData.resourceUsage;
    
    if (!byUser || Object.keys(byUser).length === 0) {
      container.innerHTML = '<div class="no-data">No resource usage data found</div>';
      return;
    }
    
    // Create table
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Tables Used</th>
            <th>Queries</th>
            <th>Reads</th>
            <th>Writes</th>
            <th>Exports</th>
            <th>Imports</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(byUser).map(([userId, stats]) => {
            const tableCount = Array.isArray(stats.tables) ? stats.tables.length : 0;
            const exports = (stats.exports?.ipld || 0) + (stats.exports?.parquet || 0) + (stats.exports?.arrow || 0);
            const imports = (stats.imports?.ipld || 0) + (stats.imports?.parquet || 0) + (stats.imports?.arrow || 0);
            
            return `
              <tr>
                <td>${userId}</td>
                <td>${tableCount}</td>
                <td>${stats.creates + stats.reads + stats.writes}</td>
                <td>${stats.reads}</td>
                <td>${stats.writes}</td>
                <td>${exports}</td>
                <td>${imports}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
  
  /**
   * Update principal select dropdown
   */
  updatePrincipalSelect() {
    if (!this.principalsData) return;
    
    const select = document.getElementById('duckdb-principal-select');
    if (!select) return;
    
    // Store current selection
    const currentValue = select.value;
    
    // Clear and rebuild options
    select.innerHTML = '<option value="">Select Principal...</option>';
    
    // Add options for each principal
    Object.values(this.principalsData).forEach(principal => {
      const option = document.createElement('option');
      option.value = principal.id;
      option.textContent = principal.id;
      select.appendChild(option);
    });
    
    // Restore previous selection if it still exists
    if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
      select.value = currentValue;
    }
  }
  
  /**
   * Grant a capability to a principal
   */
  async grantCapability() {
    const principalSelect = document.getElementById('duckdb-principal-select');
    const capabilitySelect = document.getElementById('duckdb-capability-select');
    const resourceInput = document.getElementById('duckdb-resource-input');
    
    const principal = principalSelect.value;
    const capability = capabilitySelect.value;
    const resource = resourceInput.value.trim() || '*';
    
    if (!principal) {
      alert('Please select a principal');
      return;
    }
    
    if (!capability) {
      alert('Please select a capability');
      return;
    }
    
    try {
      await this.auth.issueCapability('root', principal, {
        can: capability,
        with: resource
      });
      
      // Refresh data
      this.refreshData();
      
      // Clear inputs
      resourceInput.value = '';
      
      // Show success message
      alert(`Capability ${capability}:${resource} granted to ${principal}`);
    } catch (error) {
      console.error('Failed to grant capability:', error);
      alert(`Failed to grant capability: ${error.message}`);
    }
  }
  
  /**
   * Revoke a capability from a principal
   * @param {string} principal Principal ID
   * @param {string} capability Capability string
   */
  async revokeCapability(principal, capability) {
    try {
      await this.auth.revokeCapability(principal, capability);
      
      // Refresh data
      this.refreshData();
      
      // Show success message
      alert(`Capability ${capability} revoked from ${principal}`);
    } catch (error) {
      console.error('Failed to revoke capability:', error);
      alert(`Failed to revoke capability: ${error.message}`);
    }
  }
  
  /**
   * Format a date string for display
   * @private
   * @param {string} dateString ISO date string
   * @returns {string} Formatted date
   */
  _formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (error) {
      return dateString;
    }
  }
}

export { DuckDBSecurityDashboard };
export default DuckDBSecurityDashboard;