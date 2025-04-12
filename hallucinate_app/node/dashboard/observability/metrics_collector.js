/**
 * Metrics Collector for PyArrow Content Index Dashboard Components
 * Provides centralized metrics collection and reporting
 */

class MetricsCollector {
  /**
   * Create a new metrics collector
   * @param {Object} options - Configuration options
   * @param {string} options.component - Name of the component
   * @param {Object} options.registry - Metrics registry
   */
  constructor(options = {}) {
    this.componentName = options.component || 'unknown';
    this.registry = options.registry;
    this.options = options;
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.defaultLabels = {
      component: this.componentName,
      ...options.defaultLabels
    };
    
    // Track initialization
    this.incrementCounter('component_initialized');
    
    // Performance tracking
    this.startTime = performance.now();
    this.operationTimers = new Map();
    
    // Auto reporting interval (if enabled)
    this.autoReportInterval = null;
    if (options.autoReportInterval) {
      this.startAutoReporting(options.autoReportInterval);
    }
  }
  
  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} [value=1] - Increment value
   * @param {Object} [labels={}] - Metric labels
   * @returns {number} New counter value
   */
  incrementCounter(name, value = 1, labels = {}) {
    const key = this._getMetricKey(name, labels);
    
    if (!this.counters.has(key)) {
      this.counters.set(key, {
        name,
        value: 0,
        labels: { ...this.defaultLabels, ...labels }
      });
    }
    
    const counter = this.counters.get(key);
    counter.value += value;
    
    return counter.value;
  }
  
  /**
   * Set a gauge value
   * @param {string} name - Gauge name
   * @param {number} value - Gauge value
   * @param {Object} [labels={}] - Metric labels
   * @returns {number} Current gauge value
   */
  setGauge(name, value, labels = {}) {
    const key = this._getMetricKey(name, labels);
    
    this.gauges.set(key, {
      name,
      value,
      labels: { ...this.defaultLabels, ...labels }
    });
    
    return value;
  }
  
  /**
   * Increment a gauge
   * @param {string} name - Gauge name
   * @param {number} [value=1] - Increment value
   * @param {Object} [labels={}] - Metric labels
   * @returns {number} New gauge value
   */
  incrementGauge(name, value = 1, labels = {}) {
    const key = this._getMetricKey(name, labels);
    
    if (!this.gauges.has(key)) {
      this.gauges.set(key, {
        name,
        value: 0,
        labels: { ...this.defaultLabels, ...labels }
      });
    }
    
    const gauge = this.gauges.get(key);
    gauge.value += value;
    
    return gauge.value;
  }
  
  /**
   * Decrement a gauge
   * @param {string} name - Gauge name
   * @param {number} [value=1] - Decrement value
   * @param {Object} [labels={}] - Metric labels
   * @returns {number} New gauge value
   */
  decrementGauge(name, value = 1, labels = {}) {
    return this.incrementGauge(name, -value, labels);
  }
  
  /**
   * Record a value in a histogram
   * @param {string} name - Histogram name
   * @param {number} value - Value to record
   * @param {Object} [labels={}] - Metric labels
   * @returns {Object} Histogram data
   */
  recordHistogram(name, value, labels = {}) {
    const key = this._getMetricKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        buckets: {},
        labels: { ...this.defaultLabels, ...labels }
      });
    }
    
    const histogram = this.histograms.get(key);
    histogram.count += 1;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    
    // Update buckets for histogram visualization
    const bucketKey = this._getBucketKey(value);
    histogram.buckets[bucketKey] = (histogram.buckets[bucketKey] || 0) + 1;
    
    return histogram;
  }
  
  /**
   * Start a timer for duration tracking
   * @param {string} name - Timer name
   * @param {Object} [labels={}] - Metric labels
   * @returns {Object} Timer object with stop method
   */
  startTimer(name, labels = {}) {
    const startTime = performance.now();
    const timerId = `${name}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    this.operationTimers.set(timerId, {
      name,
      startTime,
      labels
    });
    
    // Return an object with a stop method
    return {
      stop: () => {
        const duration = (performance.now() - startTime) / 1000; // Convert to seconds
        this.recordHistogram(name, duration, labels);
        this.operationTimers.delete(timerId);
        return duration;
      },
      
      update: (newLabels = {}) => {
        const timer = this.operationTimers.get(timerId);
        if (timer) {
          timer.labels = { ...timer.labels, ...newLabels };
          this.operationTimers.set(timerId, timer);
        }
      }
    };
  }
  
  /**
   * Create a timed wrapper for a function
   * @param {Function} fn - Function to time
   * @param {string} name - Timer name
   * @param {Object} [labels={}] - Metric labels
   * @returns {Function} Wrapped function that records timing
   */
  timedFunction(fn, name, labels = {}) {
    return async (...args) => {
      const timer = this.startTimer(name, labels);
      try {
        const result = await fn(...args);
        return result;
      } finally {
        timer.stop();
      }
    };
  }
  
  /**
   * Record an error
   * @param {string} errorType - Type of error
   * @param {string} operation - Operation that caused the error
   * @param {Error} [error] - Error object
   * @param {Object} [labels={}] - Additional labels
   */
  recordError(errorType, operation, error = null, labels = {}) {
    this.incrementCounter('errors_total', 1, {
      error_type: errorType,
      operation,
      ...labels
    });
    
    if (error) {
      console.error(`[${this.componentName}] Error in ${operation}: ${error.message}`, error);
    }
  }
  
  /**
   * Start auto-reporting of metrics at intervals
   * @param {number} intervalMs - Reporting interval in milliseconds
   */
  startAutoReporting(intervalMs = 60000) {
    // Clear any existing interval
    if (this.autoReportInterval) {
      clearInterval(this.autoReportInterval);
    }
    
    // Set up new interval
    this.autoReportInterval = setInterval(() => {
      this.reportMetrics();
    }, intervalMs);
  }
  
  /**
   * Stop auto-reporting
   */
  stopAutoReporting() {
    if (this.autoReportInterval) {
      clearInterval(this.autoReportInterval);
      this.autoReportInterval = null;
    }
  }
  
  /**
   * Report metrics to console (for development) or monitoring system
   */
  reportMetrics() {
    const metrics = this.exportMetrics();
    
    // Log metrics for development
    if (this.options.logMetrics) {
      console.log(`[Metrics: ${this.componentName}]`, metrics);
    }
    
    // If a reporter function is provided, use it
    if (typeof this.options.metricReporter === 'function') {
      this.options.metricReporter(metrics, this.componentName);
    }
    
    // If window.electronAPI is available, report metrics through it
    if (window.electronAPI && window.electronAPI.reportMetrics) {
      window.electronAPI.reportMetrics(metrics, this.componentName);
    }
    
    // Calculate uptime
    const uptime = (performance.now() - this.startTime) / 1000; // in seconds
    this.setGauge('uptime_seconds', uptime);
  }
  
  /**
   * Export all metrics
   * @returns {Object} All metrics
   */
  exportMetrics() {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
      histograms: Object.fromEntries(this.histograms.entries()),
      component: this.componentName,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Export metrics in Prometheus format
   * @returns {string} Prometheus formatted metrics
   */
  exportPrometheusMetrics() {
    const lines = [];
    
    // Export counters
    for (const [key, counter] of this.counters.entries()) {
      const labelString = this._formatLabels(counter.labels);
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name}${labelString} ${counter.value}`);
    }
    
    // Export gauges
    for (const [key, gauge] of this.gauges.entries()) {
      const labelString = this._formatLabels(gauge.labels);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name}${labelString} ${gauge.value}`);
    }
    
    // Export histograms
    for (const [key, histogram] of this.histograms.entries()) {
      const labelString = this._formatLabels(histogram.labels);
      lines.push(`# TYPE ${histogram.name} histogram`);
      lines.push(`${histogram.name}_count${labelString} ${histogram.count}`);
      lines.push(`${histogram.name}_sum${labelString} ${histogram.sum}`);
      
      // Add bucket information for Prometheus histograms
      const bucketValues = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity];
      let cumulativeCount = 0;
      
      for (const upperBound of bucketValues) {
        const bucketKey = this._getBucketKeyFromValue(upperBound);
        cumulativeCount += histogram.buckets[bucketKey] || 0;
        lines.push(`${histogram.name}_bucket${labelString}{le="${upperBound}"} ${cumulativeCount}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get the current value of a counter
   * @param {string} name - Counter name
   * @param {Object} [labels={}] - Metric labels
   * @returns {number|null} Counter value or null if not found
   */
  getCounter(name, labels = {}) {
    const key = this._getMetricKey(name, labels);
    return this.counters.has(key) ? this.counters.get(key).value : null;
  }
  
  /**
   * Get the current value of a gauge
   * @param {string} name - Gauge name
   * @param {Object} [labels={}] - Metric labels
   * @returns {number|null} Gauge value or null if not found
   */
  getGauge(name, labels = {}) {
    const key = this._getMetricKey(name, labels);
    return this.gauges.has(key) ? this.gauges.get(key).value : null;
  }
  
  /**
   * Get histogram data
   * @param {string} name - Histogram name
   * @param {Object} [labels={}] - Metric labels
   * @returns {Object|null} Histogram data or null if not found
   */
  getHistogram(name, labels = {}) {
    const key = this._getMetricKey(name, labels);
    return this.histograms.has(key) ? this.histograms.get(key) : null;
  }
  
  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.operationTimers.clear();
    
    // Re-initialize component counter
    this.incrementCounter('component_initialized');
  }
  
  /**
   * Check if a metric exists
   * @param {string} name - Metric name
   * @param {Object} [labels={}] - Metric labels
   * @returns {boolean} Whether the metric exists
   */
  hasMetric(name, labels = {}) {
    const key = this._getMetricKey(name, labels);
    return this.counters.has(key) || this.gauges.has(key) || this.histograms.has(key);
  }
  
  /**
   * Create a counter if it doesn't exist
   * @param {string} name - Counter name
   * @param {string} [help=''] - Help text for the counter
   * @param {Array<string>} [labelNames=[]] - Names of labels for this counter
   * @returns {Object} Counter object
   */
  createCounter(name, help = '', labelNames = []) {
    // Create a default entry with zero value if it doesn't exist
    const defaultLabels = {};
    const key = this._getMetricKey(name, defaultLabels);
    
    if (!this.counters.has(key)) {
      this.counters.set(key, {
        name,
        value: 0,
        help,
        labels: { ...this.defaultLabels },
        labelNames
      });
    }
    
    return this.counters.get(key);
  }
  
  /**
   * Create a gauge if it doesn't exist
   * @param {string} name - Gauge name
   * @param {string} [help=''] - Help text for the gauge
   * @param {Array<string>} [labelNames=[]] - Names of labels for this gauge
   * @returns {Object} Gauge object
   */
  createGauge(name, help = '', labelNames = []) {
    // Create a default entry with zero value if it doesn't exist
    const defaultLabels = {};
    const key = this._getMetricKey(name, defaultLabels);
    
    if (!this.gauges.has(key)) {
      this.gauges.set(key, {
        name,
        value: 0,
        help,
        labels: { ...this.defaultLabels },
        labelNames
      });
    }
    
    return this.gauges.get(key);
  }
  
  /**
   * Create a histogram if it doesn't exist
   * @param {string} name - Histogram name
   * @param {string} [help=''] - Help text for the histogram
   * @param {Array<string>} [labelNames=[]] - Names of labels for this histogram
   * @returns {Object} Histogram object
   */
  createHistogram(name, help = '', labelNames = []) {
    // Create a default entry if it doesn't exist
    const defaultLabels = {};
    const key = this._getMetricKey(name, defaultLabels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        buckets: {},
        help,
        labels: { ...this.defaultLabels },
        labelNames
      });
    }
    
    return this.histograms.get(key);
  }
  
  /**
   * Dispose of the metrics collector and clean up resources
   */
  dispose() {
    this.stopAutoReporting();
    this.reportMetrics(); // Report final metrics
    this.resetMetrics();
    this.incrementCounter('component_disposed');
  }
  
  /**
   * Get a metric key combining name and labels
   * @private
   * @param {string} name - Metric name
   * @param {Object} labels - Metric labels
   * @returns {string} Metric key
   */
  _getMetricKey(name, labels) {
    const sortedLabels = Object.entries({ ...this.defaultLabels, ...labels })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return `${name}{${sortedLabels}}`;
  }
  
  /**
   * Get a bucket key for a histogram value
   * @private
   * @param {number} value - Value to categorize
   * @returns {string} Bucket key
   */
  _getBucketKey(value) {
    if (value < 0.001) return '0.001';
    if (value < 0.005) return '0.005';
    if (value < 0.01) return '0.01';
    if (value < 0.025) return '0.025';
    if (value < 0.05) return '0.05';
    if (value < 0.1) return '0.1';
    if (value < 0.25) return '0.25';
    if (value < 0.5) return '0.5';
    if (value < 1) return '1';
    if (value < 2.5) return '2.5';
    if (value < 5) return '5';
    if (value < 10) return '10';
    return 'Inf';
  }
  
  /**
   * Get a bucket key from an upper bound value
   * @private
   * @param {number} upperBound - Upper bound value
   * @returns {string} Bucket key
   */
  _getBucketKeyFromValue(upperBound) {
    if (upperBound === Infinity) return 'Inf';
    return upperBound.toString();
  }
  
  /**
   * Format labels for Prometheus output
   * @private
   * @param {Object} labels - Label object
   * @returns {string} Formatted labels string
   */
  _formatLabels(labels) {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }
    
    const parts = Object.entries(labels).map(
      ([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`
    );
    
    return `{${parts.join(',')}}`;
  }
}

// Export the class
export default MetricsCollector;