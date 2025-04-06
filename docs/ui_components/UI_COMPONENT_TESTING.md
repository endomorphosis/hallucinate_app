# UI Component Testing Guide

## Overview

This document provides a comprehensive guide to testing the PyArrow Content Index Dashboard UI components. It covers the testing approach, test structure, and implementation details for different component types.

## Test Architecture

### Testing Framework

The testing architecture uses a modular approach with:

1. **Mock DOM Implementation**: Simulates browser environment for headless testing
2. **Component Mocking**: Creates isolated test environments for components
3. **Assertion-based Testing**: Verifies component behavior through assertions
4. **Event Simulation**: Mimics user interactions and system events

### Test File Structure

Each test file follows a consistent structure:

```javascript
// Import dependencies and modules under test
import { ComponentUnderTest } from '../path/to/component.js';
import { MockDependency } from './mocks/mock_dependency.js';

// Test suite definition
describe('ComponentUnderTest', () => {
  // Setup and teardown
  let component;
  let mockDependency;
  
  beforeEach(() => {
    // Initialize mocks and test environment
    mockDependency = new MockDependency();
    document.body.innerHTML = '<div id="test-container"></div>';
    
    // Initialize component with mocks
    component = new ComponentUnderTest({
      container: document.getElementById('test-container'),
      dependency: mockDependency
    });
  });
  
  afterEach(() => {
    // Clean up after each test
    if (component && component.dispose) {
      component.dispose();
    }
    document.body.innerHTML = '';
  });
  
  // Individual test cases
  it('should initialize correctly', () => {
    // Test initialization behavior
    expect(component.initialized).toBe(true);
    expect(document.querySelector('.component-class')).not.toBeNull();
  });
  
  it('should respond to events', () => {
    // Trigger an event
    const event = new Event('click');
    document.querySelector('.trigger-element').dispatchEvent(event);
    
    // Assert expected behavior
    expect(mockDependency.methodCalled).toBe(true);
    expect(document.querySelector('.result-element').textContent).toBe('Expected Result');
  });
  
  // Error case testing
  it('should handle errors gracefully', () => {
    // Force an error condition
    mockDependency.shouldFail = true;
    
    // Verify error handling
    expect(() => component.performOperation()).not.toThrow();
    expect(document.querySelector('.error-message')).not.toBeNull();
    expect(document.querySelector('.error-message').textContent).toContain('Error occurred');
  });
});
```

## Component Test Types

### 1. Visualization Component Tests

The `test_visualization_components.js` file tests the visualization capabilities:

#### Testing Areas

- **Chart Initialization**: Verifies proper Chart.js integration and container setup
- **Data Processing**: Tests transformation of raw data into chart-ready format
- **Chart Rendering**: Validates different chart types and rendering options
- **Chart Updates**: Tests updating existing charts with new data
- **Resource Cleanup**: Verifies proper disposal of chart resources

#### Example Test Case

```javascript
it('should render a bar chart with correct options', async () => {
  // Arrange
  const container = document.createElement('div');
  document.body.appendChild(container);
  
  const data = {
    labels: ['Category A', 'Category B', 'Category C'],
    datasets: [{
      label: 'Test Dataset',
      data: [10, 20, 30],
      backgroundColor: ['#ff0000', '#00ff00', '#0000ff']
    }]
  };
  
  const visualizationManager = new VisualizationManager();
  await visualizationManager.init({
    container: container,
    chartType: 'bar'
  });
  
  // Act
  const chart = await visualizationManager.renderChart(data, 'bar');
  
  // Assert
  expect(chart).not.toBeNull();
  expect(chart.config.type).toBe('bar');
  expect(chart.data.labels).toEqual(['Category A', 'Category B', 'Category C']);
  expect(chart.data.datasets[0].data).toEqual([10, 20, 30]);
  
  // Optional: Test DOM elements created by Chart.js
  expect(container.querySelector('canvas')).not.toBeNull();
  
  // Cleanup
  await visualizationManager.dispose();
  document.body.removeChild(container);
});
```

### 2. Content Browser Tests

