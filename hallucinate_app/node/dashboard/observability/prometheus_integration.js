/**
 * Prometheus Integration for Metrics Dashboard
 * 
 * Integrates the Metrics Dashboard with Prometheus for metrics collection,
 * storage, and visualization in Grafana
 */

import PrometheusExporter from './prometheus_exporter.js';
import { MetricsCollector } from './metrics_collector.js';
import { getMetricsRegistry } from './metrics_registry.js';

/**
 * PrometheusIntegration class
 * Provides integration between the Metrics Dashboard and Prometheus
 */
class PrometheusIntegration {
  /**
   * Creates a new PrometheusIntegration
   * @param {Object} options - Configuration options
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.resources - Resource pool for accessing shared components
   * @param {Object} options.exporterOptions - Options for the Prometheus exporter
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || { on: () => {}, emit: () => {} };
    this.resources = options.resources || {};
    this.options = {
      autoStart: true,
      defaultLabels: {
        application: 'hallucinate_app',
        version: process.env.npm_package_version || 'unknown',
        environment: process.env.NODE_ENV || 'development'
      },
      ...options
    };
    
    // Create metrics collector for Prometheus integration itself
    this.collector = new MetricsCollector({
      component: 'prometheus_integration',
      registry: getMetricsRegistry()
    });
    
    // Create Prometheus exporter
    this.exporter = new PrometheusExporter({
      port: this.options.exporterOptions?.port || 9091,
      endpoint: this.options.exporterOptions?.endpoint || '/metrics',
      labels: {
        ...this.options.defaultLabels,
        ...(this.options.exporterOptions?.labels || {})
      }
    });
    
    // Create basic metrics
    this._initializeMetrics();
    
    // Start exporter automatically if configured
    if (this.options.autoStart) {
      this.start().catch(err => {
        console.error('Failed to auto-start Prometheus exporter:', err);
      });
    }
  }
  
  /**
   * Initialize metrics for Prometheus integration
   * @private
   */
  _initializeMetrics() {
    // Create counters
    this.collector.createCounter(
      'prometheus_scrapes_total',
      'Total number of Prometheus scrape requests'
    );
    
    this.collector.createCounter(
      'prometheus_scrape_errors_total',
      'Total number of Prometheus scrape errors',
      ['error_type']
    );
    
    this.collector.createCounter(
      'prometheus_export_operations_total',
      'Total number of metric export operations'
    );
    
    // Create gauges
    this.collector.createGauge(
      'prometheus_up',
      'Whether the Prometheus exporter is running (1 = up, 0 = down)'
    );
    
    this.collector.createGauge(
      'prometheus_metrics_count',
      'Number of metrics being exported to Prometheus'
    );
    
    this.collector.createGauge(
      'prometheus_components_count',
      'Number of components with metrics being exported to Prometheus'
    );
    
    // Create histograms
    this.collector.createHistogram(
      'prometheus_scrape_duration_seconds',
      'Duration of Prometheus scrape operations in seconds'
    );
    
    this.collector.createHistogram(
      'prometheus_export_size_bytes',
      'Size of exported metrics data in bytes'
    );
  }
  
  /**
   * Start the Prometheus exporter
   * @returns {Promise<void>}
   */
  async start() {
    try {
      await this.exporter.start();
      
      // Update metrics
      this.collector.setGauge('prometheus_up', 1);
      
      // Set up event listeners for scrape requests
      this.exporter.server.on('request', (req, res) => {
        if (req.url === this.exporter.options.endpoint && req.method === 'GET') {
          const startTime = process.hrtime();
          
          // Track request in our collector
          this.collector.incrementCounter('prometheus_scrapes_total');
          
          // Track response for metrics
          res.on('finish', () => {
            // Calculate duration
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds + nanoseconds / 1e9;
            
            // Record duration
            this.collector.observeHistogram('prometheus_scrape_duration_seconds', duration);
            
            // Record response size if available
            const contentLength = res.getHeader('content-length');
            if (contentLength) {
              this.collector.observeHistogram('prometheus_export_size_bytes', parseInt(contentLength, 10));
            }
            
            // Handle errors
            if (res.statusCode >= 400) {
              this.collector.incrementCounter('prometheus_scrape_errors_total', {
                error_type: `http_${res.statusCode}`
              });
            }
          });
        }
      });
      
      // Update metrics count and components count
      this._updateMetricsStats();
      
      // Set up periodic stats update
      this.statsInterval = setInterval(() => {
        this._updateMetricsStats();
      }, 60000); // Update every minute
      
      // Emit started event
      this.eventBus.emit('prometheus-exporter-started', {
        port: this.exporter.options.port,
        endpoint: this.exporter.options.endpoint
      });
      
      return true;
    } catch (error) {
      // Update metrics to indicate failure
      this.collector.setGauge('prometheus_up', 0);
      
      // Increment error counter
      this.collector.incrementCounter('prometheus_scrape_errors_total', {
        error_type: 'startup_error'
      });
      
      // Emit error event
      this.eventBus.emit('prometheus-exporter-error', {
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Stop the Prometheus exporter
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }
      
      await this.exporter.stop();
      
      // Update metrics
      this.collector.setGauge('prometheus_up', 0);
      
      // Emit stopped event
      this.eventBus.emit('prometheus-exporter-stopped');
      
      return true;
    } catch (error) {
      // Emit error event
      this.eventBus.emit('prometheus-exporter-error', {
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Update metrics statistics
   * @private
   */
  _updateMetricsStats() {
    try {
      // Get all metrics from the registry
      const metrics = getMetricsRegistry().getAllMetrics();
      
      // Count components with metrics
      const componentCount = Object.keys(metrics.components).length;
      this.collector.setGauge('prometheus_components_count', componentCount);
      
      // Count total metrics
      let metricCount = 0;
      
      for (const component of Object.values(metrics.components)) {
        metricCount += Object.keys(component.counters).length;
        metricCount += Object.keys(component.gauges).length;
        metricCount += Object.keys(component.histograms).length;
      }
      
      this.collector.setGauge('prometheus_metrics_count', metricCount);
      
      // Increment export operations counter
      this.collector.incrementCounter('prometheus_export_operations_total');
    } catch (error) {
      console.error('Error updating metrics stats:', error);
    }
  }
  
  /**
   * Get information about the Prometheus exporter
   * @returns {Object} Exporter information
   */
  getInfo() {
    return {
      running: this.exporter.running,
      port: this.exporter.options.port,
      endpoint: this.exporter.options.endpoint,
      url: `http://localhost:${this.exporter.options.port}${this.exporter.options.endpoint}`,
      metricsCount: this.collector.getGauge('prometheus_metrics_count') || 0,
      componentsCount: this.collector.getGauge('prometheus_components_count') || 0,
      scrapesTotal: this.collector.getCounter('prometheus_scrapes_total') || 0,
      scrapeErrorsTotal: this.collector.getCounter('prometheus_scrape_errors_total') || 0
    };
  }
}

export default PrometheusIntegration;