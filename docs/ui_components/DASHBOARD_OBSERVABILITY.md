# PyArrow Content Index Dashboard Observability

## Overview

The PyArrow Content Index Dashboard implements comprehensive observability features that enable monitoring, troubleshooting, and performance optimization. This document describes the metrics collection system, integration with monitoring tools, and best practices for leveraging observability data.

## Observability Architecture

The dashboard implements a layered observability approach:

### 1. Metrics Collection

- **Core Metrics Library**: Centralized metrics collection with standardized formats
- **Component-specific Metrics**: Per-component tracking with contextual labels
- **Metric Types**: Counters, gauges, histograms, and timers
- **Context Labels**: Structured context for filtering and aggregation
- **Performance Tracking**: High-resolution timing for operations
- **Error Classification**: Detailed error categorization and tracking

### 2. Logging Infrastructure

- **Structured Logging**: JSON-formatted logs with consistent schema
- **Log Levels**: DEBUG, INFO, WARN, ERROR with appropriate usage
- **Context Correlation**: Request IDs and operation tracking
- **Log Aggregation**: Collection and centralization of logs
- **Pattern Recognition**: Error pattern identification
- **Log Enrichment**: Addition of relevant metadata to log entries

### 3. Visualization Layer

- **Dashboard Integration**: Real-time metrics display in Statistics tab
- **Chart Rendering**: Multiple visualization types for different metrics
- **Alerting Framework**: Threshold-based alerting for critical metrics
- **Trend Analysis**: Historical data comparison and trend visualization
- **Performance Insights**: Automated detection of performance issues
- **Resource Utilization**: Tracking of memory, CPU, and network usage

### 4. External Integration

- **Prometheus Integration**: Metrics export in Prometheus format
- **Grafana Dashboards**: Pre-configured visualization templates
- **Alerting Integration**: Connectivity with external alerting systems
- **Observability API**: Programmatic access to metrics and logs
- **Health Check Endpoints**: Status reporting for monitoring systems
- **Tracing Integration**: Distributed tracing support

## Metrics Types and Usage

The dashboard collects various metric types:

### 1. Counter Metrics

Counters track discrete events or operations:

```javascript
// Increment a counter with labels
metrics.incrementCounter('content_operations_total', {
  operation: 'add',
  content_type: 'image/png',
  status: 'success'
});

// Increment by specific amount
metrics.incrementCounter('bytes_processed_total', 1024, {
  operation: 'download',
  content_type: 'application/pdf'
});
```

**Common Counter Metrics**:

| Metric Name | Description | Labels |
|-------------|-------------|--------|
| `content_operations_total` | Count of content operations | operation, content_type, status |
| `search_operations_total` | Count of search operations | query_type, filter_count, status |
| `error_count_total` | Count of errors | error_type, component, severity |
| `auth_operations_total` | Count of authentication operations | operation, status |
| `websocket_messages_total` | Count of WebSocket messages | message_type, direction |
| `ui_interactions_total` | Count of user interactions | interaction_type, component |

### 2. Gauge Metrics

Gauges report current values that can increase or decrease:

```javascript
// Set a gauge value
metrics.setGauge('active_connections', 42, {
  connection_type: 'websocket'
});

// Increment/decrement a gauge
metrics.incrementGauge('content_items_displayed', 10, {
  view_type: 'grid'
});

metrics.decrementGauge('pending_operations', 1, {
  operation_type: 'upload'
});
```

**Common Gauge Metrics**:

| Metric Name | Description | Labels |
|-------------|-------------|--------|
| `active_connections` | Number of active connections | connection_type |
| `content_items_displayed` | Number of content items currently displayed | view_type |
| `pending_operations` | Number of operations in progress | operation_type |
| `memory_usage_bytes` | Current memory usage in bytes | component |
| `content_count` | Current count of content items in index | content_type |
| `active_searches` | Number of searches currently running | query_type |

### 3. Histogram Metrics

Histograms track distributions of values:

```javascript
// Record a value in a histogram
metrics.recordHistogram('operation_duration_seconds', 0.34, {
  operation: 'search',
  component: 'search_interface'
});

// Use a timer to automatically record duration
const timer = metrics.startTimer('content_loading_duration_seconds', {
  content_type: 'image/jpeg',
  batch_size: 20
});

// Perform the operation
await loadContent();

// Stop the timer (automatically records the duration)
timer.stop();
```

**Common Histogram Metrics**:

| Metric Name | Description | Labels |
|-------------|-------------|--------|
| `operation_duration_seconds` | Duration of operations in seconds | operation, component |
| `response_size_bytes` | Size of responses in bytes | endpoint, content_type |
| `content_size_bytes` | Size of content items | content_type, storage_tier |
| `rendering_time_seconds` | Time to render UI components | component_type, item_count |
| `search_latency_seconds` | Search operation latency | query_complexity, result_count |
| `data_processing_time_seconds` | Time to process data | processing_type, data_size |

### 4. Timer Metrics

Timers are a specialized form of histograms for duration tracking:

```javascript
// Create and use a timer
const timer = metrics.startTimer('chart_rendering_seconds', {
  chart_type: 'bar',
  data_points: 42
});

// Perform the operation
renderChart();

// Stop the timer
const duration = timer.stop();
console.log(`Chart rendered in ${duration} seconds`);
```

**Common Timer Metrics**:

