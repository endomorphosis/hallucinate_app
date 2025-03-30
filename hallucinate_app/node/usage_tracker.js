/**
 * Usage Tracking System
 * 
 * Provides comprehensive tracking of resource usage for secure managers
 * Tracks API calls, resource access, and performance metrics
 * Integrates with monitoring systems and dashboards
 */

import { EventEmitter } from 'events';

/**
 * Usage tracking for modules and resources
 */
export class UsageTracker extends EventEmitter {
  /**
   * Create a new usage tracker instance
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      storageEnabled: true,
      eventLoggingEnabled: true,
      performanceTrackingEnabled: true,
      storageLimit: 1000,
      aggregationInterval: 60 * 1000, // 1 minute
      ...options
    };
    
    this.storage = {
      events: [],
      metrics: {},
      aggregated: {
        byModule: {},
        byOperation: {},
        byResource: {},
        byTimeframe: {},
      }
    };
    
    this.startTime = Date.now();
    this.aggregationTimer = null;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the usage tracker
   */
  init() {
    // Set up aggregation timer if enabled
    if (this.options.storageEnabled && this.options.aggregationInterval > 0) {
      this.aggregationTimer = setInterval(() => {
        this.aggregateMetrics();
      }, this.options.aggregationInterval);
    }
    
    // Log initialization
    this.trackEvent('system', 'initialization', {
      options: { ...this.options }
    });
  }
  
