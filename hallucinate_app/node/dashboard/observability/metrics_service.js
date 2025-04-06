/**
 * Metrics Service for PyArrow Content Index Dashboard
 * Centralizes metrics collection, aggregation, and reporting
 */

import MetricsCollector from './metrics_collector.js';

class MetricsService {
  /**
   * Create a new metrics service
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      reportingInterval: 60000, // 1 minute
      enablePrometheusEndpoint: true,
      prometheusPushGateway: null,
      metricsPrefix: 'pyarrow_dashboard',
      ...options
    };
    
    // Main metrics collector for the service itself
    this.metricsCollector = new MetricsCollector('metrics_service', {
      defaultLabels: {
        service: 'metrics_service'
      }
    });
    
    // Map to store all registered component collectors
    this.componentCollectors = new Map();
    
    // Reporting interval
    this.reportingInterval = null;
    
    // Keep track of overall stats
    this.totalMetrics = 0;
    this.componentCount = 0;
    this.lastReportTime = null;
    
    // Event listeners for metrics reporting
    this.eventListeners = new Map();
  }
  
  /**
   * Initialize the metrics service
   * @returns {Promise<void>}
   */
  async init() {
    // Start reporting interval
    this.startReporting(this.options.reportingInterval);
    
    // Set up Prometheus endpoint if enabled
    if (this.options.enablePrometheusEndpoint) {
      this._setupPrometheusEndpoint();
    }
    
    // Set up push gateway if configured
    if (this.options.prometheusPushGateway) {
      this._setupPrometheusPushGateway();
    }
    
    this.metricsCollector.incrementCounter('service_initialized');
    
    return true;
  }
  
  /**
   * Register a component collector with the service
   * @param {string} componentName - Component name
   * @param {MetricsCollector} collector - Metrics collector for the component
   * @returns {MetricsCollector} The registered collector
   */
  registerCollector(componentName, collector) {
    if (!collector) {
      // Create a new collector if one wasn't provided
      collector = new MetricsCollector(componentName, {
        metricReporter: (metrics) => this._handleComponentMetrics(componentName, metrics)
      });
    }
    
    // Store the collector
    this.componentCollectors.set(componentName, collector);
    
    // Update stats
    this.componentCount = this.componentCollectors.size;
    this.metricsCollector.setGauge('registered_components', this.componentCount);
    
    // Log registration
    this.metricsCollector.incrementCounter('component_registrations');
    
    return collector;
  }
  
  /**
   * Unregister a component collector
   * @param {string} componentName - Component name
   * @returns {boolean} Whether the collector was unregistered
   */
  unregisterCollector(componentName) {
    const result = this.componentCollectors.delete(componentName);
    
    if (result) {
      // Update stats
      this.componentCount = this.componentCollectors.size;
      this.metricsCollector.setGauge('registered_components', this.componentCount);
      
      // Log unregistration
      this.metricsCollector.incrementCounter('component_unregistrations');
    }
    
    return result;
  }
  
  /**
   * Get a component collector by name
   * @param {string} componentName - Component name
   * @returns {MetricsCollector|null} The component collector or null if not found
   */
  getCollector(componentName) {
    return this.componentCollectors.get(componentName) || null;
  }
  
  /**
   * Start reporting metrics at intervals
   * @param {number} intervalMs - Reporting interval in milliseconds
   */
  startReporting(intervalMs = 60000) {
    // Clear any existing interval
    this.stopReporting();
    
    // Set up new interval
    this.reportingInterval = setInterval(() => {
      this.reportAllMetrics();
    }, intervalMs);
    
    this.metricsCollector.incrementCounter('reporting_started');
  }
  