The `test_content_browser.js` file tests the metadata browser and search interface:

#### Testing Areas

- **Component Initialization**: Verifies proper setup of DOM elements and event listeners
- **Content Rendering**: Tests display of content items in different view modes
- **Search Functionality**: Validates query building and search execution
- **Event Propagation**: Tests communication between components
- **Selection Handling**: Verifies item selection and multi-select functionality
- **Pagination**: Tests page navigation and item limits

#### Example Test Case

```javascript
it('should filter content based on search criteria', async () => {
  // Arrange
  const mockData = [
    { cid: 'cid1', name: 'test-file-1.txt', size: 1024, type: 'text/plain' },
    { cid: 'cid2', name: 'image-1.png', size: 2048, type: 'image/png' },
    { cid: 'cid3', name: 'document.pdf', size: 3072, type: 'application/pdf' }
  ];
  
  // Initialize components with mock data
  const searchInterface = new SearchInterface({
    container: document.getElementById('search-container')
  });
  await searchInterface.init();
  
  const metadataBrowser = new MetadataBrowser({
    container: document.getElementById('browser-container'),
    onItemSelected: jest.fn()
  });
  await metadataBrowser.init();
  await metadataBrowser.updateContent(mockData);
  
  // Connect components
  searchInterface.addEventListener('search', (criteria) => {
    const filteredData = mockData.filter(item => {
      return item.type === criteria.type;
    });
    metadataBrowser.updateContent(filteredData);
  });
  
  // Act: Perform search for images
  await searchInterface.setSearchCriteria({ type: 'image/png' });
  await searchInterface.executeSearch();
  
  // Assert: Only image should be displayed
  const displayedItems = document.querySelectorAll('.content-item');
  expect(displayedItems.length).toBe(1);
  expect(displayedItems[0].textContent).toContain('image-1.png');
  
  // Cleanup
  await searchInterface.dispose();
  await metadataBrowser.dispose();
});
```

### 3. Security Capability Tests

The `test_pyarrow_index_capabilities.js` file tests the security implementation:

#### Testing Areas

- **Capability Verification**: Tests UCAN-based capability checks
- **Permission Hierarchy**: Validates capability inheritance (admin includes read/write)
- **Resource Scoping**: Tests resource-specific capability verification
- **Error Handling**: Verifies proper error messages for unauthorized operations
- **Token Validation**: Tests token creation, verification, and expiration

#### Example Test Case

```javascript
it('should verify resource-specific capabilities correctly', async () => {
  // Arrange
  const mockAuth = {
    verifyCapability: jest.fn().mockImplementation((cap, resource) => {
      // Mock implementation of capability verification
      if (cap === 'pyarrow:index:read') {
        // Allow read access to specific paths
        return resource && (
          resource.path === '/public/data' || 
          resource.path.startsWith('/public/')
        );
      }
      return false;
    })
  };
  
  const indexManager = new PyArrowIndexManager({
    auth: mockAuth
  });
  
  // Act & Assert: Test allowed paths
  expect(await indexManager.canAccess('/public/data', 'read')).toBe(true);
  expect(await indexManager.canAccess('/public/images/test.png', 'read')).toBe(true);
  
  // Act & Assert: Test disallowed paths
  expect(await indexManager.canAccess('/private/data', 'read')).toBe(false);
  expect(await indexManager.canAccess('/admin/config', 'read')).toBe(false);
  
  // Verify the auth service was called with correct parameters
  expect(mockAuth.verifyCapability).toHaveBeenCalledWith(
    'pyarrow:index:read', 
    { path: '/public/data' }
  );
});
```

### 4. Observability Tests

The `test_dashboard_observability.js` file tests metrics collection and reporting:

#### Testing Areas

- **Metrics Collection**: Tests recording of different metric types
- **Counter Metrics**: Validates incremental counting of events
- **Gauge Metrics**: Tests setting and updating of current values
- **Histogram Metrics**: Verifies distribution recording and statistics
- **Context Labels**: Tests adding contextual information to metrics
- **Metric Export**: Validates formatting for monitoring systems

#### Example Test Case

