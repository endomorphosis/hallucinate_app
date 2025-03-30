/**
 * IPFS Transformers Dashboard
 * 
 * Client-side dashboard for the IPFS Transformers module with ipfs_accelerate integration.
 */

import { BaseComponent } from './base_component.js';

export class IPFSTransformersDashboard extends BaseComponent {
  /**
   * Initialize the IPFS Transformers Dashboard
   * 
   * @param {Object} options - Dashboard options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} options.bridge - Bridge to communicate with Python
   * @param {Object} options.theme - Theme configuration
   * @param {Boolean} options.autoRefresh - Auto-refresh status
   * @param {Number} options.refreshInterval - Refresh interval in ms
   */
  constructor(options = {}) {
    super(options);
    
    this.container = options.container;
    this.bridge = options.bridge;
    this.theme = options.theme || { mode: 'light' };
    this.autoRefresh = options.autoRefresh !== false;
    this.refreshInterval = options.refreshInterval || 5000;
    
    // State
    this.status = null;
    this.activeTab = 'models';
    this.isStreaming = false;
    this.streamingBuffer = [];
    
    // Refresh timer
    this.refreshTimer = null;
    
    // Reference elements that will be populated later
    this.elements = {
      panelContent: null,
      statusIndicator: null,
      activeModel: null,
      inferenceOutput: null,
      tabButtons: null,
      tabContents: null
    };
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the dashboard
   */
  async init() {
    try {
      // Create container if needed
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'ipfs-transformers-dashboard';
        document.body.appendChild(this.container);
      }
      
      // Initial render
      await this.render();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Start auto-refresh if enabled
      if (this.autoRefresh) {
        this.startAutoRefresh();
      }
      
      // Initial data refresh
      await this.refreshData();
      
      this.emit('initialized');
    } catch (error) {
      console.error('Error initializing IPFS Transformers Dashboard:', error);
      this.emit('error', { error });
    }
  }
  
  /**
   * Render the dashboard
   */
  async render() {
    try {
      // If bridge is available, get HTML from Python
      if (this.bridge) {
        const result = await this.bridge.execute('get_html', {});
        if (result && result.html) {
          this.container.innerHTML = result.html;
        } else {
          this.renderDefaultUI();
        }
      } else {
        this.renderDefaultUI();
      }
      
      // Cache elements after rendering
      this.cacheElements();
      
      this.emit('rendered');
    } catch (error) {
      console.error('Error rendering dashboard:', error);
      this.renderDefaultUI();
      this.emit('error', { error });
    }
  }
  