| Metric Name | Description | Labels |
|-------------|-------------|--------|
| `chart_rendering_seconds` | Time to render charts | chart_type, data_points |
| `content_loading_seconds` | Time to load content | content_type, content_count |
| `search_execution_seconds` | Time to execute searches | query_type, filter_count |
| `api_request_seconds` | Time for API requests | endpoint, method |
| `websocket_processing_seconds` | Time to process WebSocket messages | message_type |
| `ui_update_seconds` | Time to update UI components | component_type, update_type |

## Metrics Collection Implementation

The dashboard uses a centralized metrics collection system:

### 1. MetricsCollector Class

```javascript
/**
 * Metrics Collector
 * @class MetricsCollector
 */
class MetricsCollector {
  /**
   * Create a new metrics collector
   * @param {string} componentName - Name of the component
   * @param {Object} options - Configuration options
   */
  constructor(componentName, options = {}) {
    this.componentName = componentName;
    this.options = options;
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.defaultLabels = {
      component: componentName,
      ...options.defaultLabels
    };
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
    
    return {
      stop: () => {
        const duration = (performance.now() - startTime) / 1000; // Convert to seconds
        this.recordHistogram(name, duration, labels);
        return duration;
      }
    };
  }
  
  /**
   * Export all metrics
   * @returns {Object} All metrics
   */
  exportMetrics() {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
      histograms: Object.fromEntries(this.histograms.entries())
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
      // ...
    }
    
    return lines.join('\n');
  }
  
  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
  
  /**
   * Get a metric key combining name and labels
   * @private
   * @param {string} name - Metric name
   * @param {Object} labels - Metric labels
   * @returns {string} Metric key
   */
  _getMetricKey(name, labels) {
    const sortedLabels = Object.entries(labels)
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
    // Implement bucketing logic
    // This is a simple example; production code would use proper bucket boundaries
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
    return '+Inf';
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
```

### 2. Component Integration

```javascript
// Initialize metrics in component
class SearchInterface {
  constructor(options = {}) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    this.metrics = new MetricsCollector('search_interface', {
      defaultLabels: {
        view: options.view || 'default'
      }
    });
  }
  
  async init() {
    // Track initialization
    const timer = this.metrics.startTimer('initialization_seconds');
    
    // Setup DOM elements
    this._setupDom();
    
    // Add event listeners
    this._addEventListeners();
    
    // Track successful initialization
    timer.stop();
    this.metrics.incrementCounter('component_initialized', 1, {
      status: 'success'
    });
  }
  
  async executeSearch(query) {
    // Track search operations
    this.metrics.incrementCounter('search_operations_total', 1, {
      query_type: query.type || 'basic',
      filter_count: query.filters?.length || 0
    });
    
    // Time the search execution
    const timer = this.metrics.startTimer('search_execution_seconds', {
      query_type: query.type || 'basic',
      filter_count: query.filters?.length || 0
    });
    
    try {
      // Execute search
      const results = await this._performSearch(query);
      
      // Track result count
      this.metrics.setGauge('search_results_count', results.length, {
        query_type: query.type || 'basic'
      });
      
      // Track success
      this.metrics.incrementCounter('search_operations_total', 1, {
        query_type: query.type || 'basic',
        status: 'success'
      });
      
      return results;
    } catch (error) {
      // Track errors
      this.metrics.incrementCounter('error_count_total', 1, {
        operation: 'search',
        error_type: error.name,
        status: 'failure'
      });
      
      throw error;
    } finally {
      // Stop timer regardless of outcome
      timer.stop();
    }
  }
  
  // Other methods with integrated metrics...
}
```

### 3. Dashboard-wide Integration

```javascript
class PyArrowContentIndexDashboard {
  constructor(options = {}) {
    // Create components
    this.components = {};
    
    // Initialize metrics collector
    this.metrics = new MetricsCollector('pyarrow_dashboard', {
      defaultLabels: {
        version: options.version || '1.0.0'
      }
    });
    
    // Set up metrics endpoint
    this._setupMetricsEndpoint();
  }
  
  async init(options = {}) {
    const timer = this.metrics.startTimer('dashboard_initialization_seconds');
    
    try {
      // Initialize components
      await this._initializeComponents();
      
      // Set up event listeners
      this._setupEventListeners();
      
      // Start metrics collection
      this._startMetricsCollection();
      
      // Track successful initialization
      this.metrics.incrementCounter('dashboard_initialized', 1, {
        status: 'success'
      });
      
      return true;
    } catch (error) {
      // Track initialization failure
      this.metrics.incrementCounter('dashboard_initialized', 1, {
        status: 'failure',
        error_type: error.name
      });
      
      // Rethrow for higher-level handling
      throw error;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Set up metrics endpoint for Prometheus scraping
   * @private
   */
  _setupMetricsEndpoint() {
    // Create HTTP endpoint for metrics scraping
    // This depends on the server framework being used
    
    app.get('/metrics', (req, res) => {
      // Collect metrics from all components
      const allMetrics = this._collectAllMetrics();
      
      // Format as Prometheus metrics
      const prometheusMetrics = this._formatPrometheusMetrics(allMetrics);
      
      // Send response
      res.set('Content-Type', 'text/plain');
      res.send(prometheusMetrics);
    });
  }
  
  /**
   * Collect metrics from all dashboard components
   * @private
   * @returns {Object} Combined metrics from all components
   */
  _collectAllMetrics() {
    const allMetrics = {
      counters: {},
      gauges: {},
      histograms: {}
    };
    
    // Add dashboard-level metrics
    const dashboardMetrics = this.metrics.exportMetrics();
    Object.assign(allMetrics.counters, dashboardMetrics.counters);
    Object.assign(allMetrics.gauges, dashboardMetrics.gauges);
    Object.assign(allMetrics.histograms, dashboardMetrics.histograms);
    
    // Add component metrics
    for (const [name, component] of Object.entries(this.components)) {
      if (component.metrics && component.metrics.exportMetrics) {
        const componentMetrics = component.metrics.exportMetrics();
        Object.assign(allMetrics.counters, componentMetrics.counters);
        Object.assign(allMetrics.gauges, componentMetrics.gauges);
        Object.assign(allMetrics.histograms, componentMetrics.histograms);
      }
    }
    
    return allMetrics;
  }
  
  /**
   * Start periodic metrics collection
   * @private
   */
  _startMetricsCollection() {
    // Collect important metrics at regular intervals
    
    // Track memory usage
    setInterval(() => {
      if (window.performance && window.performance.memory) {
        const memory = window.performance.memory;
        this.metrics.setGauge('memory_used_bytes', memory.usedJSHeapSize);
        this.metrics.setGauge('memory_total_bytes', memory.totalJSHeapSize);
        this.metrics.setGauge('memory_limit_bytes', memory.jsHeapSizeLimit);
      }
    }, 30000); // Every 30 seconds
    
    // Track UI performance
    setInterval(() => {
      if (window.performance && window.performance.timing) {
        // Measure and track rendering performance
        // Implementation depends on the specific metrics needed
      }
    }, 60000); // Every minute
  }
  
  // Other methods...
}
```

