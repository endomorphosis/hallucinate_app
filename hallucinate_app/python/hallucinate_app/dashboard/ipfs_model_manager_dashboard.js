/**
 * IPFS Model Manager Dashboard Component
 * 
 * JavaScript UI component for the IPFS Model Manager dashboard
 */

class IPFSModelManagerDashboard {
  /**
   * Initialize the dashboard component
   * 
   * @param {Object} options - Dashboard options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} options.bridge - Python bridge
   * @param {Function} options.onEvent - Event callback
   * @param {Object} options.theme - Theme configuration
   */
  constructor(options = {}) {
    this.container = options.container || document.createElement('div');
    this.bridge = options.bridge || null;
    this.onEvent = options.onEvent || (() => {});
    this.theme = options.theme || {
      primary: '#6200ea',
      secondary: '#03dac6',
      background: '#121212',
      surface: '#1e1e1e',
      text: '#ffffff',
      error: '#cf6679'
    };
    
    // Panel state
    this.state = {
      connected: false,
      models: {},
      models_count: 0,
      stats: {
        models_imported: 0,
        total_size_bytes: 0,
        ipfs_models: 0,
        huggingface_models: 0
      },
      operations: [],
      lastUpdated: null,
      loading: false
    };
    
    // Operation in progress
    this.operationInProgress = false;
    
    // Tracking auto-refresh
    this.refreshInterval = null;
    this.refreshRate = 5000; // ms
    
    // Initialize UI
    this.initUI();
  }
  
