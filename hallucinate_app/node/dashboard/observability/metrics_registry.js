/**
 * Metrics Registry for PyArrow Content Index Dashboard
 * Provides global access to metrics collectors and service
 */

import MetricsService from './metrics_service.js';
import MetricsCollector from './metrics_collector.js';

// Singleton instance
let _instance = null;

/**
 * Metrics Registry
 * Singleton pattern for accessing metrics service and collectors
 */
class MetricsRegistry {
  /**
   * Create a new metrics registry
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Prevent multiple instances
    if (_instance) {
      return _instance;
    }
    
    this.options = options;
    this.initialized = false;
    this.metricsService = null;
    
    // Store the instance
    _instance = this;
  }
  
  /**
   * Initialize the metrics registry
   * @param {Object} options - Configuration options
   * @returns {Promise<MetricsRegistry>} Initialized registry
   */
  static async initialize(options = {}) {
    const registry = new MetricsRegistry(options);
    await registry.init();
    return registry;
  }
  
  /**
   * Get the singleton instance
   * @returns {MetricsRegistry} The singleton instance
   */
  static getInstance() {
    if (!_instance) {
      _instance = new MetricsRegistry();
    }
    
    return _instance;
  }
  
  /**
   * Initialize the registry
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    
    // Create metrics service
    this.metricsService = new MetricsService(this.options);
    await this.metricsService.init();
    
    this.initialized = true;
    
    return this;
  }
  
  /**
   * Get the metrics service
   * @returns {MetricsService} The metrics service
   */
  getMetricsService() {
    if (!this.initialized) {
      throw new Error('Metrics Registry not initialized');
    }
    
    return this.metricsService;
  }
  
  /**
   * Get or create a metrics collector for a component
   * @param {string} componentName - Component name
   * @param {Object} options - Collector options
   * @returns {MetricsCollector} The metrics collector
   */
  getCollector(componentName, options = {}) {
    if (!this.initialized) {
      // If not initialized, create a standalone collector
      // This allows components to start collecting metrics even before registry is initialized
      return new MetricsCollector(componentName, options);
    }
    
    // Check if a collector already exists
    let collector = this.metricsService.getCollector(componentName);
    
    if (!collector) {
      // Create and register a new collector
      collector = new MetricsCollector(componentName, options);
      this.metricsService.registerCollector(componentName, collector);
    }
    
    return collector;
  }
  
  /**
   * Dispose of the registry and all resources
   */
  dispose() {
    if (this.metricsService) {
      this.metricsService.dispose();
      this.metricsService = null;
    }
    
    this.initialized = false;
    _instance = null;
  }
}

// Export the class and convenience methods
export default MetricsRegistry;

// Convenience method to get a collector
export function getMetricsCollector(componentName, options = {}) {
  return MetricsRegistry.getInstance().getCollector(componentName, options);
}

// Convenience method to get the metrics service
export function getMetricsService() {
  return MetricsRegistry.getInstance().getMetricsService();
}

// Convenience method to initialize the registry
export async function initializeMetrics(options = {}) {
  return MetricsRegistry.initialize(options);
}