## Logging Implementation

The dashboard implements structured logging:

### 1. Logger Class

```javascript
/**
 * Structured Logger
 * @class Logger
 */
class Logger {
  /**
   * Create a new logger
   * @param {string} componentName - Component name
   * @param {Object} options - Logger options
   */
  constructor(componentName, options = {}) {
    this.componentName = componentName;
    this.options = {
      level: 'info',
      includeTimestamp: true,
      format: 'json',
      ...options
    };
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }
  
  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {Object} [context={}] - Log context
   */
  debug(message, context = {}) {
    this._log('debug', message, context);
  }
  
  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {Object} [context={}] - Log context
   */
  info(message, context = {}) {
    this._log('info', message, context);
  }
  
  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {Object} [context={}] - Log context
   */
  warn(message, context = {}) {
    this._log('warn', message, context);
  }
  
  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {Object} [context={}] - Log context
   */
  error(message, context = {}) {
    this._log('error', message, context);
  }
  
  /**
   * Internal logging method
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Log context
   */
  _log(level, message, context) {
    if (this.levels[level] < this.levels[this.options.level]) {
      return; // Skip logs below the configured level
    }
    
    const logEntry = {
      level,
      message,
      component: this.componentName,
      ...context
    };
    
    if (this.options.includeTimestamp) {
      logEntry.timestamp = new Date().toISOString();
    }
    
    if (this.options.format === 'json') {
      this._logJson(level, logEntry);
    } else {
      this._logText(level, logEntry);
    }
    
    // Optionally send to remote logging service
    if (this.options.remoteLogging) {
      this._sendToRemote(logEntry);
    }
  }
  
  /**
   * Log in JSON format
   * @private
   * @param {string} level - Log level
   * @param {Object} entry - Log entry
   */
  _logJson(level, entry) {
    const json = JSON.stringify(entry);
    
    switch (level) {
      case 'debug':
        console.debug(json);
        break;
      case 'info':
        console.info(json);
        break;
      case 'warn':
        console.warn(json);
        break;
      case 'error':
        console.error(json);
        break;
    }
  }
  
  /**
   * Log in text format
   * @private
   * @param {string} level - Log level
   * @param {Object} entry - Log entry
   */
  _logText(level, entry) {
    const timestamp = entry.timestamp ? `[${entry.timestamp}] ` : '';
    const component = `[${entry.component}] `;
    const message = `${timestamp}${level.toUpperCase()} ${component}${entry.message}`;
    
    // Add context if available
    const context = { ...entry };
    delete context.level;
    delete context.message;
    delete context.component;
    delete context.timestamp;
    
    const contextStr = Object.keys(context).length
      ? ' ' + JSON.stringify(context)
      : '';
      
    switch (level) {
      case 'debug':
        console.debug(message + contextStr);
        break;
      case 'info':
        console.info(message + contextStr);
        break;
      case 'warn':
        console.warn(message + contextStr);
        break;
      case 'error':
        console.error(message + contextStr);
        break;
    }
  }
  
  /**
   * Send log to remote logging service
   * @private
   * @param {Object} entry - Log entry
   */
  _sendToRemote(entry) {
    // Implementation depends on remote logging service
    // This could use fetch() to send to a logging endpoint
  }
}
```

### 2. Integration with Components

```javascript
class MetadataBrowser {
  constructor(options = {}) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    
    // Initialize logger
    this.logger = new Logger('metadata_browser', {
      level: options.logLevel || 'info',
      remoteLogging: options.remoteLogging
    });
    
    // Initialize metrics
    this.metrics = new MetricsCollector('metadata_browser');
  }
  
  async init() {
    this.logger.info('Initializing metadata browser');
    
    try {
      await this._setupDom();
      this._addEventListeners();
      
      this.logger.info('Metadata browser initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize metadata browser', {
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }
  
  async loadContent(items) {
    this.logger.info('Loading content items', {
      count: items.length
    });
    
    const timer = this.metrics.startTimer('content_loading_seconds', {
      item_count: items.length
    });
    
    try {
      await this._renderItems(items);
      
      this.logger.debug('Content items rendered', {
        count: items.length,
        render_time: timer.stop()
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to load content items', {
        error: error.message,
        item_count: items.length
      });
      
      this.metrics.incrementCounter('error_count_total', 1, {
        operation: 'load_content',
        error_type: error.name
      });
      
      throw error;
    }
  }
  
  // Other methods...
}
```

