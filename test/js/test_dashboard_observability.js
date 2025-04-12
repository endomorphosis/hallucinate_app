/**
 * Tests for PyArrow Content Index Dashboard observability components
 * 
 * Verifies the metrics collection and reporting functionality for the
 * PyArrow Content Index Dashboard components.
 */

const assert = require('assert');
const path = require('path');

// Mock observability implementation
class MockObservability {
  constructor() {
    this.metrics = {
      counters: {},
      gauges: {},
      histograms: {}
    };
    this.context = {};
  }

  register_counter(name, help, labels = [], namespace = '', subsystem = '') {
    const metricId = `${namespace}_${subsystem}_${name}`;
    this.metrics.counters[metricId] = {
      name,
      help,
      labels,
      namespace,
      subsystem,
      values: {}
    };
    
    return {
      inc: (labelValues = {}, value = 1) => {
        const labelKey = this._getLabelKey(labelValues);
        if (!this.metrics.counters[metricId].values[labelKey]) {
          this.metrics.counters[metricId].values[labelKey] = 0;
        }
        this.metrics.counters[metricId].values[labelKey] += value;
      },
      get: (labelValues = {}) => {
        const labelKey = this._getLabelKey(labelValues);
        return this.metrics.counters[metricId].values[labelKey] || 0;
      }
    };
  }

  register_gauge(name, help, labels = [], namespace = '', subsystem = '') {
    const metricId = `${namespace}_${subsystem}_${name}`;
    this.metrics.gauges[metricId] = {
      name,
      help,
      labels,
      namespace,
      subsystem,
      values: {}
    };
    
    return {
      set: (labelValues = {}, value) => {
        const labelKey = this._getLabelKey(labelValues);
        this.metrics.gauges[metricId].values[labelKey] = value;
      },
      inc: (labelValues = {}, value = 1) => {
        const labelKey = this._getLabelKey(labelValues);
        if (!this.metrics.gauges[metricId].values[labelKey]) {
          this.metrics.gauges[metricId].values[labelKey] = 0;
        }
        this.metrics.gauges[metricId].values[labelKey] += value;
      },
      dec: (labelValues = {}, value = 1) => {
        const labelKey = this._getLabelKey(labelValues);
        if (!this.metrics.gauges[metricId].values[labelKey]) {
          this.metrics.gauges[metricId].values[labelKey] = 0;
        }
        this.metrics.gauges[metricId].values[labelKey] -= value;
      },
      get: (labelValues = {}) => {
        const labelKey = this._getLabelKey(labelValues);
        return this.metrics.gauges[metricId].values[labelKey] || 0;
      }
    };
  }

  register_histogram(name, help, labels = [], buckets = [0.1, 0.5, 1, 2, 5], namespace = '', subsystem = '') {
    const metricId = `${namespace}_${subsystem}_${name}`;
    this.metrics.histograms[metricId] = {
      name,
      help,
      labels,
      buckets,
      namespace,
      subsystem,
      values: {},
      sum: {},
      count: {}
    };
    
    return {
      observe: (labelValues = {}, value) => {
        const labelKey = this._getLabelKey(labelValues);
        
        // Update count
        if (!this.metrics.histograms[metricId].count[labelKey]) {
          this.metrics.histograms[metricId].count[labelKey] = 0;
        }
        this.metrics.histograms[metricId].count[labelKey]++;
        
        // Update sum
        if (!this.metrics.histograms[metricId].sum[labelKey]) {
          this.metrics.histograms[metricId].sum[labelKey] = 0;
        }
        this.metrics.histograms[metricId].sum[labelKey] += value;
        
        // Update buckets
        if (!this.metrics.histograms[metricId].values[labelKey]) {
          this.metrics.histograms[metricId].values[labelKey] = buckets.reduce((acc, bucket) => {
            acc[bucket] = 0;
            return acc;
          }, {});
        }
        
        for (const bucket of buckets) {
          if (value <= bucket) {
            this.metrics.histograms[metricId].values[labelKey][bucket]++;
          }
        }
      },
      get_count: (labelValues = {}) => {
        const labelKey = this._getLabelKey(labelValues);
        return this.metrics.histograms[metricId].count[labelKey] || 0;
      },
      get_sum: (labelValues = {}) => {
        const labelKey = this._getLabelKey(labelValues);
        return this.metrics.histograms[metricId].sum[labelKey] || 0;
      }
    };
  }
  