```javascript
it('should record and report timing metrics correctly', async () => {
  // Arrange
  const metricsCollector = new MetricsCollector('test-component');
  
  // Act: Record timing data
  const timer = metricsCollector.startTimer('operation_duration');
  // Simulate operation time
  await new Promise(resolve => setTimeout(resolve, 50));
  timer.stop();
  
  // Export metrics
  const metrics = metricsCollector.exportMetrics();
  
  // Assert
  expect(metrics).toHaveProperty('histograms');
  expect(metrics.histograms).toHaveProperty('operation_duration');
  expect(metrics.histograms.operation_duration.count).toBe(1);
  
  // Verify timing is reasonable (between 30-150ms to account for test variability)
  expect(metrics.histograms.operation_duration.sum).toBeGreaterThan(30);
  expect(metrics.histograms.operation_duration.sum).toBeLessThan(150);
  
  // Verify labels
  expect(metrics.histograms.operation_duration.labels).toEqual({
    component: 'test-component',
    operation: 'operation_duration'
  });
});
```

## Mock Implementations

### DOM Environment Mock

For testing browser components without a real browser:

```javascript
// mock_dom.js
export class MockDOM {
  static setup() {
    // Create a mock document object
    global.document = {
      createElement: (tag) => {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          style: {},
          children: [],
          attributes: {},
          innerHTML: '',
          
          appendChild(child) {
            this.children.push(child);
            return child;
          },
          
          setAttribute(name, value) {
            this.attributes[name] = value;
          },
          
          getAttribute(name) {
            return this.attributes[name];
          },
          
          querySelector(selector) {
            // Basic selector implementation
            return null;
          },
          
          querySelectorAll(selector) {
            // Basic selector implementation
            return [];
          }
        };
      },
      
      body: {
        appendChild: (element) => element,
        children: []
      },
      
      getElementById: (id) => null,
      querySelector: (selector) => null,
      querySelectorAll: (selector) => []
    };
    
    // Create a mock window object
    global.window = {
      addEventListener: (event, callback) => {},
      removeEventListener: (event, callback) => {}
    };
    
    // Mock event classes
    global.Event = class Event {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
        this.cancelable = options.cancelable || false;
      }
    };
    
    global.CustomEvent = class CustomEvent extends global.Event {
      constructor(type, options = {}) {
        super(type, options);
        this.detail = options.detail || null;
      }
    };
  }
  
  static cleanup() {
    delete global.document;
    delete global.window;
    delete global.Event;
    delete global.CustomEvent;
  }
}
```

### Chart.js Mock

For testing visualization components without loading Chart.js:

```javascript
// mock_chart.js
export class MockChart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.data = config.data || {
      labels: [],
      datasets: []
    };
    this.options = config.options || {};
    this.destroyed = false;
  }
  
  update() {
    // Mock update functionality
    return this;
  }
  
  destroy() {
    this.destroyed = true;
  }
  
  static register() {
    // Mock registration
  }
}

export function setupChartMock() {
  global.Chart = MockChart;
}

export function cleanupChartMock() {
  delete global.Chart;
}
```

## Running Tests

### Command Line Execution

Run all UI component tests:

```bash
npm run test:ui-components
```

Run a specific test suite:

```bash
npm run test -- test/js/test_visualization_components.js
```

Run with coverage reporting:

```bash
npm run test:coverage
```

### Test Output Format

The test runner produces output in the following format:

```
PASS test/js/test_visualization_components.js
  VisualizationManager
    ✓ should initialize with container element (5ms)
    ✓ should render bar chart correctly (15ms)
    ✓ should update existing chart with new data (8ms)
    ✓ should dispose chart resources properly (3ms)
    ✓ should handle missing container gracefully (2ms)

PASS test/js/test_content_browser.js
  MetadataBrowser
    ✓ should initialize with container element (4ms)
    ✓ should render content items correctly (12ms)
    ✓ should handle item selection (7ms)
    ✓ should paginate results correctly (10ms)
  SearchInterface
    ✓ should initialize with container element (3ms)
    ✓ should build search query from form inputs (5ms)
    ✓ should emit search event on form submission (4ms)
    ✓ should save search history (3ms)

Test Suites: 4 passed, 4 total
Tests:       27 passed, 27 total
Snapshots:   0 total
Time:        3.245s
```