  /**
   * Initialize the dashboard UI
   */
  initUI() {
    // Apply container styling
    this.container.className = 'ipfs-model-manager-dashboard';
    this.container.style.fontFamily = 'Arial, sans-serif';
    this.container.style.color = this.theme.text;
    this.container.style.padding = '16px';
    
    // Create dashboard structure
    this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>IPFS Model Manager</h2>
        <div class="connection-status">
          <span class="status-indicator"></span>
          <span class="status-text">Disconnected</span>
        </div>
      </div>
      
      <div class="dashboard-controls">
        <button id="refresh-btn" class="dashboard-button">Refresh</button>
        <button id="auto-refresh-btn" class="dashboard-button">Auto-refresh: ON</button>
      </div>
      
      <div class="dashboard-stats">
        <div class="stat-box">
          <h3>Models</h3>
          <div class="stat-value" id="models-count">0</div>
        </div>
        <div class="stat-box">
          <h3>IPFS Models</h3>
          <div class="stat-value" id="ipfs-models">0</div>
        </div>
        <div class="stat-box">
          <h3>HuggingFace Models</h3>
          <div class="stat-value" id="hf-models">0</div>
        </div>
        <div class="stat-box">
          <h3>Total Size</h3>
          <div class="stat-value" id="total-size">0 B</div>
        </div>
      </div>
      
      <div class="dashboard-content">
        <div class="tab-container">
          <div class="tab-header">
            <button class="tab-button active" data-tab="models">Models</button>
            <button class="tab-button" data-tab="operations">Operations</button>
            <button class="tab-button" data-tab="import">Import Model</button>
          </div>
          
          <div class="tab-content">
            <div class="tab-panel active" id="models-panel">
              <div class="models-filter">
                <input type="text" id="model-search" placeholder="Search models..." class="search-input">
              </div>
              <div class="models-list" id="models-list">
                <div class="loading-placeholder">Loading models...</div>
              </div>
            </div>
            
            <div class="tab-panel" id="operations-panel">
              <div class="operations-list" id="operations-list">
                <div class="loading-placeholder">No operations recorded</div>
              </div>
            </div>
            
            <div class="tab-panel" id="import-panel">
              <div class="import-form">
                <h3>Import from HuggingFace</h3>
                <div class="form-group">
                  <label for="hf-model-id">Model ID:</label>
                  <input type="text" id="hf-model-id" placeholder="username/model-name" class="form-input">
                </div>
                <button id="hf-import-btn" class="dashboard-button">Import</button>
                
                <h3>Import from IPFS</h3>
                <div class="form-group">
                  <label for="ipfs-model-id">Model ID:</label>
                  <input type="text" id="ipfs-model-id" placeholder="custom-name-for-model" class="form-input">
                </div>
                <div class="form-group">
                  <label for="ipfs-model-cid">IPFS CID:</label>
                  <input type="text" id="ipfs-model-cid" placeholder="bafybeig..." class="form-input">
                </div>
                <button id="ipfs-import-btn" class="dashboard-button">Import</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-footer">
        <div class="last-updated">Last updated: Never</div>
      </div>
    `;
    
    // Apply styles
    this.applyStyles();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Start auto-refresh
    this.startAutoRefresh();
  }
  
  /**
   * Apply dashboard styles
   */
  applyStyles() {
    // Header styles
    const headers = this.container.querySelectorAll('.dashboard-header');
    headers.forEach(header => {
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '24px';
    });
    
    // Connection status styles
    const statusIndicators = this.container.querySelectorAll('.status-indicator');
    statusIndicators.forEach(indicator => {
      indicator.style.display = 'inline-block';
      indicator.style.width = '10px';
      indicator.style.height = '10px';
      indicator.style.borderRadius = '50%';
      indicator.style.backgroundColor = '#ff5252';
      indicator.style.marginRight = '8px';
    });
    
    // Button styles
    const buttons = this.container.querySelectorAll('.dashboard-button');
    buttons.forEach(button => {
      button.style.backgroundColor = this.theme.primary;
      button.style.color = '#ffffff';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.padding = '8px 16px';
      button.style.margin = '4px';
      button.style.cursor = 'pointer';
      button.style.transition = 'background-color 0.3s';
    });
    
    // Stats section
    const statsSection = this.container.querySelector('.dashboard-stats');
    if (statsSection) {
      statsSection.style.display = 'flex';
      statsSection.style.justifyContent = 'space-between';
      statsSection.style.marginBottom = '24px';
      statsSection.style.flexWrap = 'wrap';
    }
    
    // Stat boxes
    const statBoxes = this.container.querySelectorAll('.stat-box');
    statBoxes.forEach(box => {
      box.style.backgroundColor = this.theme.surface;
      box.style.padding = '16px';
      box.style.borderRadius = '8px';
      box.style.textAlign = 'center';
      box.style.flex = '1';
      box.style.margin = '8px';
      box.style.minWidth = '120px';
    });
    
    // Stat values
    const statValues = this.container.querySelectorAll('.stat-value');
    statValues.forEach(value => {
      value.style.fontSize = '24px';
      value.style.fontWeight = 'bold';
      value.style.color = this.theme.secondary;
    });
    
    // Tab container
    const tabContainer = this.container.querySelector('.tab-container');
    if (tabContainer) {
      tabContainer.style.backgroundColor = this.theme.surface;
      tabContainer.style.borderRadius = '8px';
      tabContainer.style.overflow = 'hidden';
    }
    
    // Tab headers
    const tabHeader = this.container.querySelector('.tab-header');
    if (tabHeader) {
      tabHeader.style.display = 'flex';
      tabHeader.style.borderBottom = `1px solid ${this.theme.primary}`;
    }
    
    // Tab buttons
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.style.background = 'none';
      button.style.border = 'none';
      button.style.color = this.theme.text;
      button.style.padding = '12px 24px';
      button.style.cursor = 'pointer';
      button.style.flex = '1';
      button.style.transition = 'background-color 0.3s';
      
      if (button.classList.contains('active')) {
        button.style.borderBottom = `2px solid ${this.theme.primary}`;
        button.style.fontWeight = 'bold';
      }
    });
    
    // Tab panels
    const tabPanels = this.container.querySelectorAll('.tab-panel');
    tabPanels.forEach(panel => {
      panel.style.display = 'none';
      panel.style.padding = '16px';
      
      if (panel.classList.contains('active')) {
        panel.style.display = 'block';
      }
    });
    
    // Form inputs
    const formInputs = this.container.querySelectorAll('.form-input, .search-input');
    formInputs.forEach(input => {
      input.style.width = '100%';
      input.style.padding = '8px 12px';
      input.style.margin = '8px 0';
      input.style.borderRadius = '4px';
      input.style.border = `1px solid ${this.theme.primary}`;
      input.style.backgroundColor = '#2c2c2c';
      input.style.color = this.theme.text;
    });
    
    // Form groups
    const formGroups = this.container.querySelectorAll('.form-group');
    formGroups.forEach(group => {
      group.style.marginBottom = '16px';
    });
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Tab switching
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });
    
    // Refresh button
    const refreshBtn = this.container.querySelector('#refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshData();
      });
    }
    
    // Auto-refresh toggle
    const autoRefreshBtn = this.container.querySelector('#auto-refresh-btn');
    if (autoRefreshBtn) {
      autoRefreshBtn.addEventListener('click', () => {
        if (this.refreshInterval) {
          this.stopAutoRefresh();
          autoRefreshBtn.textContent = 'Auto-refresh: OFF';
        } else {
          this.startAutoRefresh();
          autoRefreshBtn.textContent = 'Auto-refresh: ON';
        }
      });
    }
    
    // Model search
    const modelSearch = this.container.querySelector('#model-search');
    if (modelSearch) {
      modelSearch.addEventListener('input', () => {
        this.filterModels(modelSearch.value);
      });
    }
    
    // HuggingFace import button
    const hfImportBtn = this.container.querySelector('#hf-import-btn');
    if (hfImportBtn) {
      hfImportBtn.addEventListener('click', () => {
        const modelId = this.container.querySelector('#hf-model-id').value.trim();
        if (modelId) {
          this.importFromHuggingFace(modelId);
        } else {
          this.showError('Please enter a valid model ID');
        }
      });
    }
    
    // IPFS import button
    const ipfsImportBtn = this.container.querySelector('#ipfs-import-btn');
    if (ipfsImportBtn) {
      ipfsImportBtn.addEventListener('click', () => {
        const modelId = this.container.querySelector('#ipfs-model-id').value.trim();
        const cid = this.container.querySelector('#ipfs-model-cid').value.trim();
        
        if (modelId && cid) {
          this.importFromIPFS(modelId, cid);
        } else {
          this.showError('Please enter both model ID and CID');
        }
      });
    }
  }
  
  /**
   * Switch active tab
   * 
   * @param {string} tabName - Name of the tab to switch to
   */
  switchTab(tabName) {
    // Update tab buttons
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      if (button.getAttribute('data-tab') === tabName) {
        button.classList.add('active');
        button.style.borderBottom = `2px solid ${this.theme.primary}`;
        button.style.fontWeight = 'bold';
      } else {
        button.classList.remove('active');
        button.style.borderBottom = 'none';
        button.style.fontWeight = 'normal';
      }
    });
    
    // Update tab panels
    const tabPanels = this.container.querySelectorAll('.tab-panel');
    tabPanels.forEach(panel => {
      if (panel.id === `${tabName}-panel`) {
        panel.classList.add('active');
        panel.style.display = 'block';
      } else {
        panel.classList.remove('active');
        panel.style.display = 'none';
      }
    });
  }
  
  /**
   * Start auto-refresh
   */
  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      this.refreshData();
    }, this.refreshRate);
    
    // Initial refresh
    this.refreshData();
  }
  
  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
  
  /**
   * Refresh dashboard data
   */
  async refreshData() {
    if (!this.bridge || this.operationInProgress) {
      return;
    }
    
    this.operationInProgress = true;
    
    try {
      // Update loading state
      this.updateLoadingState(true);
      
      // Execute operation via bridge
      const result = await this.bridge.executeOperation('refresh', {});
      
      // Update state with result
      if (result) {
        this.updateState(result);
      }
    } catch (error) {
      console.error('Failed to refresh data:', error);
      this.updateConnectionStatus(false);
    } finally {
      this.operationInProgress = false;
      this.updateLoadingState(false);
    }
  }
  
  /**
   * Import model from HuggingFace
   * 
   * @param {string} modelId - HuggingFace model ID
   */
  async importFromHuggingFace(modelId) {
    if (!this.bridge || this.operationInProgress) {
      return;
    }
    
    this.operationInProgress = true;
    
    try {
      // Update loading state
      this.updateLoadingState(true);
      
      // Execute operation via bridge
      const result = await this.bridge.executeOperation('import_from_huggingface', {
        model_id: modelId
      });
      
      // Update state and show result
      if (result) {
        this.updateState(result);
        
        if (result.success) {
          this.showSuccess(`Successfully imported model: ${modelId}`);
          this.switchTab('models');
        } else {
          this.showError(`Failed to import model: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Failed to import from HuggingFace:', error);
      this.showError(`Failed to import model: ${error.message || 'Unknown error'}`);
    } finally {
      this.operationInProgress = false;
      this.updateLoadingState(false);
    }
  }
  
  /**
   * Import model from IPFS
   * 
   * @param {string} modelId - Model ID
   * @param {string} cid - IPFS CID
   */
  async importFromIPFS(modelId, cid) {
    if (!this.bridge || this.operationInProgress) {
      return;
    }
    
    this.operationInProgress = true;
    
    try {
      // Update loading state
      this.updateLoadingState(true);
      
      // Execute operation via bridge
      const result = await this.bridge.executeOperation('import_from_ipfs', {
        model_id: modelId,
        cid: cid
      });
      
      // Update state and show result
      if (result) {
        this.updateState(result);
        
        if (result.success) {
          this.showSuccess(`Successfully imported model from IPFS: ${modelId}`);
          this.switchTab('models');
        } else {
          this.showError(`Failed to import model: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Failed to import from IPFS:', error);
      this.showError(`Failed to import model: ${error.message || 'Unknown error'}`);
    } finally {
      this.operationInProgress = false;
      this.updateLoadingState(false);
    }
  }
  
  /**
   * Remove a model
   * 
   * @param {string} modelId - Model ID to remove
   */
  async removeModel(modelId) {
    if (!this.bridge || this.operationInProgress) {
      return;
    }
    
    if (!confirm(`Are you sure you want to remove model "${modelId}"?`)) {
      return;
    }
    
    this.operationInProgress = true;
    
    try {
      // Update loading state
      this.updateLoadingState(true);
      
      // Execute operation via bridge
      const result = await this.bridge.executeOperation('remove_model', {
        model_id: modelId
      });
      
      // Update state and show result
      if (result) {
        this.updateState(result);
        
        if (result.success) {
          this.showSuccess(`Successfully removed model: ${modelId}`);
        } else {
          this.showError(`Failed to remove model: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Failed to remove model:', error);
      this.showError(`Failed to remove model: ${error.message || 'Unknown error'}`);
    } finally {
      this.operationInProgress = false;
      this.updateLoadingState(false);
    }
  }
  
  /**
   * Update the dashboard state with new data
   * 
   * @param {Object} data - New dashboard data
   */
  updateState(data) {
    if (!data) return;
    
    // Update connection status
    if ('connected' in data) {
      this.updateConnectionStatus(data.connected);
    }
    
    // Update models
    if (data.models) {
      this.state.models = data.models;
      this.state.models_count = Object.keys(data.models).length;
      this.renderModelsList();
    }
    
    // Update models count
    if ('models_count' in data) {
      this.state.models_count = data.models_count;
      const modelsCountElement = this.container.querySelector('#models-count');
      if (modelsCountElement) {
        modelsCountElement.textContent = data.models_count.toLocaleString();
      }
    }
    
    // Update stats
    if (data.stats) {
      this.state.stats = data.stats;
      
      // Update stats display
      const ipfsModelsElement = this.container.querySelector('#ipfs-models');
      if (ipfsModelsElement) {
        ipfsModelsElement.textContent = data.stats.ipfs_models.toLocaleString();
      }
      
      const hfModelsElement = this.container.querySelector('#hf-models');
      if (hfModelsElement) {
        hfModelsElement.textContent = data.stats.huggingface_models.toLocaleString();
      }
      
      const totalSizeElement = this.container.querySelector('#total-size');
      if (totalSizeElement) {
        totalSizeElement.textContent = this.formatBytes(data.stats.total_size_bytes);
      }
    }
    
    // Update operations
    if (data.operations) {
      this.state.operations = data.operations;
      this.renderOperationsList();
    }
    
    // Update last updated timestamp
    if (data.last_updated) {
      this.state.lastUpdated = data.last_updated;
      const lastUpdatedElement = this.container.querySelector('.last-updated');
      if (lastUpdatedElement) {
        const date = new Date(data.last_updated);
        lastUpdatedElement.textContent = `Last updated: ${date.toLocaleString()}`;
      }
    }
  }
  
  /**
   * Update the connection status indicator
   * 
   * @param {boolean} connected - Whether connected to model manager
   */
  updateConnectionStatus(connected) {
    this.state.connected = connected;
    
    const statusIndicator = this.container.querySelector('.status-indicator');
    const statusText = this.container.querySelector('.status-text');
    
    if (statusIndicator && statusText) {
      if (connected) {
        statusIndicator.style.backgroundColor = '#4caf50';
        statusText.textContent = 'Connected';
      } else {
        statusIndicator.style.backgroundColor = '#ff5252';
        statusText.textContent = 'Disconnected';
      }
    }
  }
  
  /**
   * Update the loading state
   * 
   * @param {boolean} loading - Whether loading is in progress
   */
  updateLoadingState(loading) {
    this.state.loading = loading;
    
    const buttons = this.container.querySelectorAll('.dashboard-button');
    buttons.forEach(button => {
      button.disabled = loading;
      button.style.opacity = loading ? '0.7' : '1';
    });
    
    const inputs = this.container.querySelectorAll('.form-input, .search-input');
    inputs.forEach(input => {
      input.disabled = loading;
      input.style.opacity = loading ? '0.7' : '1';
    });
  }
  
  /**
   * Render the models list
   */
  renderModelsList() {
    const modelsList = this.container.querySelector('#models-list');
    if (!modelsList) return;
    
    // Get search term
    const searchInput = this.container.querySelector('#model-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    // Filter models
    const models = Object.values(this.state.models);
    const filteredModels = searchTerm 
      ? models.filter(model => model.id.toLowerCase().includes(searchTerm))
      : models;
    
    if (filteredModels.length === 0) {
      modelsList.innerHTML = '<div class="empty-message">No models found</div>';
      return;
    }
    
    // Sort models by ID
    const sortedModels = filteredModels.sort((a, b) => a.id.localeCompare(b.id));
    
    // Generate HTML
    let html = '';
    for (const model of sortedModels) {
      html += `
        <div class="model-card">
          <div class="model-header">
            <div class="model-title">${this.escapeHtml(model.id)}</div>
            <button class="remove-model-btn" data-model-id="${this.escapeHtml(model.id)}">Remove</button>
          </div>
          <div class="model-details">
            <div class="model-detail"><span>Type:</span> ${this.escapeHtml(model.type || 'Unknown')}</div>
            <div class="model-detail"><span>Task:</span> ${this.escapeHtml(model.task || 'Unknown')}</div>
            <div class="model-detail"><span>Size:</span> ${this.formatBytes(model.size)}</div>
            <div class="model-detail"><span>Path:</span> ${this.escapeHtml(model.local_path || 'N/A')}</div>
          </div>
          <div class="model-cids">
            <div class="model-cids-header">IPFS CIDs:</div>
            <div class="cids-list">
              ${this.renderCidsList(model.cids || {})}
            </div>
          </div>
        </div>
      `;
    }
    
    modelsList.innerHTML = html;
    
    // Apply styles to model cards
    const modelCards = modelsList.querySelectorAll('.model-card');
    modelCards.forEach(card => {
      card.style.backgroundColor = this.theme.surface;
      card.style.borderRadius = '4px';
      card.style.padding = '16px';
      card.style.marginBottom = '16px';
      card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    });
    
    // Style model headers
    const modelHeaders = modelsList.querySelectorAll('.model-header');
    modelHeaders.forEach(header => {
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '8px';
    });
    
    // Style model titles
    const modelTitles = modelsList.querySelectorAll('.model-title');
    modelTitles.forEach(title => {
      title.style.fontSize = '18px';
      title.style.fontWeight = 'bold';
      title.style.color = this.theme.primary;
    });
    
    // Style remove buttons
    const removeButtons = modelsList.querySelectorAll('.remove-model-btn');
    removeButtons.forEach(button => {
      button.style.backgroundColor = this.theme.error;
      button.style.color = '#ffffff';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.padding = '4px 8px';
      button.style.cursor = 'pointer';
      
      // Add click event
      button.addEventListener('click', (event) => {
        const modelId = event.currentTarget.getAttribute('data-model-id');
        this.removeModel(modelId);
      });
    });
    
    // Style model details
    const modelDetails = modelsList.querySelectorAll('.model-details');
    modelDetails.forEach(details => {
      details.style.marginBottom = '12px';
    });
    
    // Style detail items
    const detailItems = modelsList.querySelectorAll('.model-detail');
    detailItems.forEach(item => {
      item.style.margin = '4px 0';
    });
    
    // Style detail labels
    const detailLabels = modelsList.querySelectorAll('.model-detail span');
    detailLabels.forEach(label => {
      label.style.fontWeight = 'bold';
      label.style.color = this.theme.secondary;
    });
    
    // Style CIDs section
    const cidsHeaders = modelsList.querySelectorAll('.model-cids-header');
    cidsHeaders.forEach(header => {
      header.style.fontWeight = 'bold';
      header.style.marginBottom = '4px';
      header.style.color = this.theme.secondary;
    });
    
    // Style CIDs list
    const cidsLists = modelsList.querySelectorAll('.cids-list');
    cidsLists.forEach(list => {
      list.style.fontFamily = 'monospace';
      list.style.fontSize = '12px';
      list.style.backgroundColor = '#2a2a2a';
      list.style.padding = '8px';
      list.style.borderRadius = '4px';
      list.style.overflowX = 'auto';
    });
  }
  
  /**
   * Render the CIDs list
   * 
   * @param {Object} cids - Map of filename to CID
   * @returns {string} HTML for CIDs list
   */
  renderCidsList(cids) {
    if (!cids || Object.keys(cids).length === 0) {
      return '<div class="empty-cids">No CIDs available</div>';
    }
    
    let html = '';
    for (const [fileName, cid] of Object.entries(cids)) {
      html += `<div class="cid-item">
        <span class="cid-filename">${this.escapeHtml(fileName)}</span>: 
        <span class="cid-value">${this.escapeHtml(cid)}</span>
      </div>`;
    }
    
    return html;
  }
  
  /**
   * Render the operations list
   */
  renderOperationsList() {
    const operationsList = this.container.querySelector('#operations-list');
    if (!operationsList) return;
    
    if (!this.state.operations || this.state.operations.length === 0) {
      operationsList.innerHTML = '<div class="empty-message">No operations recorded</div>';
      return;
    }
    
    // Sort operations by timestamp (newest first)
    const sortedOperations = [...this.state.operations].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Generate HTML
    let html = '';
    for (const op of sortedOperations) {
      const timestamp = new Date(op.timestamp).toLocaleString();
      const params = JSON.stringify(op.params || {}, null, 2);
      
      html += `
        <div class="operation-item ${op.success ? 'success' : 'error'}">
          <div class="operation-header">
            <div class="operation-name">${this.escapeHtml(op.operation)}</div>
            <div class="operation-timestamp">${timestamp}</div>
          </div>
          <div class="operation-status">
            Status: <span>${op.success ? 'Success' : 'Failed'}</span>
          </div>
          <div class="operation-duration">
            Duration: ${this.formatDuration(op.duration)}
          </div>
          <div class="operation-params">
            <div class="params-header">Parameters:</div>
            <pre>${this.escapeHtml(params)}</pre>
          </div>
          ${op.error ? `<div class="operation-error">Error: ${this.escapeHtml(op.error)}</div>` : ''}
        </div>
      `;
    }
    
    operationsList.innerHTML = html;
    
    // Apply styles to operation items
    const operationItems = operationsList.querySelectorAll('.operation-item');
    operationItems.forEach(item => {
      item.style.borderRadius = '4px';
      item.style.padding = '12px';
      item.style.marginBottom = '12px';
      item.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      
      if (item.classList.contains('success')) {
        item.style.backgroundColor = 'rgba(76, 175, 80, 0.15)';
        item.style.borderLeft = '4px solid #4caf50';
      } else {
        item.style.backgroundColor = 'rgba(244, 67, 54, 0.15)';
        item.style.borderLeft = '4px solid #f44336';
      }
    });
    
    // Style operation headers
    const opHeaders = operationsList.querySelectorAll('.operation-header');
    opHeaders.forEach(header => {
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '8px';
    });
    
    // Style operation names
    const opNames = operationsList.querySelectorAll('.operation-name');
    opNames.forEach(name => {
      name.style.fontSize = '16px';
      name.style.fontWeight = 'bold';
      name.style.textTransform = 'capitalize';
    });
    
    // Style timestamps
    const timestamps = operationsList.querySelectorAll('.operation-timestamp');
    timestamps.forEach(ts => {
      ts.style.fontSize = '12px';
      ts.style.opacity = '0.7';
    });
    
    // Style status
    const statuses = operationsList.querySelectorAll('.operation-status span');
    statuses.forEach(status => {
      if (status.parentElement.parentElement.classList.contains('success')) {
        status.style.color = '#4caf50';
      } else {
        status.style.color = '#f44336';
      }
      status.style.fontWeight = 'bold';
    });
    
    // Style params
    const paramsHeaders = operationsList.querySelectorAll('.params-header');
    paramsHeaders.forEach(header => {
      header.style.fontWeight = 'bold';
      header.style.marginTop = '8px';
      header.style.marginBottom = '4px';
    });
    
    const paramsPre = operationsList.querySelectorAll('.operation-params pre');
    paramsPre.forEach(pre => {
      pre.style.fontSize = '12px';
      pre.style.backgroundColor = '#2a2a2a';
      pre.style.padding = '8px';
      pre.style.borderRadius = '4px';
      pre.style.overflow = 'auto';
      pre.style.maxHeight = '100px';
    });
    
    // Style errors
    const errors = operationsList.querySelectorAll('.operation-error');
    errors.forEach(error => {
      error.style.color = '#f44336';
      error.style.marginTop = '8px';
      error.style.fontWeight = 'bold';
    });
  }
  
  /**
   * Filter models based on search term
   * 
   * @param {string} searchTerm - Term to filter by
   */
  filterModels(searchTerm) {
    // Just re-render the list with the current search term
    this.renderModelsList();
  }
  
  /**
   * Show success message
   * 
   * @param {string} message - Success message
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }
  
  /**
   * Show error message
   * 
   * @param {string} message - Error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }
  
  /**
   * Show notification message
   * 
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error)
   */
  showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = this.container.querySelector('.dashboard-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'dashboard-notification';
      notification.style.position = 'fixed';
      notification.style.bottom = '24px';
      notification.style.right = '24px';
      notification.style.padding = '12px 24px';
      notification.style.borderRadius = '4px';
      notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
      notification.style.zIndex = '1000';
      notification.style.minWidth = '200px';
      notification.style.maxWidth = '400px';
      notification.style.fontWeight = 'bold';
      notification.style.transition = 'opacity 0.3s';
      
      this.container.appendChild(notification);
    }
    
    // Set type-specific styles
    if (type === 'success') {
      notification.style.backgroundColor = '#4caf50';
      notification.style.color = '#ffffff';
    } else if (type === 'error') {
      notification.style.backgroundColor = '#f44336';
      notification.style.color = '#ffffff';
    } else {
      notification.style.backgroundColor = '#2196f3';
      notification.style.color = '#ffffff';
    }
    
    // Set message
    notification.textContent = message;
    notification.style.opacity = '1';
    
    // Auto-hide after delay
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 5000);
    
    // Allow event callback
    this.onEvent({
      type: 'notification',
      message,
      notificationType: type
    });
  }
  
  /**
   * Format bytes to human-readable size
   * 
   * @param {number} bytes - Bytes to format
   * @param {number} decimals - Decimal places
   * @returns {string} Formatted size
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  /**
   * Format duration in seconds to human-readable format
   * 
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    if (seconds < 0.001) {
      return `${(seconds * 1000000).toFixed(0)} µs`;
    } else if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)} ms`;
    } else if (seconds < 60) {
      return `${seconds.toFixed(2)} s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
    }
  }
  
  /**
   * Escape HTML special characters
   * 
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Export the dashboard component
export default IPFSModelManagerDashboard;