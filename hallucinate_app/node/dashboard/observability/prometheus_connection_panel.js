/**
 * Prometheus Connection Panel Component
 * 
 * Provides a UI panel for configuring and monitoring the Prometheus connection
 * from the metrics dashboard
 */

import PrometheusIntegration from './prometheus_integration.js';

/**
 * Prometheus Connection Panel class
 */
class PrometheusConnectionPanel {
  /**
   * Create a new Prometheus connection panel
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.prometheusOptions - Options for Prometheus exporter
   */
  constructor(options = {}) {
    this.container = options.container;
    this.eventBus = options.eventBus || { on: () => {}, emit: () => {} };
    this.prometheusOptions = options.prometheusOptions || {};
    
    // Component state
    this.integration = null;
    this.status = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'error'
    this.autoStart = options.autoStart !== false;
    this.statusUpdateInterval = null;
    
    // Bind methods
    this._handleStartClick = this._handleStartClick.bind(this);
    this._handleStopClick = this._handleStopClick.bind(this);
    this._handleConfigChange = this._handleConfigChange.bind(this);
    this._handlePrometheusSaved = this._handlePrometheusSaved.bind(this);
    
    // Set up event listeners
    this._addEventListeners();
  }
  
  /**
   * Initialize the panel
   * @returns {Promise<boolean>}
   */
  async init() {
    try {
      // Render the panel
      this.render();
      
      // Create Prometheus integration
      this.integration = new PrometheusIntegration({
        eventBus: this.eventBus,
        exporterOptions: {
          ...this.prometheusOptions,
          port: parseInt(this.prometheusOptions.port || 9091, 10),
          autoStart: false // We'll start it manually
        }
      });
      
      // Update status periodically
      this.statusUpdateInterval = setInterval(() => {
        this._updateStatus();
      }, 5000);
      
      // Start if auto-start enabled
      if (this.autoStart) {
        await this._startPrometheus();
      } else {
        this._updateStatus();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Prometheus connection panel:', error);
      this.status = 'error';
      this.render();
      return false;
    }
  }
  
  /**
   * Add event listeners
   * @private
   */
  _addEventListeners() {
    // Listen for Prometheus events
    this.eventBus.on('prometheus-exporter-started', () => {
      this.status = 'connected';
      this.render();
    });
    
    this.eventBus.on('prometheus-exporter-stopped', () => {
      this.status = 'disconnected';
      this.render();
    });
    
    this.eventBus.on('prometheus-exporter-error', () => {
      this.status = 'error';
      this.render();
    });
    
    // Listen for configuration changes
    this.eventBus.on('prometheus-config-saved', this._handlePrometheusSaved);
  }
  
  /**
   * Update connection status
   * @private
   */
  _updateStatus() {
    if (!this.integration) return;
    
    const info = this.integration.getInfo();
    if (info.running) {
      this.status = 'connected';
    } else {
      this.status = 'disconnected';
    }
    
    // Update status elements if they exist
    const statusEl = document.getElementById('prometheus-status');
    if (statusEl) {
      statusEl.textContent = this.status;
      statusEl.className = `prometheus-status ${this.status}`;
    }
    
    // Update metrics count
    const metricsCountEl = document.getElementById('prometheus-metrics-count');
    if (metricsCountEl && info.metricsCount !== undefined) {
      metricsCountEl.textContent = info.metricsCount;
    }
    
    // Update components count
    const componentsCountEl = document.getElementById('prometheus-components-count');
    if (componentsCountEl && info.componentsCount !== undefined) {
      componentsCountEl.textContent = info.componentsCount;
    }
    
    // Update scrapes count
    const scrapesTotalEl = document.getElementById('prometheus-scrapes-total');
    if (scrapesTotalEl && info.scrapesTotal !== undefined) {
      scrapesTotalEl.textContent = info.scrapesTotal;
    }
  }
  
  /**
   * Render the panel
   */
  render() {
    if (!this.container) return;
    
    const statusClass = this.status === 'connected' ? 'connected' : 
                        this.status === 'connecting' ? 'connecting' :
                        this.status === 'error' ? 'error' : 'disconnected';
    
    const info = this.integration ? this.integration.getInfo() : {
      port: this.prometheusOptions.port || 9091,
      endpoint: this.prometheusOptions.endpoint || '/metrics',
      url: `http://localhost:${this.prometheusOptions.port || 9091}${this.prometheusOptions.endpoint || '/metrics'}`,
      metricsCount: 0,
      componentsCount: 0,
      scrapesTotal: 0
    };
    
    this.container.innerHTML = `
      <div class="prometheus-connection-panel">
        <div class="panel-header">
          <h3>Prometheus Connection</h3>
          <span class="prometheus-status ${statusClass}" id="prometheus-status">${this.status}</span>
        </div>
        
        <div class="connection-details">
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${this.status}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Endpoint:</span>
            <span class="detail-value">${info.url}</span>
            <button class="copy-btn" data-clipboard-text="${info.url}" title="Copy URL">
              <i class="fa fa-copy"></i>
            </button>
          </div>
          <div class="detail-row">
            <span class="detail-label">Port:</span>
            <span class="detail-value">${info.port}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Path:</span>
            <span class="detail-value">${info.endpoint}</span>
          </div>
        </div>
        
        <div class="metrics-stats">
          <div class="stat-box">
            <span class="stat-value" id="prometheus-metrics-count">${info.metricsCount || 0}</span>
            <span class="stat-label">Metrics</span>
          </div>
          <div class="stat-box">
            <span class="stat-value" id="prometheus-components-count">${info.componentsCount || 0}</span>
            <span class="stat-label">Components</span>
          </div>
          <div class="stat-box">
            <span class="stat-value" id="prometheus-scrapes-total">${info.scrapesTotal || 0}</span>
            <span class="stat-label">Scrapes</span>
          </div>
        </div>
        
        <div class="configuration">
          <h4>Configuration</h4>
          <div class="config-form">
            <div class="form-row">
              <label for="prometheus-port">Port</label>
              <input type="number" id="prometheus-port" value="${info.port}" min="1" max="65535">
            </div>
            <div class="form-row">
              <label for="prometheus-endpoint">Endpoint</label>
              <input type="text" id="prometheus-endpoint" value="${info.endpoint}">
            </div>
          </div>
          <div class="action-buttons">
            ${this.status === 'connected' ? `
              <button id="stop-prometheus" class="btn btn-danger">
                <i class="fa fa-stop"></i> Stop
              </button>
              <button id="test-prometheus" class="btn btn-secondary">
                <i class="fa fa-flask"></i> Test Connection
              </button>
            ` : `
              <button id="start-prometheus" class="btn btn-primary">
                <i class="fa fa-play"></i> Start
              </button>
              <button id="save-prometheus-config" class="btn btn-secondary">
                <i class="fa fa-save"></i> Save Config
              </button>
            `}
          </div>
        </div>
        
        <div class="prometheus-help">
          <h4>Setup Instructions</h4>
          <p>To configure Prometheus to scrape metrics from this application:</p>
          <ol>
            <li>Ensure Prometheus is installed and running</li>
            <li>Add the following job configuration to your prometheus.yml:</li>
          </ol>
          <pre class="code-block"><code>scrape_configs:
  - job_name: 'hallucinate_app'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:${info.port}']</code></pre>
          <button class="copy-btn" data-clipboard-text="scrape_configs:
  - job_name: 'hallucinate_app'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:${info.port}']">
            <i class="fa fa-copy"></i> Copy Config
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners after rendering
    setTimeout(() => {
      const startBtn = document.getElementById('start-prometheus');
      if (startBtn) {
        startBtn.addEventListener('click', this._handleStartClick);
      }
      
      const stopBtn = document.getElementById('stop-prometheus');
      if (stopBtn) {
        stopBtn.addEventListener('click', this._handleStopClick);
      }
      
      const saveBtn = document.getElementById('save-prometheus-config');
      if (saveBtn) {
        saveBtn.addEventListener('click', this._handleConfigChange);
      }
      
      const testBtn = document.getElementById('test-prometheus');
      if (testBtn) {
        testBtn.addEventListener('click', () => {
          window.open(info.url, '_blank');
        });
      }
      
      // Set up copy buttons
      const copyBtns = document.querySelectorAll('.copy-btn');
      copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const text = btn.dataset.clipboardText;
          if (text) {
            navigator.clipboard.writeText(text).then(() => {
              btn.classList.add('copied');
              setTimeout(() => {
                btn.classList.remove('copied');
              }, 2000);
            });
          }
        });
      });
    }, 0);
  }
  
  /**
   * Handle start button click
   * @private
   */
  async _handleStartClick() {
    try {
      this.status = 'connecting';
      this.render();
      
      await this._startPrometheus();
    } catch (error) {
      console.error('Failed to start Prometheus exporter:', error);
      this.status = 'error';
      this.render();
    }
  }
  
  /**
   * Start the Prometheus exporter
   * @private
   */
  async _startPrometheus() {
    if (!this.integration) return;
    
    try {
      // Get current configuration from form if available
      this._updateConfigFromForm();
      
      // Start the exporter
      await this.integration.start();
      
      // Update status
      this.status = 'connected';
      this.render();
      
      return true;
    } catch (error) {
      console.error('Error starting Prometheus exporter:', error);
      this.status = 'error';
      this.render();
      
      throw error;
    }
  }
  
  /**
   * Handle stop button click
   * @private
   */
  async _handleStopClick() {
    try {
      if (!this.integration) return;
      
      // Stop the exporter
      await this.integration.stop();
      
      // Update status
      this.status = 'disconnected';
      this.render();
    } catch (error) {
      console.error('Failed to stop Prometheus exporter:', error);
      this.status = 'error';
      this.render();
    }
  }
  
  /**
   * Handle configuration change
   * @private
   */
  async _handleConfigChange() {
    try {
      // Get configuration from form
      const portInput = document.getElementById('prometheus-port');
      const endpointInput = document.getElementById('prometheus-endpoint');
      
      if (!portInput || !endpointInput) return;
      
      const port = parseInt(portInput.value, 10);
      const endpoint = endpointInput.value;
      
      // Validate input
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Port must be a valid number between 1 and 65535');
      }
      
      if (!endpoint || !endpoint.startsWith('/')) {
        throw new Error('Endpoint must start with "/"');
      }
      
      // Save configuration
      this.prometheusOptions = {
        ...this.prometheusOptions,
        port,
        endpoint
      };
      
      // Emit configuration saved event
      this.eventBus.emit('prometheus-config-saved', this.prometheusOptions);
      
      // Show success message
      const saveBtn = document.getElementById('save-prometheus-config');
      if (saveBtn) {
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
          saveBtn.innerHTML = '<i class="fa fa-save"></i> Save Config';
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save Prometheus configuration:', error);
      
      // Show error message
      const saveBtn = document.getElementById('save-prometheus-config');
      if (saveBtn) {
        saveBtn.textContent = 'Error!';
        saveBtn.style.backgroundColor = 'var(--color-danger)';
        setTimeout(() => {
          saveBtn.innerHTML = '<i class="fa fa-save"></i> Save Config';
          saveBtn.style.backgroundColor = '';
        }, 2000);
      }
    }
  }
  
  /**
   * Handle Prometheus configuration saved event
   * @private
   * @param {Object} config - Saved configuration
   */
  _handlePrometheusSaved(config) {
    // Update configuration
    this.prometheusOptions = {
      ...this.prometheusOptions,
      ...config
    };
    
    // Re-create integration if needed
    if (this.integration && this.status !== 'connected') {
      this.integration = new PrometheusIntegration({
        eventBus: this.eventBus,
        exporterOptions: {
          ...this.prometheusOptions,
          port: parseInt(this.prometheusOptions.port, 10),
          autoStart: false
        }
      });
    }
    
    // Update UI
    this.render();
  }
  
  /**
   * Update configuration from form
   * @private
   */
  _updateConfigFromForm() {
    const portInput = document.getElementById('prometheus-port');
    const endpointInput = document.getElementById('prometheus-endpoint');
    
    if (!portInput || !endpointInput) return;
    
    const port = parseInt(portInput.value, 10);
    const endpoint = endpointInput.value;
    
    // Validate and update if valid
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      this.prometheusOptions.port = port;
    }
    
    if (endpoint && endpoint.startsWith('/')) {
      this.prometheusOptions.endpoint = endpoint;
    }
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Stop status update interval
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
    
    // Stop Prometheus integration if running
    if (this.integration && this.status === 'connected') {
      this.integration.stop().catch(err => {
        console.error('Error stopping Prometheus integration during disposal:', err);
      });
    }
    
    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    // Remove event listeners
    this.eventBus.removeListener('prometheus-exporter-started');
    this.eventBus.removeListener('prometheus-exporter-stopped');
    this.eventBus.removeListener('prometheus-exporter-error');
    this.eventBus.removeListener('prometheus-config-saved', this._handlePrometheusSaved);
  }
}

export default PrometheusConnectionPanel;