## Best Practices for UI Component Testing

### General Testing Principles

1. **Isolate Components**: Test components in isolation with mocked dependencies
2. **Test Behavior, Not Implementation**: Focus on what the component does, not how it does it
3. **Cover Edge Cases**: Test error conditions, empty states, and boundary conditions
4. **Minimize Test Coupling**: Tests should not depend on other tests
5. **Clean Up Resources**: Ensure proper cleanup after each test

### Specific UI Testing Guidelines

1. **DOM Verification**:
   - Check that components create and update DOM elements correctly
   - Verify class names, attributes, and content of created elements
   - Test that DOM is properly cleaned up on disposal

2. **Event Handling**:
   - Test that components respond to relevant events
   - Verify event propagation and bubbling behavior
   - Check custom event creation and dispatching

3. **State Management**:
   - Verify component state changes in response to actions
   - Test that UI reflects state changes correctly
   - Check initialization and reset functionality

4. **Asynchronous Operations**:
   - Use async/await for testing asynchronous behavior
   - Test loading states and progress indicators
   - Verify proper handling of operation completion and errors

5. **Accessibility Testing**:
   - Verify ARIA attributes and roles
   - Test keyboard navigation and focus management
   - Check color contrast and text alternatives

### Common UI Testing Pitfalls

1. **Brittle Selectors**: Avoid overly specific CSS selectors that break with minor UI changes
2. **Timing Issues**: Use proper async/await patterns instead of arbitrary timeouts
3. **Order Dependencies**: Tests should not depend on the order of execution
4. **Memory Leaks**: Ensure all resources are properly cleaned up
5. **Over-mocking**: Don't mock everything; test real interactions where reasonable

## Continuous Integration

The UI component tests are integrated into the CI pipeline:

1. **Pre-commit Hook**: Runs basic lint and test checks before commit
2. **CI Pipeline Stages**:
   - Lint: Checks code style and formatting
   - Unit Tests: Runs all component tests
   - Coverage: Ensures test coverage meets thresholds
   - Integration Tests: Tests component interactions
   - Visual Regression: Compares screenshots for UI changes

3. **Coverage Requirements**:
   - Overall coverage: > 80%
   - Statement coverage: > 75%
   - Branch coverage: > 70%
   - Function coverage: > 90%

## Troubleshooting Tests

### Common Issues

1. **Test Environment Setup**:
   - Ensure MockDOM is properly initialized before tests
   - Verify cleanup runs after each test
   - Check for global state contamination between tests

2. **Asynchronous Testing**:
   - Use proper async/await patterns
   - Ensure promises are resolved before assertions
   - Watch for unhandled promise rejections

3. **Event Simulation**:
   - Verify events have correct properties
   - Check event propagation paths
   - Ensure event handlers are properly attached

### Debugging Tests

1. **Console Debugging**:
   - Add console.log statements in tests
   - Use --verbose flag for detailed test output
   - Check for error messages in console

2. **DOM Inspection**:
   - Log document.body.innerHTML to see current DOM state
   - Check element existence before assertions
   - Verify element properties and attributes

3. **State Inspection**:
   - Log component state at key points
   - Verify state changes after actions
   - Check intermediate values in complex operations

## Future Test Enhancements

1. **Visual Regression Testing**:
   - Implement screenshot comparison for UI components
   - Verify layout and appearance across browsers
   - Automate visual verification in CI pipeline

2. **End-to-End Testing**:
   - Add Cypress or Playwright tests for full user workflows
   - Test integration with real backend services
   - Verify cross-component interactions

3. **Performance Testing**:
   - Measure render times and memory usage
   - Track performance regression over time
   - Set performance budgets for critical components

4. **Accessibility Automation**:
   - Integrate axe or similar tools for a11y testing
   - Verify WCAG compliance automatically
   - Include screen reader compatibility tests