  /**
   * Stop reporting metrics
   */
  stopReporting() {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
      this.metricsCollector.incrementCounter('reporting_stopped');
    }
  }
  
  /**
   * Report metrics from all components
   */
  reportAllMetrics() {
    // Get metrics from all components
    const allMetrics = this.getAllMetrics();
    
    // Update stats
    this.totalMetrics = this._countMetrics(allMetrics);
    this.lastReportTime = new Date();
    
    this.metricsCollector.setGauge('total_metrics', this.totalMetrics);
    this.metricsCollector.incrementCounter('metrics_reports');
    
    // Notify listeners
    this._notifyListeners('metrics-report', allMetrics);
    
    // Log metrics if enabled
    if (this.options.logMetrics) {
      console.log('[Metrics Report]', allMetrics);
    }
    
    // If we have a push gateway, send metrics there
    this._pushToGateway(allMetrics);
    
    return allMetrics;
  }
  
  /**
   * Get metrics from all components
   * @returns {Object} Combined metrics from all components
   */
  getAllMetrics() {
    const combinedMetrics = {
      components: {},
      totals: {
        counters: {},
        gauges: {},
        histograms: {}
      },
      timestamp: new Date().toISOString()
    };
    
    // Get metrics from each component
    for (const [componentName, collector] of this.componentCollectors.entries()) {
      const metrics = collector.exportMetrics();
      combinedMetrics.components[componentName] = metrics;
      
      // Aggregate totals
      this._aggregateMetrics(combinedMetrics.totals, metrics);
    }
    
    // Add service metrics
    const serviceMetrics = this.metricsCollector.exportMetrics();
    combinedMetrics.components['metrics_service'] = serviceMetrics;
    this._aggregateMetrics(combinedMetrics.totals, serviceMetrics);
    
    return combinedMetrics;
  }
  
  /**
   * Get all metrics in Prometheus format
   * @returns {string} Prometheus formatted metrics
   */
  getPrometheusMetrics() {
    const lines = [];
    
    // Add metrics from each component
    for (const [componentName, collector] of this.componentCollectors.entries()) {
      // Add a comment to separate component metrics
      lines.push(`# HELP ${this.options.metricsPrefix}_${componentName} Metrics for ${componentName}`);
      
      // Get Prometheus formatted metrics and add prefix
      const componentMetrics = collector.exportPrometheusMetrics()
        .split('\n')
        .map(line => {
          // Only add prefix to actual metric lines, not comments
          if (line.startsWith('#')) {
            return line;
          }
          return line.replace(/^([a-z_]+)/, `${this.options.metricsPrefix}_$1`);
        });
      
      lines.push(...componentMetrics);
      lines.push(''); // Add empty line for readability
    }
    
    // Add service metrics
    lines.push(`# HELP ${this.options.metricsPrefix}_metrics_service Metrics Service internal metrics`);
    const serviceMetrics = this.metricsCollector.exportPrometheusMetrics()
      .split('\n')
      .map(line => {
        if (line.startsWith('#')) {
          return line;
        }
        return line.replace(/^([a-z_]+)/, `${this.options.metricsPrefix}_$1`);
      });
    
    lines.push(...serviceMetrics);
    
    return lines.join('\n');
  }
  
  /**
   * Add an event listener for metrics events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event).push(callback);
  }
  
  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {boolean} Whether the listener was removed
   */
  removeEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      return false;
    }
    
    const listeners = this.eventListeners.get(event);
    const index = listeners.indexOf(callback);
    
    if (index !== -1) {
      listeners.splice(index, 1);
      return true;
    }
    
    return false;
  }
  
  /**
   * Dispose of the metrics service and clean up resources
   */
  dispose() {
    // Stop reporting
    this.stopReporting();
    
    // Dispose all collectors
    for (const collector of this.componentCollectors.values()) {
      collector.dispose();
    }
    
    // Clear component collectors
    this.componentCollectors.clear();
    this.componentCount = 0;
    
    // Dispose service collector
    this.metricsCollector.dispose();
    
    // Clear event listeners
    this.eventListeners.clear();
    
    // Log final stats
    console.log('[Metrics Service] Disposed');
  }
  
  /**
   * Handle metrics from a component
   * @private
   * @param {string} componentName - Component name
   * @param {Object} metrics - Component metrics
   */
  _handleComponentMetrics(componentName, metrics) {
    // Just notify listeners for now
    this._notifyListeners('component-metrics', {
      component: componentName,
      metrics
    });
  }
  
  /**
   * Set up a Prometheus metrics endpoint
   * @private
   */
  _setupPrometheusEndpoint() {
    // This would typically be done on the server side
    // For browser implementation, we'll create an event handler
    
    // Register listener for requests
    this.addEventListener('prometheus-scrape', () => {
      return this.getPrometheusMetrics();
    });
    
    console.log('[Metrics Service] Prometheus endpoint configured');
  }
  
  /**
   * Set up a Prometheus push gateway
   * @private
   */
  _setupPrometheusPushGateway() {
    // This would be implemented to push metrics to a gateway
    // For now, we'll just log that it's configured
    console.log('[Metrics Service] Prometheus push gateway configured:', this.options.prometheusPushGateway);
  }
  
  /**
   * Push metrics to a Prometheus push gateway
   * @private
   * @param {Object} metrics - Metrics to push
   */
  _pushToGateway(metrics) {
    if (!this.options.prometheusPushGateway) {
      return;
    }
    
    // Convert metrics to Prometheus format
    const prometheusMetrics = this.getPrometheusMetrics();
    
    // In a real implementation, this would use fetch to send metrics
    // For now, we'll just log that it would be pushed
    console.log(`[Metrics Service] Would push ${prometheusMetrics.length} bytes to gateway`);
    
    // Increment counter for pushes
    this.metricsCollector.incrementCounter('gateway_pushes');
  }
  
  /**
   * Notify all listeners for an event
   * @private
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  _notifyListeners(event, data) {
    if (!this.eventListeners.has(event)) {
      return;
    }
    
    for (const callback of this.eventListeners.get(event)) {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Metrics Service] Error in listener for ${event}:`, error);
      }
    }
  }
  
  /**
   * Aggregate metrics from a component into totals
   * @private
   * @param {Object} totals - Totals object to update
   * @param {Object} metrics - Component metrics to aggregate
   */
  _aggregateMetrics(totals, metrics) {
    // Aggregate counters
    for (const [key, counter] of Object.entries(metrics.counters)) {
      const name = counter.name;
      
      if (!totals.counters[name]) {
        totals.counters[name] = {
          name,
          value: 0,
          components: []
        };
      }
      
      totals.counters[name].value += counter.value;
      totals.counters[name].components.push({
        component: counter.labels.component,
        value: counter.value
      });
    }
    
    // Aggregate histograms (we'll just track count and sum)
    for (const [key, histogram] of Object.entries(metrics.histograms)) {
      const name = histogram.name;
      
      if (!totals.histograms[name]) {
        totals.histograms[name] = {
          name,
          count: 0,
          sum: 0,
          components: []
        };
      }
      
      totals.histograms[name].count += histogram.count;
      totals.histograms[name].sum += histogram.sum;
      totals.histograms[name].components.push({
        component: histogram.labels.component,
        count: histogram.count,
        sum: histogram.sum
      });
    }
    
    // We don't aggregate gauges as they represent current values
  }
  
  /**
   * Count the total number of metrics
   * @private
   * @param {Object} allMetrics - All metrics
   * @returns {number} Total number of metrics
   */
  _countMetrics(allMetrics) {
    let count = 0;
    
    // Count metrics in each component
    for (const componentMetrics of Object.values(allMetrics.components)) {
      count += Object.keys(componentMetrics.counters).length;
      count += Object.keys(componentMetrics.gauges).length;
      count += Object.keys(componentMetrics.histograms).length;
    }
    
    return count;
  }
}

// Export the class
export default MetricsService;