  /**
   * Render default UI when bridge is not available
   */
  renderDefaultUI() {
    const themeClass = this.theme.mode === 'dark' ? 'theme-dark' : 'theme-light';
    
    this.container.innerHTML = `
      <div class="ipfs-transformers-dashboard ${themeClass}">
        <div class="dashboard-header">
          <h1>IPFS Transformers Dashboard</h1>
          <div class="dashboard-controls">
            <button id="refresh-btn" class="btn refresh-btn">Refresh</button>
          </div>
        </div>
        
        <div class="status-bar">
          <div class="status-item">
            <span class="status-label">Status:</span>
            <span id="status-indicator" class="status-value status-indicator status-unknown">Unknown</span>
          </div>
          <div class="status-item">
            <span class="status-label">Active Model:</span>
            <span id="active-model" class="status-value">None</span>
          </div>
        </div>
        
        <div class="dashboard-tabs">
          <div class="tab-header">
            <button class="tab-btn active" data-tab="models">Models</button>
            <button class="tab-btn" data-tab="inference">Inference</button>
            <button class="tab-btn" data-tab="hardware">Hardware</button>
            <button class="tab-btn" data-tab="operations">Operations</button>
          </div>
          
          <div class="tab-content active" id="models-tab">
            <h3>Loaded Models</h3>
            <div id="models-list" class="models-list">
              <p>No data available. Please check connection.</p>
            </div>
          </div>
          
          <div class="tab-content" id="inference-tab">
            <h3>Run Inference</h3>
            <div class="inference-form">
              <textarea id="inference-input" placeholder="Enter input text..."></textarea>
              <div class="inference-options">
                <label>
                  <input type="checkbox" id="inference-stream-checkbox"> Enable streaming
                </label>
                <label>Model:
                  <select id="inference-model-select">
                    <option value="">Select a model</option>
                  </select>
                </label>
              </div>
              <button id="run-inference-btn" class="btn primary-btn">Run Inference</button>
            </div>
            
            <div class="inference-output">
              <h4>Output</h4>
              <pre id="inference-output-content">Run inference to see results here</pre>
            </div>
          </div>
          
          <div class="tab-content" id="hardware-tab">
            <h3>Hardware Capabilities</h3>
            <div id="hardware-capabilities" class="hardware-capabilities">
              <p>No data available</p>
            </div>
          </div>
          
          <div class="tab-content" id="operations-tab">
            <h3>Operations Log</h3>
            <div id="operations-log" class="operations-log">
              <p>No operations recorded</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Cache element references after rendering
   */
  cacheElements() {
    this.elements.panelContent = this.container.querySelector('.ipfs-transformers-dashboard');
    this.elements.statusIndicator = this.container.querySelector('#status-indicator');
    this.elements.activeModel = this.container.querySelector('#active-model');
    this.elements.inferenceOutput = this.container.querySelector('#inference-output-content');
    this.elements.tabButtons = this.container.querySelectorAll('.tab-btn');
    this.elements.tabContents = this.container.querySelectorAll('.tab-content');
    this.elements.modelsContainer = this.container.querySelector('#models-list') || this.container.querySelector('.models-list');
    this.elements.inferenceInput = this.container.querySelector('#inference-input');
    this.elements.inferenceStreamCheckbox = this.container.querySelector('#inference-stream-checkbox');
    this.elements.inferenceModelSelect = this.container.querySelector('#inference-model-select');
    this.elements.hardwareCapabilities = this.container.querySelector('#hardware-capabilities') || this.container.querySelector('.hardware-capabilities');
    this.elements.operationsLog = this.container.querySelector('#operations-log') || this.container.querySelector('.operations-table tbody');
  }
  
  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    // Refresh button
    const refreshBtn = this.container.querySelector('#refresh-btn') || this.container.querySelector('.refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshData());
    }
    
    // Tab switching
    this.elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.dataset.tab);
      });
    });
    
    // Run inference button
    const runInferenceBtn = this.container.querySelector('#run-inference-btn') || this.container.querySelector('button[onclick="runTransformersInference()"]');
    if (runInferenceBtn) {
      runInferenceBtn.addEventListener('click', () => this.runInference());
    }
    
    // Load model button
    const loadModelBtn = this.container.querySelector('button[onclick="loadTransformersModel()"]');
    if (loadModelBtn) {
      loadModelBtn.addEventListener('click', () => this.loadModel());
    }
    
    // Define global functions for HTML-based onclick handlers
    window.refreshTransformersPanel = () => this.refreshData();
    window.runTransformersInference = () => this.runInference();
    window.loadTransformersModel = () => this.loadModel();
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
    }, this.refreshInterval);
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
      if (!this.bridge) {
        console.warn('Bridge not available, cannot refresh data');
        return;
      }
      
      // Execute operation through bridge
      const result = await this.bridge.execute('execute_operation', {
        operation: 'refresh',
        params: {}
      });
      
      if (result && result.success) {
        // Get updated status
        const status = await this.bridge.execute('get_status', {});
        if (status) {
          this.updateUI(status);
        }
      }
      
      this.emit('data-refreshed');
    } catch (error) {
      console.error('Error refreshing data:', error);
      this.emit('error', { error });
    }
  }
  
  /**
   * Update UI with latest status
   * 
   * @param {Object} status - Current status data
   */
  updateUI(status) {
    this.status = status;
    
    // Update status indicators
    if (this.elements.statusIndicator) {
      const connected = status.connected && status.initialized;
      this.elements.statusIndicator.textContent = connected ? 'Connected' : 'Disconnected';
      this.elements.statusIndicator.className = `status-value status-indicator ${connected ? 'status-up' : 'status-down'}`;
    }
    
    // Update active model
    if (this.elements.activeModel) {
      this.elements.activeModel.textContent = status.active_model || 'None';
    }
    
    // Update models list
    this.updateModelsList(status.loaded_models || {});
    
    // Update hardware capabilities
    this.updateHardwareCapabilities(status.hardware_capabilities || {}, status.ipfs_accelerate || {});
    
    // Update operations log
    this.updateOperationsLog(status.operations || []);
    
    // Update model select dropdown
    this.updateModelSelect(status.loaded_models || {});
    
    // Check for streaming updates
    if (status.streaming) {
      this.handleStreamingUpdate(status.streaming);
    }
  }
  
  /**
   * Update models list in the UI
   * 
   * @param {Object} models - Models data
   */
  updateModelsList(models) {
    if (!this.elements.modelsContainer) return;
    
    if (Object.keys(models).length === 0) {
      this.elements.modelsContainer.innerHTML = '<p>No models loaded</p>';
      return;
    }
    
    let html = '';
    for (const [modelId, modelInfo] of Object.entries(models)) {
      const modelClass = modelInfo.accelerated ? 'model-accelerated' : '';
      const device = modelInfo.device || 'cpu';
      const task = modelInfo.task || 'unknown';
      
      html += `
        <div class="model-item ${modelClass}">
          <div class="model-header">
            <span class="model-id">${modelId}</span>
            <span class="model-task">${task}</span>
          </div>
          <div class="model-details">
            <span class="model-device">Device: ${device}</span>
            <span class="model-loader">Loader: ${modelInfo.loaded_via || 'unknown'}</span>
          </div>
        </div>
      `;
    }
    
    this.elements.modelsContainer.innerHTML = html;
  }
  
  /**
   * Update hardware capabilities display
   * 
   * @param {Object} capabilities - Hardware capabilities data
   * @param {Object} accelerate - Accelerate status data
   */
  updateHardwareCapabilities(capabilities, accelerate) {
    if (!this.elements.hardwareCapabilities) return;
    
    let capabilitiesHtml = '';
    for (const [hw, available] of Object.entries(capabilities)) {
      const statusClass = available ? 'status-up' : 'status-down';
      const statusText = available ? 'Available' : 'Not Available';
      
      capabilitiesHtml += `
        <div class="capability-item">
          <span class="capability-name">${hw.toUpperCase()}</span>
          <span class="capability-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }
    
    let accelerateHtml = '';
    if (accelerate.available) {
      const version = accelerate.version || 'unknown';
      const backends = Array.isArray(accelerate.backends) ? accelerate.backends.join(', ') : 'cpu';
      const statusClass = accelerate.initialized ? 'status-up' : 'status-warning';
      const statusText = accelerate.initialized ? 'Available & Initialized' : 'Available (Not Initialized)';
      
      accelerateHtml = `
        <div class="accelerate-info">
          <div class="info-item">
            <span class="info-label">Version:</span>
            <span class="info-value">${version}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Backends:</span>
            <span class="info-value">${backends}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Status:</span>
            <span class="info-value ${statusClass}">${statusText}</span>
          </div>
        </div>
      `;
    } else {
      accelerateHtml = `
        <div class="accelerate-not-available">
          <p>ipfs_accelerate_py is not available in this environment. Hardware acceleration will be limited.</p>
          <p>Install ipfs_accelerate_py to enable hardware-accelerated inference across multiple backends.</p>
        </div>
      `;
    }
    
    // Update the hardware tab content
    const hardwareTab = this.container.querySelector('#hardware-tab') || this.container.querySelector('.tab-content[id="hardware-tab"]');
    if (hardwareTab) {
      const capabilitiesSection = hardwareTab.querySelector('.hardware-capabilities');
      const accelerateSection = hardwareTab.querySelector('.accelerate-status');
      
      if (capabilitiesSection) {
        capabilitiesSection.innerHTML = capabilitiesHtml;
      }
      
      if (accelerateSection) {
        accelerateSection.innerHTML = accelerateHtml;
      } else {
        // Create accelerate section if it doesn't exist
        const accelerateTitle = document.createElement('h3');
        accelerateTitle.textContent = 'ipfs_accelerate Status';
        
        const accelerateDiv = document.createElement('div');
        accelerateDiv.className = 'accelerate-status';
        accelerateDiv.innerHTML = accelerateHtml;
        
        hardwareTab.appendChild(accelerateTitle);
        hardwareTab.appendChild(accelerateDiv);
      }
    }
  }
  
