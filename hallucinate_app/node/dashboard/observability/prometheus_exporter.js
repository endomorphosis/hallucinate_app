/**
 * Prometheus Metrics Exporter
 * 
 * Provides a Prometheus-compatible HTTP endpoint for metrics collection
 * and integration with monitoring systems
 */

import http from 'http';
import { getMetricsRegistry } from './metrics_registry.js';

/**
 * PrometheusExporter class for exposing metrics to Prometheus
 */
class PrometheusExporter {
  /**
   * Creates a new PrometheusExporter
   * @param {Object} options - Configuration options
   * @param {number} options.port - Port to listen on (default: 9091)
   * @param {string} options.endpoint - Metrics endpoint path (default: /metrics)
   * @param {Object} options.labels - Global labels to add to all metrics
   * @param {boolean} options.autoStart - Whether to start the server immediately (default: false)
   */
  constructor(options = {}) {
    this.options = {
      port: 9091,
      endpoint: '/metrics',
      labels: {},
      autoStart: false,
      ...options
    };
    
    this.server = null;
    this.registry = getMetricsRegistry();
    this.running = false;
    this.requestCounter = 0;
    
    // Bind methods
    this._handleRequest = this._handleRequest.bind(this);
  }
  
  /**
   * Start the Prometheus metrics server
   * @returns {Promise<void>}
   */
  start() {
    if (this.running) {
      console.warn('Prometheus exporter already running');
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer(this._handleRequest);
        
        this.server.listen(this.options.port, () => {
          this.running = true;
          console.log(`Prometheus exporter started on port ${this.options.port}`);
          resolve();
        });
        
        this.server.on('error', (err) => {
          console.error('Error starting Prometheus exporter server:', err);
          this.running = false;
          reject(err);
        });
      } catch (error) {
        console.error('Failed to start Prometheus exporter:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Stop the Prometheus metrics server
   * @returns {Promise<void>}
   */
  stop() {
    if (!this.running || !this.server) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          console.error('Error stopping Prometheus exporter server:', err);
          reject(err);
          return;
        }
        
        this.running = false;
        console.log('Prometheus exporter server stopped');
        resolve();
      });
    });
  }
  
  /**
   * Handle HTTP requests to the metrics endpoint
   * @private
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   */
  _handleRequest(req, res) {
    // Only handle requests to the metrics endpoint
    if (req.url !== this.options.endpoint) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    
    // Only handle GET requests
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }
    
    // Track request count
    this.requestCounter++;
    
    try {
      // Get metrics from registry
      const metrics = this._collectMetrics();
      
      // Send metrics as response
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.end(metrics);
    } catch (error) {
      console.error('Error collecting metrics:', error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
  
  /**
   * Collect metrics from registry and format for Prometheus
   * @private
   * @returns {string} Prometheus-formatted metrics
   */
  _collectMetrics() {
    // Get all metrics from the registry
    const metricsData = this.registry.getAllMetrics();
    
    // Format metrics for Prometheus
    let output = [];
    
    // Add internal metrics about the exporter itself
    output.push('# HELP hallucinate_app_metrics_exporter_requests_total Total number of scrape requests received');
    output.push('# TYPE hallucinate_app_metrics_exporter_requests_total counter');
    output.push(`hallucinate_app_metrics_exporter_requests_total ${this.requestCounter}`);
    output.push('');
    
    // Format component metrics
    for (const [componentName, componentMetrics] of Object.entries(metricsData.components)) {
      // Process counters
      for (const [name, counter] of Object.entries(componentMetrics.counters)) {
        output.push(`# HELP ${this._sanitizeName(name)} ${counter.help || ''}`);
        output.push(`# TYPE ${this._sanitizeName(name)} counter`);
        output.push(this._formatMetric(name, counter.value, { component: componentName, ...counter.labels }));
        output.push('');
      }
      
      // Process gauges
      for (const [name, gauge] of Object.entries(componentMetrics.gauges)) {
        output.push(`# HELP ${this._sanitizeName(name)} ${gauge.help || ''}`);
        output.push(`# TYPE ${this._sanitizeName(name)} gauge`);
        output.push(this._formatMetric(name, gauge.value, { component: componentName, ...gauge.labels }));
        output.push('');
      }
      
      // Process histograms
      for (const [name, histogram] of Object.entries(componentMetrics.histograms)) {
        output.push(`# HELP ${this._sanitizeName(name)} ${histogram.help || ''}`);
        output.push(`# TYPE ${this._sanitizeName(name)} histogram`);
        
        // Add count
        output.push(this._formatMetric(`${name}_count`, histogram.count, { component: componentName, ...histogram.labels }));
        
        // Add sum
        output.push(this._formatMetric(`${name}_sum`, histogram.sum, { component: componentName, ...histogram.labels }));
        
        // Add buckets if available
        if (histogram.buckets) {
          for (const [bucketLe, bucketCount] of Object.entries(histogram.buckets)) {
            output.push(this._formatMetric(
              `${name}_bucket`, 
              bucketCount, 
              { component: componentName, le: bucketLe, ...histogram.labels }
            ));
          }
        }
        
        output.push('');
      }
    }
    
    return output.join('\n');
  }
  
  /**
   * Format a single metric for Prometheus
   * @private
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} labels - Metric labels
   * @returns {string} Prometheus-formatted metric
   */
  _formatMetric(name, value, labels = {}) {
    // Combine with global labels
    const allLabels = { ...this.options.labels, ...labels };
    
    // Sanitize name
    const sanitizedName = this._sanitizeName(name);
    
    // Format labels
    let labelString = '';
    if (Object.keys(allLabels).length > 0) {
      const labelParts = [];
      for (const [key, val] of Object.entries(allLabels)) {
        labelParts.push(`${key}="${this._escapeString(val.toString())}"`);
      }
      labelString = `{${labelParts.join(',')}}`;
    }
    
    // Format value (ensure numeric)
    const numValue = Number(value);
    const formattedValue = isNaN(numValue) ? 0 : numValue;
    
    return `${sanitizedName}${labelString} ${formattedValue}`;
  }
  
  /**
   * Sanitize a metric name for Prometheus
   * @private
   * @param {string} name - Metric name
   * @returns {string} Sanitized name
   */
  _sanitizeName(name) {
    // Add hallucinate_app_ prefix if not already present
    const prefix = 'hallucinate_app_';
    if (!name.startsWith(prefix)) {
      name = prefix + name;
    }
    
    // Replace invalid characters with underscores
    return name.replace(/[^a-zA-Z0-9_:]/g, '_');
  }
  
  /**
   * Escape a string for Prometheus label values
   * @private
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  _escapeString(str) {
    return str
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/"/g, '\\"')   // Escape double quotes
      .replace(/\n/g, '\\n'); // Escape newlines
  }
}

export default PrometheusExporter;