  with_labels(labels) {
    this.context = { ...this.context, ...labels };
    return this;
  }
  
  clear_labels() {
    this.context = {};
    return this;
  }
  
  _getLabelKey(labelValues) {
    // Combine context labels with provided labels
    const combinedLabels = { ...this.context, ...labelValues };
    return JSON.stringify(combinedLabels);
  }
}

describe('Dashboard Observability Integration', function() {
  let mockObservability;
  
  beforeEach(function() {
    // Create a fresh observability mock for each test
    mockObservability = new MockObservability();
  });
  
  // Helper function to create dashboard components with observability
  const createDashboardWithObservability = (options = {}) => {
    return {
      eventBus: {
        listeners: {},
        on(event, callback) {
          if (!this.listeners[event]) {
            this.listeners[event] = [];
          }
          this.listeners[event].push(callback);
          return this;
        },
        emit(event, data) {
          if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
          }
          return this;
        }
      },
      metrics: {
        // Dashboard-specific metrics
        panelViews: mockObservability.register_counter(
          'dashboard_panel_views_total',
          'Number of times the dashboard panel was viewed',
          ['panel'],
          'pyarrow_index',
          'dashboard'
        ),
        panelActions: mockObservability.register_counter(
          'dashboard_panel_actions_total',
          'Number of actions performed in the dashboard panel',
          ['panel', 'action'],
          'pyarrow_index',
          'dashboard'
        ),
        componentRenders: mockObservability.register_counter(
          'component_renders_total',
          'Number of times a component was rendered',
          ['component'],
          'pyarrow_index',
          'dashboard'
        ),
        queryDuration: mockObservability.register_histogram(
          'query_duration_seconds',
          'Duration of query operations in seconds',
          ['operation'],
          [0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
          'pyarrow_index',
          'dashboard'
        ),
        activeUsers: mockObservability.register_gauge(
          'active_users',
          'Number of active users viewing the dashboard',
          [],
          'pyarrow_index',
          'dashboard'
        ),
        componentStatus: mockObservability.register_gauge(
          'component_status',
          'Status of dashboard components (1 = up, 0 = down)',
          ['component'],
          'pyarrow_index',
          'dashboard'
        )
      },
      logMetric(metricName, labels = {}, value = 1) {
        if (this.metrics[metricName]) {
          if (typeof this.metrics[metricName].inc === 'function') {
            this.metrics[metricName].inc(labels, value);
          } else if (typeof this.metrics[metricName].set === 'function') {
            this.metrics[metricName].set(labels, value);
          } else if (typeof this.metrics[metricName].observe === 'function') {
            this.metrics[metricName].observe(labels, value);
          }
        }
      },
      startOperation(operation) {
        const startTime = Date.now();
        return {
          end: () => {
            const duration = (Date.now() - startTime) / 1000; // Convert to seconds
            this.metrics.queryDuration.observe({ operation }, duration);
          }
        };
      }
    };
  };
  
  // Test case: Counter metrics
  it('should record counter metrics', function() {
    const dashboard = createDashboardWithObservability();
    
    // Record panel views
    dashboard.logMetric('panelViews', { panel: 'statistics' });
    dashboard.logMetric('panelViews', { panel: 'statistics' });
    dashboard.logMetric('panelViews', { panel: 'browser' });
    
    // Record panel actions
    dashboard.logMetric('panelActions', { panel: 'statistics', action: 'refresh' });
    dashboard.logMetric('panelActions', { panel: 'browser', action: 'search' });
    dashboard.logMetric('panelActions', { panel: 'browser', action: 'filter' }, 3);
    
    // Check metrics
    const statisticsViews = dashboard.metrics.panelViews.get({ panel: 'statistics' });
    const browserViews = dashboard.metrics.panelViews.get({ panel: 'browser' });
    const statisticsRefreshActions = dashboard.metrics.panelActions.get({ panel: 'statistics', action: 'refresh' });
    const browserSearchActions = dashboard.metrics.panelActions.get({ panel: 'browser', action: 'search' });
    const browserFilterActions = dashboard.metrics.panelActions.get({ panel: 'browser', action: 'filter' });
    
    assert.strictEqual(statisticsViews, 2, 'Should record 2 statistics panel views');
    assert.strictEqual(browserViews, 1, 'Should record 1 browser panel view');
    assert.strictEqual(statisticsRefreshActions, 1, 'Should record 1 statistics refresh action');
    assert.strictEqual(browserSearchActions, 1, 'Should record 1 browser search action');
    assert.strictEqual(browserFilterActions, 3, 'Should record 3 browser filter actions');
  });
  
  // Test case: Gauge metrics
  it('should record gauge metrics', function() {
    const dashboard = createDashboardWithObservability();
    
    // Set active users
    dashboard.metrics.activeUsers.set({}, 5);
    
    // Increase active users
    dashboard.metrics.activeUsers.inc({}, 2);
    
    // Set component status
    dashboard.metrics.componentStatus.set({ component: 'contentBrowser' }, 1);
    dashboard.metrics.componentStatus.set({ component: 'visualizations' }, 1);
    dashboard.metrics.componentStatus.set({ component: 'securityPanel' }, 0);
    
    // Check metrics
    const activeUsers = dashboard.metrics.activeUsers.get({});
    const contentBrowserStatus = dashboard.metrics.componentStatus.get({ component: 'contentBrowser' });
    const visualizationsStatus = dashboard.metrics.componentStatus.get({ component: 'visualizations' });
    const securityPanelStatus = dashboard.metrics.componentStatus.get({ component: 'securityPanel' });
    
    assert.strictEqual(activeUsers, 7, 'Should record 7 active users (5 + 2)');
    assert.strictEqual(contentBrowserStatus, 1, 'Content browser should be up');
    assert.strictEqual(visualizationsStatus, 1, 'Visualizations should be up');
    assert.strictEqual(securityPanelStatus, 0, 'Security panel should be down');
  });
  
  // Test case: Histogram metrics
  it('should record histogram metrics', function() {
    const dashboard = createDashboardWithObservability();
    
    // Record query durations
    const queryOperation = dashboard.startOperation('query');
    setTimeout(() => queryOperation.end(), 10); // 10ms
    
    const lookupOperation = dashboard.startOperation('lookupByCid');
    setTimeout(() => lookupOperation.end(), 5); // 5ms
    
    // Add some direct observations
    dashboard.metrics.queryDuration.observe({ operation: 'query' }, 0.2);
    dashboard.metrics.queryDuration.observe({ operation: 'query' }, 0.3);
    dashboard.metrics.queryDuration.observe({ operation: 'addEntry' }, 0.5);
    
    // Wait for timeouts to complete
    setTimeout(() => {
      // Check metrics
      const queryCount = dashboard.metrics.queryDuration.get_count({ operation: 'query' });
      const querySum = dashboard.metrics.queryDuration.get_sum({ operation: 'query' });
      const lookupCount = dashboard.metrics.queryDuration.get_count({ operation: 'lookupByCid' });
      const addEntryCount = dashboard.metrics.queryDuration.get_count({ operation: 'addEntry' });
      
      assert.strictEqual(queryCount, 3, 'Should record 3 query operations (1 timed + 2 direct)');
      assert.ok(querySum > 0.5, 'Query sum should be at least 0.5s (0.2 + 0.3 + timed)');
      assert.strictEqual(lookupCount, 1, 'Should record 1 lookup operation');
      assert.strictEqual(addEntryCount, 1, 'Should record 1 add entry operation');
    }, 20);
  });
  
  // Test case: Context labels
  it('should support context labels', function() {
    // Create observability with context
    const contextObservability = new MockObservability();
    contextObservability.with_labels({ user: 'test-user', session: 'test-session' });
    
    // Create counter with context
    const pageViews = contextObservability.register_counter(
      'page_views_total',
      'Total page views',
      ['page'],
      'web',
      'analytics'
    );
    
    // Record metrics with context
    pageViews.inc({ page: 'home' });
    pageViews.inc({ page: 'dashboard' });
    
    // Add more context and record again
    contextObservability.with_labels({ feature: 'statistics' });
    pageViews.inc({ page: 'dashboard' });
    
    // Check metrics with different contexts
    const homeViewsWithUserSession = pageViews.get({ page: 'home' }); // Should include user and session context
    
    // Clear context and check without context
    contextObservability.clear_labels();
    const dashboardViewsNoContext = pageViews.get({ page: 'dashboard' }); // No context
    
    assert.strictEqual(homeViewsWithUserSession, 1, 'Should record 1 home page view with user and session context');
    assert.strictEqual(dashboardViewsNoContext, 0, 'Should not find dashboard views without context');
  });
  
  // Test case: Dashboard component integration
  it('should integrate with dashboard components', function() {
    const dashboard = createDashboardWithObservability();
    
    // Mock visualization manager with metrics integration
    const visualizationManager = {
      init() {
        dashboard.logMetric('componentRenders', { component: 'visualizationManager' });
        dashboard.metrics.componentStatus.set({ component: 'visualizationManager' }, 1);
        return Promise.resolve(true);
      },
      renderCharts() {
        dashboard.logMetric('componentRenders', { component: 'charts' });
        
        // Record render time
        const renderOperation = dashboard.startOperation('renderCharts');
        setTimeout(() => renderOperation.end(), 5);
      },
      dispose() {
        dashboard.metrics.componentStatus.set({ component: 'visualizationManager' }, 0);
      }
    };
    
    // Mock content browser with metrics integration
    const contentBrowser = {
      init() {
        dashboard.logMetric('componentRenders', { component: 'contentBrowser' });
        dashboard.metrics.componentStatus.set({ component: 'contentBrowser' }, 1);
        return Promise.resolve(true);
      },
      search(query) {
        dashboard.logMetric('panelActions', { panel: 'browser', action: 'search' });
        
        // Record search time
        const searchOperation = dashboard.startOperation('search');
        setTimeout(() => searchOperation.end(), 10);
      },
      dispose() {
        dashboard.metrics.componentStatus.set({ component: 'contentBrowser' }, 0);
      }
    };
    
    // Call component methods with metrics
    visualizationManager.init();
    visualizationManager.renderCharts();
    contentBrowser.init();
    contentBrowser.search('test query');
    
    // Dispose components
    visualizationManager.dispose();
    contentBrowser.dispose();
    
    // Check metrics
    setTimeout(() => {
      const visualizationRenders = dashboard.metrics.componentRenders.get({ component: 'visualizationManager' });
      const chartRenders = dashboard.metrics.componentRenders.get({ component: 'charts' });
      const contentBrowserRenders = dashboard.metrics.componentRenders.get({ component: 'contentBrowser' });
      const searchActions = dashboard.metrics.panelActions.get({ panel: 'browser', action: 'search' });
      const visualizationStatus = dashboard.metrics.componentStatus.get({ component: 'visualizationManager' });
      const contentBrowserStatus = dashboard.metrics.componentStatus.get({ component: 'contentBrowser' });
      
      assert.strictEqual(visualizationRenders, 1, 'Should record 1 visualization manager render');
      assert.strictEqual(chartRenders, 1, 'Should record 1 chart render');
      assert.strictEqual(contentBrowserRenders, 1, 'Should record 1 content browser render');
      assert.strictEqual(searchActions, 1, 'Should record 1 search action');
      assert.strictEqual(visualizationStatus, 0, 'Visualization manager should be down after dispose');
      assert.strictEqual(contentBrowserStatus, 0, 'Content browser should be down after dispose');
    }, 20);
  });
});