  /**
   * Update operations log in the UI
   * 
   * @param {Array} operations - Operations data
   */
  updateOperationsLog(operations) {
    if (!this.elements.operationsLog) return;
    
    if (operations.length === 0) {
      if (this.elements.operationsLog.tagName === 'TBODY') {
        this.elements.operationsLog.innerHTML = `
          <tr>
            <td colspan="5">No operations recorded</td>
          </tr>
        `;
      } else {
        this.elements.operationsLog.innerHTML = '<p>No operations recorded</p>';
      }
      return;
    }
    
    let html = '';
    // Reverse to show newest first
    for (const op of [...operations].reverse()) {
      const timeStr = op.timestamp ? op.timestamp.split('T')[1].split('.')[0] : ''; // Just the time part
      const operation = op.operation || 'unknown';
      const status = op.success ? 'Success' : 'Failed';
      const statusClass = op.success ? 'status-up' : 'status-down';
      const duration = op.duration ? op.duration.toFixed(3) : '0';
      
      // Format details
      let details = '';
      if (op.error) {
        details = `Error: ${op.error}`;
      } else if (op.result) {
        const detailsItems = [];
        for (const [k, v] of Object.entries(op.result)) {
          if (!['success', 'operation', 'error'].includes(k)) {
            detailsItems.push(`${k}: ${v}`);
          }
        }
        details = detailsItems.join(', ');
      }
      
      if (this.elements.operationsLog.tagName === 'TBODY') {
        html += `
          <tr>
            <td>${timeStr}</td>
            <td>${operation}</td>
            <td class="${statusClass}">${status}</td>
            <td>${duration}</td>
            <td>${details}</td>
          </tr>
        `;
      } else {
        html += `
          <div class="operation-log-item ${op.success ? 'success' : 'failed'}">
            <div class="operation-header">
              <span class="operation-time">${timeStr}</span>
              <span class="operation-name">${operation}</span>
              <span class="operation-status ${statusClass}">${status}</span>
            </div>
            <div class="operation-details">
              <span class="operation-duration">Duration: ${duration}s</span>
              <span class="operation-info">${details}</span>
            </div>
          </div>
        `;
      }
    }
    
    this.elements.operationsLog.innerHTML = html;
  }
  