## Dashboard Integration

The Statistics tab in the PyArrow Content Index Dashboard visualizes metrics data:

### 1. Performance Metrics Chart

```javascript
class PerformanceMetricsChart {
  constructor(options = {}) {
    this.container = options.container;
    this.metricsCollector = options.metricsCollector;
    this.chartType = options.chartType || 'line';
    this.metrics = [];
    this.chart = null;
  }
  
  async init() {
    // Create chart canvas
    this._createCanvas();
    
    // Initialize Chart.js
    await this._initializeChart();
    
    // Start periodic updates
    this._startUpdates();
  }
  
  async _initializeChart() {
    // Load Chart.js (if not already loaded)
    if (!window.Chart) {
      await this._loadChartJs();
    }
    
    // Configure chart
    const ctx = this.canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: this.chartType,
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 500
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Duration (seconds)'
            },
            beginAtZero: true
          }
        }
      }
    });
  }
  
  _createCanvas() {
    this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas);
  }
  
  async _loadChartJs() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  _startUpdates() {
    // Update chart every 5 seconds
    this.updateInterval = setInterval(() => {
      this._updateChart();
    }, 5000);
  }
  
  async _updateChart() {
    // Get latest metrics
    const metrics = this.metricsCollector.exportMetrics();
    
    // Extract histogram data for operation durations
    const histograms = Object.values(metrics.histograms)
      .filter(h => h.name.endsWith('_seconds'))
      .sort((a, b) => b.sum - a.sum) // Sort by total time
      .slice(0, 5); // Top 5 by time
    
    // Update chart data
    this.chart.data.labels = histograms.map(h => {
      const opName = h.name.replace('_seconds', '');
      return this._formatOperationName(opName);
    });
    
    this.chart.data.datasets = [{
      label: 'Avg Duration (s)',
      data: histograms.map(h => h.count > 0 ? h.sum / h.count : 0),
      backgroundColor: this._generateColors(histograms.length),
      borderColor: this._generateColors(histograms.length, 0.8),
      borderWidth: 1
    }];
    
    // Update chart
    this.chart.update();
  }
  
  _formatOperationName(name) {
    return name
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  _generateColors(count, alpha = 0.5) {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 137) % 360; // Distribute colors evenly
      colors.push(`hsla(${hue}, 70%, 60%, ${alpha})`);
    }
    return colors;
  }
  
  dispose() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    if (this.chart) {
      this.chart.destroy();
    }
    
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
```

### 2. Statistics Tab Integration

