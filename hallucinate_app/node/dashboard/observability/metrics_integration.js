/**
 * Metrics Dashboard Integration
 * Provides integration between the metrics dashboard and the main dashboard
 */

import MetricsDashboard from './metrics_dashboard.js';
import { getMetricsRegistry } from './metrics_registry.js';
import { MetricsCollector } from './metrics_collector.js';

/**
 * Metrics Integration class
 * Manages integration between metrics components and the main dashboard
 */
class MetricsIntegration {
  /**
   * Create a new metrics integration
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element for the metrics dashboard
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.resources - Resource pool for accessing shared components
   * @param {boolean} options.useMockImplementation - Whether to use a mock implementation for testing
   */
  constructor(options = {}) {
    this.container = options.container;
    this.eventBus = options.eventBus || { on: () => {}, emit: () => {} };
    this.resources = options.resources || {};
    this.options = {
      refreshInterval: 10000, // 10 seconds
      darkMode: false,
      showAllMetrics: false,
      prometheus: {
        enabled: true,
        port: 9091,
        endpoint: '/metrics',
        autoStart: true
      },
      ...options
    };
    
    // Component references
    this.metricsDashboard = null;
    this.metricsRegistry = getMetricsRegistry();
    
    // Create collectors for each component
    this.collectors = new Map();
    
    // Bind methods
    this._handleComponentEvent = this._handleComponentEvent.bind(this);
    this._handleTabShown = this._handleTabShown.bind(this);
  }
  
  /**
   * Initialize the metrics integration
   * @returns {Promise<void>}
   */
  async init() {
    try {
      // Initialize the metrics dashboard
      this.metricsDashboard = new MetricsDashboard({
        container: this.container,
        eventBus: this.eventBus,
        refreshInterval: this.options.refreshInterval,
        darkMode: this.options.darkMode,
        showAllMetrics: this.options.showAllMetrics,
        prometheus: this.options.prometheus
      });
      
      await this.metricsDashboard.init();
      
      // Initialize collectors for dashboard components
      this._initializeCollectors();
      
      // Set up event listeners
      this._setupEventListeners();
      
      console.log('Metrics integration initialized successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize metrics integration:', error);
      
      // Show error in container
      if (this.container) {
        this.container.innerHTML = `
          <div class="metrics-error">
            <h3>Error Initializing Metrics Integration</h3>
            <p>${error.message}</p>
          </div>
        `;
      }
      
      throw error;
    }
  }
  
  /**
   * Initialize metric collectors for dashboard components
   * @private
   */
  _initializeCollectors() {
    // Create collector for PyArrow Content Index Dashboard
    const dashboardCollector = new MetricsCollector({
      component: 'pyarrow_content_index_dashboard',
      registry: this.metricsRegistry
    });
    this.collectors.set('dashboard', dashboardCollector);
    
    // Create collector for Content Browser
    const browserCollector = new MetricsCollector({
      component: 'content_browser',
      registry: this.metricsRegistry
    });
    this.collectors.set('content_browser', browserCollector);
    
    // Create collector for Statistics component
    const statisticsCollector = new MetricsCollector({
      component: 'statistics',
      registry: this.metricsRegistry
    });
    this.collectors.set('statistics', statisticsCollector);
    
    // Create collector for Security component
    const securityCollector = new MetricsCollector({
      component: 'security',
      registry: this.metricsRegistry
    });
    this.collectors.set('security', securityCollector);
    
    // Create collector for Metrics component itself (meta!)
    const metricsCollector = new MetricsCollector({
      component: 'metrics_dashboard',
      registry: this.metricsRegistry
    });
    this.collectors.set('metrics', metricsCollector);
    
    // Initialize dashboard metrics
    this._initializeDashboardMetrics(dashboardCollector);
  }
  
  /**
   * Initialize dashboard metrics
   * @private
   * @param {MetricsCollector} collector - Metrics collector
   */
  _initializeDashboardMetrics(collector) {
    // Create counters
    collector.createCounter('page_views_total', 'Total dashboard page views');
    collector.createCounter('search_queries_total', 'Total search queries executed');
    collector.createCounter('content_entries_viewed_total', 'Total content entries viewed');
    collector.createCounter('content_entries_added_total', 'Total content entries added');
    collector.createCounter('content_entries_deleted_total', 'Total content entries deleted');
    collector.createCounter('errors_total', 'Total errors encountered', ['error_type']);
    
    // Create gauges
    collector.createGauge('content_entries_count', 'Current number of content entries');
    collector.createGauge('websocket_connected', 'Whether WebSocket is connected (1=yes, 0=no)');
    collector.createGauge('active_searches', 'Number of active search operations');
    collector.createGauge('tab_index', 'Current active tab index');
    
    // Create histograms
    collector.createHistogram('search_duration_seconds', 'Duration of search operations in seconds');
    collector.createHistogram('page_load_duration_seconds', 'Duration of page load operations in seconds');
    collector.createHistogram('render_duration_seconds', 'Duration of render operations in seconds');
    collector.createHistogram('api_request_duration_seconds', 'Duration of API requests in seconds', ['endpoint']);
  }
  