  /**
   * Update model select dropdown in the inference form
   * 
   * @param {Object} models - Models data
   */
  updateModelSelect(models) {
    if (!this.elements.inferenceModelSelect) return;
    
    // Save current selection
    const currentValue = this.elements.inferenceModelSelect.value;
    
    // Clear and rebuild options
    this.elements.inferenceModelSelect.innerHTML = '<option value="">Select a model</option>';
    
    for (const [modelId, modelInfo] of Object.entries(models)) {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = `${modelId} (${modelInfo.task || 'unknown'})`;
      this.elements.inferenceModelSelect.appendChild(option);
    }
    
    // Restore selection if still valid
    if (currentValue && models[currentValue]) {
      this.elements.inferenceModelSelect.value = currentValue;
    }
  }
  
  /**
   * Handle streaming updates
   * 
   * @param {Object} streamingData - Streaming update data
   */
  handleStreamingUpdate(streamingData) {
    if (!this.elements.inferenceOutput) return;
    
    this.isStreaming = streamingData.streaming !== false;
    
    if (streamingData.buffer) {
      this.streamingBuffer = streamingData.buffer;
      
      // Format and display buffer
      let output = '';
      for (const chunk of this.streamingBuffer) {
        if (typeof chunk === 'string') {
          output += chunk;
        } else if (chunk && typeof chunk === 'object') {
          if (chunk.error) {
            output += `\nError: ${chunk.error}\n`;
          } else {
            output += JSON.stringify(chunk, null, 2);
          }
        }
      }
      
      this.elements.inferenceOutput.textContent = output;
      
      // Scroll to bottom
      this.elements.inferenceOutput.scrollTop = this.elements.inferenceOutput.scrollHeight;
    }
    
    // Handle streaming end
    if (streamingData.streaming === false) {
      this.isStreaming = false;
      this.emit('streaming-end', { buffer: this.streamingBuffer });
    }
  }
  