```javascript
class StatisticsTab {
  constructor(options = {}) {
    this.container = options.container;
    this.metricsCollector = options.metricsCollector;
    this.eventBus = options.eventBus;
    this.charts = [];
  }
  
  async init() {
    // Create tab layout
    this._createLayout();
    
    // Initialize charts
    await this._initializeCharts();
    
    // Add event listeners
    this._addEventListeners();
  }
  
  _createLayout() {
    this.container.innerHTML = `
      <div class="statistics-container">
        <div class="chart-grid">
          <div class="chart-container" id="performance-chart">
            <h3>Operation Performance</h3>
            <div class="chart-body"></div>
          </div>
          
          <div class="chart-container" id="operations-chart">
            <h3>Operations by Type</h3>
            <div class="chart-body"></div>
          </div>
          
          <div class="chart-container" id="errors-chart">
            <h3>Errors by Type</h3>
            <div class="chart-body"></div>
          </div>
          
          <div class="chart-container" id="memory-chart">
            <h3>Memory Usage</h3>
            <div class="chart-body"></div>
          </div>
        </div>
        
        <div class="metrics-table-container">
          <h3>Detailed Metrics</h3>
          <table class="metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Labels</th>
              </tr>
            </thead>
            <tbody id="metrics-table-body">
              <!-- Metrics rows will be inserted here -->
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  async _initializeCharts() {
    // Performance chart
    const performanceChart = new PerformanceMetricsChart({
      container: this.container.querySelector('#performance-chart .chart-body'),
      metricsCollector: this.metricsCollector,
      chartType: 'bar'
    });
    await performanceChart.init();
    this.charts.push(performanceChart);
    
    // Operations chart
    const operationsChart = new OperationsChart({
      container: this.container.querySelector('#operations-chart .chart-body'),
      metricsCollector: this.metricsCollector,
      chartType: 'doughnut'
    });
    await operationsChart.init();
    this.charts.push(operationsChart);
    
    // Errors chart
    const errorsChart = new ErrorsChart({
      container: this.container.querySelector('#errors-chart .chart-body'),
      metricsCollector: this.metricsCollector,
      chartType: 'pie'
    });
    await errorsChart.init();
    this.charts.push(errorsChart);
    
    // Memory chart
    const memoryChart = new MemoryUsageChart({
      container: this.container.querySelector('#memory-chart .chart-body'),
      metricsCollector: this.metricsCollector,
      chartType: 'line'
    });
    await memoryChart.init();
    this.charts.push(memoryChart);
    
    // Initialize metrics table
    this._initializeMetricsTable();
  }
  
  _initializeMetricsTable() {
    // Update metrics table periodically
    setInterval(() => {
      this._updateMetricsTable();
    }, 5000);
    
    // Initial update
    this._updateMetricsTable();
  }
  
  _updateMetricsTable() {
    const metrics = this.metricsCollector.exportMetrics();
    const tableBody = this.container.querySelector('#metrics-table-body');
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Add counters
    this._addMetricsToTable(tableBody, 'counter', metrics.counters);
    
    // Add gauges
    this._addMetricsToTable(tableBody, 'gauge', metrics.gauges);
    
    // Add histograms (summary)
    for (const [key, histogram] of Object.entries(metrics.histograms)) {
      const row = document.createElement('tr');
      row.className = 'metric-row';
      
      // Create metric name cell
      const nameCell = document.createElement('td');
      nameCell.textContent = `${histogram.name} (histogram)`;
      nameCell.className = 'metric-name';
      row.appendChild(nameCell);
      
      // Create value cell with summary
      const valueCell = document.createElement('td');
      valueCell.className = 'metric-value';
      
      const avgValue = histogram.count > 0
        ? (histogram.sum / histogram.count).toFixed(3)
        : 'N/A';
        
      valueCell.innerHTML = `
        count: ${histogram.count}<br>
        avg: ${avgValue}<br>
        min: ${histogram.min !== Infinity ? histogram.min.toFixed(3) : 'N/A'}<br>
        max: ${histogram.max !== -Infinity ? histogram.max.toFixed(3) : 'N/A'}
      `;
      row.appendChild(valueCell);
      
      // Create labels cell
      const labelsCell = document.createElement('td');
      labelsCell.className = 'metric-labels';
      
      if (histogram.labels) {
        const labelList = document.createElement('ul');
        
        for (const [labelKey, labelValue] of Object.entries(histogram.labels)) {
          const labelItem = document.createElement('li');
          labelItem.textContent = `${labelKey}: ${labelValue}`;
          labelList.appendChild(labelItem);
        }
        
        labelsCell.appendChild(labelList);
      }
      
      row.appendChild(labelsCell);
      tableBody.appendChild(row);
    }
  }
  
  _addMetricsToTable(tableBody, type, metrics) {
    for (const [key, metric] of Object.entries(metrics)) {
      const row = document.createElement('tr');
      row.className = 'metric-row';
      
      // Create metric name cell
      const nameCell = document.createElement('td');
      nameCell.textContent = `${metric.name} (${type})`;
      nameCell.className = 'metric-name';
      row.appendChild(nameCell);
      
      // Create value cell
      const valueCell = document.createElement('td');
      valueCell.textContent = metric.value;
      valueCell.className = 'metric-value';
      row.appendChild(valueCell);
      
      // Create labels cell
      const labelsCell = document.createElement('td');
      labelsCell.className = 'metric-labels';
      
      if (metric.labels) {
        const labelList = document.createElement('ul');
        
        for (const [labelKey, labelValue] of Object.entries(metric.labels)) {
          const labelItem = document.createElement('li');
          labelItem.textContent = `${labelKey}: ${labelValue}`;
          labelList.appendChild(labelItem);
        }
        
        labelsCell.appendChild(labelList);
      }
      
      row.appendChild(labelsCell);
      tableBody.appendChild(row);
    }
  }
  
  _addEventListeners() {
    // Add event listener for tab visibility
    this.eventBus.on('tab-shown', (tabId) => {
      if (tabId === 'statistics') {
        // Refresh charts when tab becomes visible
        for (const chart of this.charts) {
          if (chart._updateChart) {
            chart._updateChart();
          }
        }
      }
    });
  }
  
  dispose() {
    // Dispose all charts
    for (const chart of this.charts) {
      if (chart.dispose) {
        chart.dispose();
      }
    }
    
    this.charts = [];
    this.container.innerHTML = '';
  }
}
```

## Prometheus Integration

The PyArrow Content Index Dashboard can export metrics in Prometheus format:

### 1. Metrics Endpoint

```javascript
/**
 * Set up metrics endpoint for Prometheus scraping
 */
function setupMetricsEndpoint(metricsCollector, app) {
  app.get('/metrics', (req, res) => {
    // Get all metrics
    const metrics = metricsCollector.exportPrometheusMetrics();
    
    // Set content type for Prometheus
    res.set('Content-Type', 'text/plain');
    
    // Send metrics
    res.send(metrics);
  });
}
```

### 2. Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'pyarrow-dashboard'
    scrape_interval: 15s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['localhost:3000']
        labels:
          service: 'pyarrow-content-index'
          environment: 'development'
```

### 3. Grafana Dashboard