  /**
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for tab changes
    this.eventBus.on('tab-shown', this._handleTabShown);
    
    // Listen for content browser events
    this.eventBus.on('content-selected', (data) => {
      this._handleComponentEvent('content_browser', 'content-selected', data);
    });
    
    this.eventBus.on('search-executed', (data) => {
      this._handleComponentEvent('content_browser', 'search-executed', data);
    });
    
    // Listen for statistics events
    this.eventBus.on('statistics-updated', (data) => {
      this._handleComponentEvent('statistics', 'statistics-updated', data);
    });
    
    // Listen for security events
    this.eventBus.on('security-event', (data) => {
      this._handleComponentEvent('security', 'security-event', data);
    });
    
    // Listen for error events
    this.eventBus.on('error', (data) => {
      this._handleComponentEvent('dashboard', 'error', data);
    });
    
    // Listen for Prometheus events
    this.eventBus.on('prometheus-exporter-started', (data) => {
      console.log('Prometheus exporter started:', data);
      this._handleComponentEvent('metrics', 'prometheus-started', data);
    });
    
    this.eventBus.on('prometheus-exporter-stopped', () => {
      console.log('Prometheus exporter stopped');
      this._handleComponentEvent('metrics', 'prometheus-stopped', {});
    });
    
    this.eventBus.on('prometheus-exporter-error', (data) => {
      console.error('Prometheus exporter error:', data);
      this._handleComponentEvent('metrics', 'prometheus-error', data);
    });
  }
  
  /**
   * Handle component events for metrics
   * @private
   * @param {string} component - Component name
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  _handleComponentEvent(component, event, data) {
    const collector = this.collectors.get(component);
    if (!collector) return;
    
    // Record metrics based on event type
    switch (event) {
      case 'content-selected':
        collector.incrementCounter('content_entries_viewed_total');
        break;
        
      case 'search-executed':
        const dashboardCollector = this.collectors.get('dashboard');
        if (dashboardCollector) {
          dashboardCollector.incrementCounter('search_queries_total');
          
          // If timing data is available, record it
          if (data && data.duration) {
            dashboardCollector.observeHistogram('search_duration_seconds', data.duration / 1000);
          }
          
          // Update active searches gauge
          dashboardCollector.setGauge('active_searches', data.activeSearches || 0);
        }
        break;
        
      case 'statistics-updated':
        // If entry count is available, update gauge
        if (data && data.entryCount !== undefined) {
          const dashboardCollector = this.collectors.get('dashboard');
          if (dashboardCollector) {
            dashboardCollector.setGauge('content_entries_count', data.entryCount);
          }
        }
        break;
        
      case 'security-event':
        // Security events might be worth tracking for auditing
        if (data && data.type) {
          const securityCollector = this.collectors.get('security');
          if (securityCollector) {
            securityCollector.incrementCounter('security_events_total', {
              event_type: data.type
            });
          }
        }
        break;
        
      case 'error':
        // Track errors with their types
        const dashboardCollector = this.collectors.get('dashboard');
        if (dashboardCollector) {
          dashboardCollector.incrementCounter('errors_total', {
            error_type: data.type || 'unknown'
          });
        }
        break;
        
      // Handle Prometheus events
      case 'prometheus-started':
        // Create a 'prometheus_up' gauge if it doesn't exist
        if (!collector.hasMetric('prometheus_up')) {
          collector.createGauge('prometheus_up', 'Whether the Prometheus exporter is running (1=yes, 0=no)');
          collector.createCounter('prometheus_starts_total', 'Total number of Prometheus exporter starts');
        }
        
        // Update metrics
        collector.setGauge('prometheus_up', 1);
        collector.incrementCounter('prometheus_starts_total');
        break;
        
      case 'prometheus-stopped':
        // Update Prometheus status gauge
        if (collector.hasMetric('prometheus_up')) {
          collector.setGauge('prometheus_up', 0);
        }
        break;
        
      case 'prometheus-error':
        // Track Prometheus errors
        collector.incrementCounter('prometheus_errors_total', {
          error_type: data.error || 'unknown'
        });
        break;
    }
  }
  
  /**
   * Handle tab shown event
   * @private
   * @param {string} tabId - Tab ID
   */
  _handleTabShown(tabId) {
    // Record tab view metrics
    const dashboardCollector = this.collectors.get('dashboard');
    if (dashboardCollector) {
      // Increment page views counter
      dashboardCollector.incrementCounter('page_views_total', {
        tab: tabId
      });
      
      // Update current tab gauge
      const tabIndices = {
        'browser': 0,
        'stats': 1,
        'security': 2,
        'metrics': 3
      };
      
      if (tabId in tabIndices) {
        dashboardCollector.setGauge('tab_index', tabIndices[tabId]);
      }
    }
    
    // If metrics tab is shown, refresh the metrics dashboard
    if (tabId === 'metrics' && this.metricsDashboard) {
      this.metricsDashboard._handleRefresh();
    }
  }
  
  /**
   * Get metrics collector for a component
   * @param {string} component - Component name
   * @returns {MetricsCollector} Metrics collector
   */
  getCollector(component) {
    return this.collectors.get(component);
  }
  
  /**
   * Create a timer for measuring operation duration
   * @param {string} component - Component name
   * @param {string} operation - Operation name
   * @param {Object} labels - Additional labels
   * @returns {Function} End timer function that returns the duration
   */
  createTimer(component, operation, labels = {}) {
    const collector = this.collectors.get(component);
    if (!collector) {
      return () => 0;
    }
    
    return collector.startTimer(`${operation}_duration_seconds`, labels);
  }
  
  /**
   * Dispose the metrics integration and clean up resources
   */
  dispose() {
    // Dispose the metrics dashboard
    if (this.metricsDashboard) {
      this.metricsDashboard.dispose();
      this.metricsDashboard = null;
    }
    
    // Remove event listeners
    this.eventBus.removeListener('tab-shown', this._handleTabShown);
    
    // Clear collectors
    this.collectors.clear();
    
    console.log('Metrics integration disposed successfully');
  }
}

export default MetricsIntegration;