  /**
   * Set active tab
   * 
   * @param {string} tabId - Tab ID to activate
   */
  setActiveTab(tabId) {
    this.activeTab = tabId;
    
    // Update tab buttons
    this.elements.tabButtons.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Update tab contents
    this.elements.tabContents.forEach(content => {
      if (content.id === `${tabId}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
    
    this.emit('tab-changed', { tab: tabId });
  }
  
  /**
   * Run inference with the transformers module
   */
  async runInference() {
    if (!this.bridge) {
      console.warn('Bridge not available, cannot run inference');
      return;
    }
    
    try {
      // Get input text
      const inputText = this.elements.inferenceInput ? this.elements.inferenceInput.value : '';
      if (!inputText.trim()) {
        alert('Please enter some input text');
        return;
      }
      
      // Get selected model
      const modelId = this.elements.inferenceModelSelect ? this.elements.inferenceModelSelect.value : '';
      
      // Get streaming option
      const streamEnabled = this.elements.inferenceStreamCheckbox ? this.elements.inferenceStreamCheckbox.checked : false;
      
      // Check acceleration option
      const accelerateCheckbox = this.container.querySelector('#inference-accelerate-checkbox');
      const useAcceleration = accelerateCheckbox ? accelerateCheckbox.checked : false;
      
      // Update UI to show inference is running
      if (this.elements.inferenceOutput) {
        this.elements.inferenceOutput.textContent = 'Running inference...';
      }
      
      // Clear streaming buffer
      this.streamingBuffer = [];
      this.isStreaming = streamEnabled;
      
      // Build options
      const options = {
        stream: streamEnabled
      };
      
      // Add acceleration option if available
      if (useAcceleration && this.status && this.status.ipfs_accelerate && this.status.ipfs_accelerate.available) {
        options.use_accelerate = true;
      }
      
      // Execute operation through bridge
      const result = await this.bridge.execute('execute_operation', {
        operation: 'run_inference',
        params: {
          inputs: inputText,
          model_id: modelId || undefined,
          options: options
        }
      });
      
      if (result && result.success) {
        // If not streaming, update output immediately
        if (!streamEnabled && this.elements.inferenceOutput) {
          let outputText = '';
          
          if (result.result && result.result.output) {
            // Direct output
            outputText = typeof result.result.output === 'string' 
              ? result.result.output 
              : JSON.stringify(result.result.output, null, 2);
          } else if (result.result && result.result.results) {
            // Results array
            outputText = JSON.stringify(result.result.results, null, 2);
          } else {
            // Fall back to whole result
            outputText = JSON.stringify(result.result, null, 2);
          }
          
          this.elements.inferenceOutput.textContent = outputText;
        }
        
        // Refresh data to update stats
        await this.refreshData();
      } else {
        // Show error
        if (this.elements.inferenceOutput) {
          this.elements.inferenceOutput.textContent = `Error: ${result ? result.error : 'Unknown error'}`;
        }
      }
      
      this.emit('inference-completed', { result });
    } catch (error) {
      console.error('Error running inference:', error);
      if (this.elements.inferenceOutput) {
        this.elements.inferenceOutput.textContent = `Error: ${error.message || error}`;
      }
      this.emit('error', { error });
    }
  }
  
  /**
   * Load a model with the transformers module
   */
  async loadModel() {
    if (!this.bridge) {
      console.warn('Bridge not available, cannot load model');
      return;
    }
    
    try {
      // Get model ID
      const modelIdInput = this.container.querySelector('#model-id-input');
      const modelId = modelIdInput ? modelIdInput.value : '';
      if (!modelId.trim()) {
        alert('Please enter a model ID');
        return;
      }
      
      // Get task
      const taskSelect = this.container.querySelector('#model-task-select');
      const task = taskSelect ? taskSelect.value : 'text-generation';
      
      // Get device
      const deviceSelect = this.container.querySelector('#model-device-select');
      const device = deviceSelect ? deviceSelect.value : 'cpu';
      
      // Build options
      const options = {
        device: device
      };
      
      // Check if we should use accelerated loading
      if (this.status && this.status.ipfs_accelerate && this.status.ipfs_accelerate.available) {
        if (device !== 'cpu') {
          options.use_accelerate = true;
        }
      }
      
      // Execute operation through bridge
      const result = await this.bridge.execute('execute_operation', {
        operation: 'load_model',
        params: {
          model_id: modelId,
          task: task,
          options: options
        }
      });
      
      if (result && result.success) {
        // Show success message
        alert(`Model ${modelId} loaded successfully!`);
        
        // Refresh data to update models list
        await this.refreshData();
      } else {
        // Show error
        alert(`Error loading model: ${result ? result.error : 'Unknown error'}`);
      }
      
      this.emit('model-loaded', { result });
    } catch (error) {
      console.error('Error loading model:', error);
      alert(`Error loading model: ${error.message || error}`);
      this.emit('error', { error });
    }
  }
  
  /**
   * Dispose dashboard resources
   */
  dispose() {
    this.stopAutoRefresh();
    
    // Remove global functions
    delete window.refreshTransformersPanel;
    delete window.runTransformersInference;
    delete window.loadTransformersModel;
    
    this.emit('disposed');
  }
}

// Export default instance creator
export function createIPFSTransformersDashboard(container, bridge, options = {}) {
  return new IPFSTransformersDashboard({
    container,
    bridge,
    ...options
  });
}