```json
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": "-- Grafana --",
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "editable": true,
  "gnetId": null,
  "graphTooltip": 0,
  "id": 1,
  "links": [],
  "panels": [
    {
      "aliasColors": {},
      "bars": false,
      "dashLength": 10,
      "dashes": false,
      "datasource": null,
      "fieldConfig": {
        "defaults": {},
        "overrides": []
      },
      "fill": 1,
      "fillGradient": 0,
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "hiddenSeries": false,
      "id": 2,
      "legend": {
        "avg": false,
        "current": false,
        "max": false,
        "min": false,
        "show": true,
        "total": false,
        "values": false
      },
      "lines": true,
      "linewidth": 1,
      "nullPointMode": "null",
      "options": {
        "alertThreshold": true
      },
      "percentage": false,
      "pluginVersion": "7.5.5",
      "pointradius": 2,
      "points": false,
      "renderer": "flot",
      "seriesOverrides": [],
      "spaceLength": 10,
      "stack": false,
      "steppedLine": false,
      "targets": [
        {
          "exemplar": true,
          "expr": "rate(operation_duration_seconds_sum[5m]) / rate(operation_duration_seconds_count[5m])",
          "interval": "",
          "legendFormat": "{{operation}}",
          "refId": "A"
        }
      ],
      "thresholds": [],
      "timeFrom": null,
      "timeRegions": [],
      "timeShift": null,
      "title": "Operation Duration (5m avg)",
      "tooltip": {
        "shared": true,
        "sort": 0,
        "value_type": "individual"
      },
      "type": "graph",
      "xaxis": {
        "buckets": null,
        "mode": "time",
        "name": null,
        "show": true,
        "values": []
      },
      "yaxes": [
        {
          "format": "s",
          "label": null,
          "logBase": 1,
          "max": null,
          "min": null,
          "show": true
        },
        {
          "format": "short",
          "label": null,
          "logBase": 1,
          "max": null,
          "min": null,
          "show": true
        }
      ],
      "yaxis": {
        "align": false,
        "alignLevel": null
      }
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          }
        },
        "overrides": []
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 12,
        "y": 0
      },
      "id": 4,
      "options": {
        "orientation": "auto",
        "reduceOptions": {
          "calcs": [
            "lastNotNull"
          ],
          "fields": "",
          "values": false
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": true,
        "text": {}
      },
      "pluginVersion": "7.5.5",
      "targets": [
        {
          "exemplar": true,
          "expr": "content_operations_total",
          "interval": "",
          "legendFormat": "{{operation}}",
          "refId": "A"
        }
      ],
      "title": "Content Operations",
      "type": "gauge"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "drawStyle": "line",
            "fillOpacity": 0,
            "gradientMode": "none",
            "hideFrom": {
              "legend": false,
              "tooltip": false,
              "viz": false
            },
            "lineInterpolation": "linear",
            "lineWidth": 1,
            "pointSize": 5,
            "scaleDistribution": {
              "type": "linear"
            },
            "showPoints": "auto",
            "spanNulls": false,
            "stacking": {
              "group": "A",
              "mode": "none"
            },
            "thresholdsStyle": {
              "mode": "off"
            }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          },
          "unit": "bytes"
        },
        "overrides": []
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 8
      },
      "id": 6,
      "options": {
        "legend": {
          "calcs": [],
          "displayMode": "list",
          "placement": "bottom"
        },
        "tooltip": {
          "mode": "single"
        }
      },
      "pluginVersion": "7.5.5",
      "targets": [
        {
          "exemplar": true,
          "expr": "memory_used_bytes",
          "interval": "",
          "legendFormat": "Used",
          "refId": "A"
        },
        {
          "exemplar": true,
          "expr": "memory_total_bytes",
          "hide": false,
          "interval": "",
          "legendFormat": "Total",
          "refId": "B"
        }
      ],
      "title": "Memory Usage",
      "type": "timeseries"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "yellow",
                "value": 1
              },
              {
                "color": "red",
                "value": 5
              }
            ]
          }
        },
        "overrides": []
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 12,
        "y": 8
      },
      "id": 8,
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": [
            "lastNotNull"
          ],
          "fields": "",
          "values": false
        },
        "text": {},
        "textMode": "auto"
      },
      "pluginVersion": "7.5.5",
      "targets": [
        {
          "exemplar": true,
          "expr": "error_count_total",
          "interval": "",
          "legendFormat": "{{error_type}}",
          "refId": "A"
        }
      ],
      "title": "Error Count",
      "type": "stat"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisLabel": "",
            "axisPlacement": "auto",
            "axisSoftMin": 0,
            "fillOpacity": 80,
            "gradientMode": "none",
            "hideFrom": {
              "legend": false,
              "tooltip": false,
              "viz": false
            },
            "lineWidth": 1
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          }
        },
        "overrides": []
      },
      "gridPos": {
        "h": 8,
        "w": 24,
        "x": 0,
        "y": 16
      },
      "id": 10,
      "options": {
        "barWidth": 0.97,
        "groupWidth": 0.7,
        "legend": {
          "calcs": [],
          "displayMode": "list",
          "placement": "bottom"
        },
        "orientation": "auto",
        "showValue": "auto",
        "text": {
          "valueSize": 12
        },
        "tooltip": {
          "mode": "single"
        }
      },
      "pluginVersion": "7.5.5",
      "targets": [
        {
          "exemplar": true,
          "expr": "search_operations_total",
          "interval": "",
          "legendFormat": "{{query_type}}",
          "refId": "A"
        }
      ],
      "title": "Search Operations by Type",
      "type": "barchart"
    }
  ],
  "refresh": "10s",
  "schemaVersion": 27,
  "style": "dark",
  "tags": [],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "PyArrow Content Index Dashboard",
  "uid": "pyarrow-dashboard",
  "version": 1
}
```

## Testing Observability Components

### 1. Metrics Testing