  /**
   * Track resource usage event
   * 
   * @param {string} module Module name
   * @param {string} operation Operation name
   * @param {Object} details Event details
   * @param {Object} metrics Performance metrics
   * @returns {Object} Tracking event
   */
  trackEvent(module, operation, details = {}, metrics = {}) {
    const timestamp = Date.now();
    
    // Create event object
    const event = {
      id: `evt_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp,
      module,
      operation,
      details,
      metrics: {
        duration: metrics.duration || 0,
        memory: metrics.memory || 0,
        cpu: metrics.cpu || 0,
        ...metrics
      }
    };
    
    // Store event if storage is enabled
    if (this.options.storageEnabled) {
      this.storage.events.push(event);
      
      // Limit storage size
      if (this.storage.events.length > this.options.storageLimit) {
        this.storage.events.shift();
      }
      
      // Update metrics
      this.updateMetrics(module, operation, event);
    }
    
    // Emit event if event logging is enabled
    if (this.options.eventLoggingEnabled) {
      this.emit('usage-event', event);
    }
    
    return event;
  }
  
  /**
   * Track a function call with timing
   * 
   * @param {string} module Module name
   * @param {string} operation Operation name
   * @param {Function} fn Function to track
   * @param {Object} details Additional details
   * @returns {Promise<any>} Function result
   */
  async trackFunction(module, operation, fn, details = {}) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      // Execute the function
      const result = await fn();
      
      // Calculate metrics
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      const metrics = {
        duration: endTime - startTime,
        memory: endMemory - startMemory,
        success: true
      };
      
      // Track the event
      this.trackEvent(module, operation, {
        ...details,
        result_type: typeof result
      }, metrics);
      
      return result;
    } catch (error) {
      // Calculate metrics for error case
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      const metrics = {
        duration: endTime - startTime,
        memory: endMemory - startMemory,
        success: false
      };
      
      // Track the error event
      this.trackEvent(module, `${operation}_error`, {
        ...details,
        error: error.message,
        error_type: error.constructor.name
      }, metrics);
      
      // Re-throw the error
      throw error;
    }
  }
  
  /**
   * Create a tracker for a specific module
   * 
   * @param {string} module Module name
   * @returns {Object} Module tracker
   */
  forModule(module) {
    return {
      trackEvent: (operation, details, metrics) => 
        this.trackEvent(module, operation, details, metrics),
      
      trackFunction: (operation, fn, details) => 
        this.trackFunction(module, operation, fn, details),
      
      getStats: () => this.getModuleStats(module),
      
      getEvents: (limit = 10) => this.getModuleEvents(module, limit)
    };
  }
  
  /**
   * Update metrics with event data
   * 
   * @param {string} module Module name
   * @param {string} operation Operation name
   * @param {Object} event Event object
   * @private
   */
  updateMetrics(module, operation, event) {
    // Initialize metrics if needed
    if (!this.storage.metrics[module]) {
      this.storage.metrics[module] = {
        operations: {},
        count: 0,
        totalDuration: 0,
        errors: 0
      };
    }
    
    if (!this.storage.metrics[module].operations[operation]) {
      this.storage.metrics[module].operations[operation] = {
        count: 0,
        totalDuration: 0,
        errors: 0
      };
    }
    
    // Update module metrics
    this.storage.metrics[module].count++;
    this.storage.metrics[module].totalDuration += event.metrics.duration;
    
    // Update operation metrics
    this.storage.metrics[module].operations[operation].count++;
    this.storage.metrics[module].operations[operation].totalDuration += event.metrics.duration;
    
    // Track errors
    if (operation.endsWith('_error')) {
      this.storage.metrics[module].errors++;
      this.storage.metrics[module].operations[operation].errors++;
    }
  }
  
  /**
   * Aggregate metrics for reporting
   * @private
   */
  aggregateMetrics() {
    // Skip if no events
    if (this.storage.events.length === 0) return;
    
    const now = Date.now();
    const timeframe = Math.floor(now / this.options.aggregationInterval);
    
    // Initialize timeframe
    if (!this.storage.aggregated.byTimeframe[timeframe]) {
      this.storage.aggregated.byTimeframe[timeframe] = {
        startTime: timeframe * this.options.aggregationInterval,
        endTime: (timeframe + 1) * this.options.aggregationInterval,
        totalEvents: 0,
        byModule: {},
        byOperation: {}
      };
    }
    
    // Process recent events
    const recentEvents = this.storage.events.filter(
      event => event.timestamp >= timeframe * this.options.aggregationInterval
    );
    
    // Count events
    this.storage.aggregated.byTimeframe[timeframe].totalEvents = recentEvents.length;
    
    // Aggregate by module
    const moduleEventCounts = {};
    const operationEventCounts = {};
    
    for (const event of recentEvents) {
      // By module
      moduleEventCounts[event.module] = (moduleEventCounts[event.module] || 0) + 1;
      
      // By operation
      const opKey = `${event.module}:${event.operation}`;
      operationEventCounts[opKey] = (operationEventCounts[opKey] || 0) + 1;
      
      // Update timeframe data
      if (!this.storage.aggregated.byTimeframe[timeframe].byModule[event.module]) {
        this.storage.aggregated.byTimeframe[timeframe].byModule[event.module] = {
          count: 0,
          operations: {}
        };
      }
      
      this.storage.aggregated.byTimeframe[timeframe].byModule[event.module].count++;
      
      if (!this.storage.aggregated.byTimeframe[timeframe].byOperation[opKey]) {
        this.storage.aggregated.byTimeframe[timeframe].byOperation[opKey] = 0;
      }
      
      this.storage.aggregated.byTimeframe[timeframe].byOperation[opKey]++;
    }
    
    // Keep only recent timeframes (last 24 periods)
    const timeframes = Object.keys(this.storage.aggregated.byTimeframe)
      .map(Number)
      .sort((a, b) => b - a);
    
    const timeframeLimit = 24;
    if (timeframes.length > timeframeLimit) {
      for (let i = timeframeLimit; i < timeframes.length; i++) {
        delete this.storage.aggregated.byTimeframe[timeframes[i]];
      }
    }
    
    // Emit aggregation event
    this.emit('metrics-aggregated', {
      timeframe,
      metrics: this.storage.aggregated.byTimeframe[timeframe]
    });
  }
  
  /**
   * Get statistics for all modules
   * 
   * @returns {Object} Usage statistics
   */
  getStats() {
    const moduleStats = {};
    let totalCount = 0;
    let totalErrors = 0;
    let totalDuration = 0;
    
    // Calculate module stats
    for (const [module, metrics] of Object.entries(this.storage.metrics)) {
      moduleStats[module] = {
        count: metrics.count,
        errors: metrics.errors,
        errorRate: metrics.count > 0 ? metrics.errors / metrics.count : 0,
        avgDuration: metrics.count > 0 ? metrics.totalDuration / metrics.count : 0,
        operations: Object.keys(metrics.operations).length
      };
      
      totalCount += metrics.count;
      totalErrors += metrics.errors;
      totalDuration += metrics.totalDuration;
    }
    
    // Get top operations
    const operations = [];
    for (const [module, metrics] of Object.entries(this.storage.metrics)) {
      for (const [operation, opMetrics] of Object.entries(metrics.operations)) {
        operations.push({
          module,
          operation,
          count: opMetrics.count,
          avgDuration: opMetrics.count > 0 ? opMetrics.totalDuration / opMetrics.count : 0,
          errors: opMetrics.errors
        });
      }
    }
    
    // Sort operations by count
    operations.sort((a, b) => b.count - a.count);
    
    return {
      totalEvents: totalCount,
      totalErrors,
      totalDuration,
      errorRate: totalCount > 0 ? totalErrors / totalCount : 0,
      avgDuration: totalCount > 0 ? totalDuration / totalCount : 0,
      uptime: Date.now() - this.startTime,
      modules: moduleStats,
      topOperations: operations.slice(0, 10)
    };
  }
  
  /**
   * Get statistics for a specific module
   * 
   * @param {string} module Module name
   * @returns {Object} Module statistics
   */
  getModuleStats(module) {
    if (!this.storage.metrics[module]) {
      return {
        count: 0,
        errors: 0,
        errorRate: 0,
        avgDuration: 0,
        operations: []
      };
    }
    
    const metrics = this.storage.metrics[module];
    const operations = [];
    
    for (const [operation, opMetrics] of Object.entries(metrics.operations)) {
      operations.push({
        operation,
        count: opMetrics.count,
        avgDuration: opMetrics.count > 0 ? opMetrics.totalDuration / opMetrics.count : 0,
        errors: opMetrics.errors,
        errorRate: opMetrics.count > 0 ? opMetrics.errors / opMetrics.count : 0
      });
    }
    
    // Sort operations by count
    operations.sort((a, b) => b.count - a.count);
    
    return {
      count: metrics.count,
      errors: metrics.errors,
      errorRate: metrics.count > 0 ? metrics.errors / metrics.count : 0,
      avgDuration: metrics.count > 0 ? metrics.totalDuration / metrics.count : 0,
      operations
    };
  }
  
  /**
   * Get recent events for a module
   * 
   * @param {string} module Module name
   * @param {number} limit Maximum number of events to return
   * @returns {Array} Recent events
   */
  getModuleEvents(module, limit = 10) {
    return this.storage.events
      .filter(event => event.module === module)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  /**
   * Get recent events for the entire system
   * 
   * @param {number} limit Maximum number of events to return
   * @returns {Array} Recent events
   */
  getRecentEvents(limit = 10) {
    return this.storage.events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  /**
   * Get time series data for a specific metric
   * 
   * @param {string} metric Metric to track
   * @param {string} module Optional module filter
   * @returns {Array} Time series data
   */
  getTimeSeries(metric, module = null) {
    const timeframes = Object.keys(this.storage.aggregated.byTimeframe)
      .map(Number)
      .sort((a, b) => a - b);
    
    return timeframes.map(timeframe => {
      const data = this.storage.aggregated.byTimeframe[timeframe];
      
      if (module) {
        // Module-specific metric
        const moduleData = data.byModule[module] || { count: 0 };
        
        return {
          timestamp: data.startTime,
          value: moduleData.count
        };
      } else {
        // Overall metric
        return {
          timestamp: data.startTime,
          value: data.totalEvents
        };
      }
    });
  }
  
  /**
   * Clear all tracking data
   */
  clear() {
    this.storage.events = [];
    this.storage.metrics = {};
    this.storage.aggregated.byModule = {};
    this.storage.aggregated.byOperation = {};
    this.storage.aggregated.byResource = {};
    this.storage.aggregated.byTimeframe = {};
    
    this.emit('data-cleared');
  }
  
  /**
   * Destroy the usage tracker
   */
  destroy() {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    
    this.clear();
    this.removeAllListeners();
  }
}

// Create default instance
const usageTracker = new UsageTracker();

export default usageTracker;