```javascript
/**
 * Test metrics collection
 */
describe('MetricsCollector', () => {
  let metricsCollector;
  
  beforeEach(() => {
    // Create a fresh collector for each test
    metricsCollector = new MetricsCollector('test_component');
  });
  
  it('should increment counters correctly', () => {
    // Increment a counter
    metricsCollector.incrementCounter('test_counter');
    metricsCollector.incrementCounter('test_counter');
    metricsCollector.incrementCounter('test_counter', 3);
    
    // Export metrics
    const metrics = metricsCollector.exportMetrics();
    
    // Find the counter in the exported metrics
    const counterKey = Object.keys(metrics.counters).find(
      key => key.includes('test_counter')
    );
    
    expect(counterKey).toBeDefined();
    expect(metrics.counters[counterKey].value).toBe(5);
  });
  
  it('should set and increment gauges correctly', () => {
    // Set a gauge
    metricsCollector.setGauge('test_gauge', 10);
    
    // Increment the gauge
    metricsCollector.incrementGauge('test_gauge', 5);
    
    // Decrement the gauge
    metricsCollector.decrementGauge('test_gauge', 2);
    
    // Export metrics
    const metrics = metricsCollector.exportMetrics();
    
    // Find the gauge in the exported metrics
    const gaugeKey = Object.keys(metrics.gauges).find(
      key => key.includes('test_gauge')
    );
    
    expect(gaugeKey).toBeDefined();
    expect(metrics.gauges[gaugeKey].value).toBe(13);
  });
  
  it('should record histogram values correctly', () => {
    // Record some values
    metricsCollector.recordHistogram('test_histogram', 1);
    metricsCollector.recordHistogram('test_histogram', 2);
    metricsCollector.recordHistogram('test_histogram', 3);
    
    // Export metrics
    const metrics = metricsCollector.exportMetrics();
    
    // Find the histogram in the exported metrics
    const histogramKey = Object.keys(metrics.histograms).find(
      key => key.includes('test_histogram')
    );
    
    expect(histogramKey).toBeDefined();
    expect(metrics.histograms[histogramKey].count).toBe(3);
    expect(metrics.histograms[histogramKey].sum).toBe(6);
    expect(metrics.histograms[histogramKey].min).toBe(1);
    expect(metrics.histograms[histogramKey].max).toBe(3);
  });
  
  it('should track timing correctly', async () => {
    // Start a timer
    const timer = metricsCollector.startTimer('test_timer');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Stop the timer
    const duration = timer.stop();
    
    // Duration should be reasonable
    expect(duration).toBeGreaterThan(0.03); // At least 30ms
    expect(duration).toBeLessThan(0.2); // Less than 200ms (to account for test environment variability)
    
    // Export metrics
    const metrics = metricsCollector.exportMetrics();
    
    // Find the timer in the exported metrics (as a histogram)
    const timerKey = Object.keys(metrics.histograms).find(
      key => key.includes('test_timer')
    );
    
    expect(timerKey).toBeDefined();
    expect(metrics.histograms[timerKey].count).toBe(1);
    expect(metrics.histograms[timerKey].sum).toBeGreaterThan(0.03);
  });
  
  it('should include labels with metrics', () => {
    // Add a counter with labels
    metricsCollector.incrementCounter('test_counter', 1, {
      operation: 'test',
      status: 'success'
    });
    
    // Export metrics
    const metrics = metricsCollector.exportMetrics();
    
    // Find the counter in the exported metrics
    const counterKey = Object.keys(metrics.counters).find(
      key => key.includes('test_counter')
    );
    
    expect(counterKey).toBeDefined();
    expect(metrics.counters[counterKey].labels).toEqual({
      component: 'test_component',
      operation: 'test',
      status: 'success'
    });
  });
  
  it('should format metrics for Prometheus', () => {
    // Add some metrics
    metricsCollector.incrementCounter('test_counter', 1, {
      operation: 'test'
    });
    
    metricsCollector.setGauge('test_gauge', 42, {
      component: 'test_component'
    });
    
    // Get Prometheus format
    const prometheusMetrics = metricsCollector.exportPrometheusMetrics();
    
    // Should be a string
    expect(typeof prometheusMetrics).toBe('string');
    
    // Should contain the metrics
    expect(prometheusMetrics).toContain('# TYPE test_counter counter');
    expect(prometheusMetrics).toContain('test_counter{');
    expect(prometheusMetrics).toContain('operation="test"');
    
    expect(prometheusMetrics).toContain('# TYPE test_gauge gauge');
    expect(prometheusMetrics).toContain('test_gauge{');
  });
  
  it('should reset metrics correctly', () => {
    // Add some metrics
    metricsCollector.incrementCounter('test_counter');
    metricsCollector.setGauge('test_gauge', 42);
    metricsCollector.recordHistogram('test_histogram', 1);
    
    // Reset metrics
    metricsCollector.resetMetrics();
    
    // Export metrics
    const metrics = metricsCollector.exportMetrics();
    
    // Should have no metrics
    expect(Object.keys(metrics.counters).length).toBe(0);
    expect(Object.keys(metrics.gauges).length).toBe(0);
    expect(Object.keys(metrics.histograms).length).toBe(0);
  });
});
```

### 2. Component Integration Testing

```javascript
/**
 * Test component metrics integration
 */
describe('Component Metrics Integration', () => {
  let searchInterface;
  let mockContainer;
  let mockEventBus;
  
  beforeEach(() => {
    // Create mock DOM
    document.body.innerHTML = '<div id="search-container"></div>';
    mockContainer = document.getElementById('search-container');
    
    // Create mock event bus
    mockEventBus = {
      on: jest.fn(),
      emit: jest.fn()
    };
    
    // Create component with metrics
    searchInterface = new SearchInterface({
      container: mockContainer,
      eventBus: mockEventBus
    });
  });
  
  it('should initialize with metrics', async () => {
    // Initialize component
    await searchInterface.init();
    
    // Export metrics
    const metrics = searchInterface.metrics.exportMetrics();
    
    // Should have initialization metrics
    const componentInitializedKey = Object.keys(metrics.counters).find(
      key => key.includes('component_initialized')
    );
    
    expect(componentInitializedKey).toBeDefined();
    expect(metrics.counters[componentInitializedKey].value).toBe(1);
    expect(metrics.counters[componentInitializedKey].labels.status).toBe('success');
  });
  
  it('should track search operations', async () => {
    // Initialize component
    await searchInterface.init();
    
    // Mock internal search method
    searchInterface._performSearch = jest.fn().mockResolvedValue([
      { id: '1', name: 'Result 1' },
      { id: '2', name: 'Result 2' }
    ]);
    
    // Execute search
    await searchInterface.executeSearch({
      type: 'advanced',
      filters: ['type:image', 'size:large']
    });
    
    // Export metrics
    const metrics = searchInterface.metrics.exportMetrics();
    
    // Should have search operation metrics
    const searchOperationsKey = Object.keys(metrics.counters).find(
      key => key.includes('search_operations_total') && 
            metrics.counters[key].labels.query_type === 'advanced'
    );
    
    expect(searchOperationsKey).toBeDefined();
    expect(metrics.counters[searchOperationsKey].value).toBe(2); // One for start, one for success
    expect(metrics.counters[searchOperationsKey].labels.filter_count).toBe(2);
    
    // Should have results gauge
    const resultsCountKey = Object.keys(metrics.gauges).find(
      key => key.includes('search_results_count')
    );
    
    expect(resultsCountKey).toBeDefined();
    expect(metrics.gauges[resultsCountKey].value).toBe(2);
    
    // Should have timing histogram
    const searchTimingKey = Object.keys(metrics.histograms).find(
      key => key.includes('search_execution_seconds')
    );
    
    expect(searchTimingKey).toBeDefined();
    expect(metrics.histograms[searchTimingKey].count).toBe(1);
  });
  
  it('should track errors correctly', async () => {
    // Initialize component
    await searchInterface.init();
    
    // Mock internal search method to throw error
    const testError = new Error('Test error');
    testError.name = 'SearchError';
    searchInterface._performSearch = jest.fn().mockRejectedValue(testError);
    
    // Execute search (should throw)
    await expect(searchInterface.executeSearch({
      type: 'basic'
    })).rejects.toThrow('Test error');
    
    // Export metrics
    const metrics = searchInterface.metrics.exportMetrics();
    
    // Should have error metrics
    const errorCountKey = Object.keys(metrics.counters).find(
      key => key.includes('error_count_total')
    );
    
    expect(errorCountKey).toBeDefined();
    expect(metrics.counters[errorCountKey].value).toBe(1);
    expect(metrics.counters[errorCountKey].labels.error_type).toBe('SearchError');
    expect(metrics.counters[errorCountKey].labels.operation).toBe('search');
    
    // Should still have timing even with error
    const searchTimingKey = Object.keys(metrics.histograms).find(
      key => key.includes('search_execution_seconds')
    );
    
    expect(searchTimingKey).toBeDefined();
    expect(metrics.histograms[searchTimingKey].count).toBe(1);
  });
});
```

## Best Practices for Observability

### 1. Metrics Collection

- **Consistent Naming**: Use consistent naming conventions for metrics
  - Follow pattern: `<subsystem>_<metric>_<unit>`
  - Example: `content_operations_total`, `search_latency_seconds`

- **Appropriate Metric Types**:
  - Use counters for events that only increase (operations, errors)
  - Use gauges for values that go up and down (memory usage, active connections)
  - Use histograms for distributions (request duration, response size)

- **Descriptive Labels**:
  - Include component name and operation type in all metrics
  - Add status labels for success/failure tracking
  - Use error type labels for error categorization
  - Keep label cardinality under control (avoid unique IDs as labels)

- **Granular Tracking**:
  - Track individual operations rather than just high-level flows
  - Measure different phases of complex operations
  - Track both counts and durations for key operations

### 2. Performance Monitoring

- **Timing Critical Operations**:
  - Use timers for all user-facing operations
  - Track end-to-end and component-specific timings
  - Set performance budgets and alert on violations

- **Resource Usage**:
  - Track memory usage to detect leaks
  - Monitor DOM element counts to prevent bloat
  - Track network usage for large data transfers

- **User Experience Metrics**:
  - Measure time to interactive for components
  - Track user input latency
  - Monitor rendering performance

### 3. Error Tracking

- **Detailed Error Classification**:
  - Use specific error types and codes
  - Track error rates by component and operation
  - Categorize errors by severity

- **Context Collection**:
  - Capture relevant state during errors
  - Include user actions that led to errors
  - Track component state at error time

- **Recovery Monitoring**:
  - Measure successful automatic recoveries
  - Track retry attempts and success rates
  - Monitor degraded operation modes

### 4. Dashboard Design

- **Focused Views**:
  - Create role-specific dashboards (user, developer, operations)
  - Include actionable metrics on each dashboard
  - Highlight critical metrics prominently

- **Visual Hierarchy**:
  - Present most important metrics at the top
  - Use color to indicate status and severity
  - Group related metrics together

- **Timespan Options**:
  - Provide multiple time window options
  - Include both real-time and historical views
  - Support comparison with previous periods

## Conclusion

The PyArrow Content Index Dashboard implements comprehensive observability features that enable effective monitoring, troubleshooting, and optimization. By leveraging structured metrics collection, proper logging, and performance tracking, the dashboard provides insights into its operation at multiple levels of detail.

The observability architecture covers all key components with consistent, descriptive metrics that can be visualized both within the dashboard itself and in external monitoring systems like Prometheus and Grafana. This approach ensures that both users and developers can understand the system's behavior, identify performance bottlenecks, and quickly diagnose issues.

By following the best practices outlined in this document, contributors can maintain and enhance the observability capabilities of the dashboard, ensuring it remains reliable, performant, and user-friendly.