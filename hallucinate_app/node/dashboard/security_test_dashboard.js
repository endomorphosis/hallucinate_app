/**
 * Security Test Dashboard
 * 
 * Provides a visual interface for running and analyzing security tests
 * Integrates with the security test suite to display test results
 */

import { EventEmitter } from 'events';
import securityTestSuite from '../test/security_test_suite.js';
import NotificationSystem from './notifications.js';

export default class SecurityTestDashboard extends EventEmitter {
  /**
   * Create a new security test dashboard
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      element: null,
      eventBus: null,
      testSuite: securityTestSuite,
      ...options
    };
    
    this.element = options.element;
    this.testSuite = options.testSuite || securityTestSuite;
    this.eventBus = options.eventBus;
    this.notifications = null;
    
    // Test execution state
    this.isRunning = false;
    this.currentResults = null;
    this.testHistory = [];
    
    // Dashboard elements
    this.elements = {
      moduleCards: {},
      testElements: {},
      summary: null,
      controls: null
    };
    
    // Initialize if element is provided
    if (this.element) {
      this.init();
    }
  }
  
  /**
   * Initialize the dashboard
   */
  async init() {
    // Don't initialize twice
    if (this.initialized) return;
    
    // Set up test suite event handlers
    this.setupTestSuiteEvents();
    
    // Create notification system
    this.notifications = new NotificationSystem({
      container: this.element,
      position: 'top-right'
    });
    
    this.initialized = true;
    return true;
  }
  
  /**
   * Set up event handlers for the test suite
   */
  setupTestSuiteEvents() {
    if (!this.testSuite) return;
    
    // Module start events
    this.testSuite.on('module-start', (data) => {
      this.updateModuleUI(data.moduleId, 'running');
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-module-start', data);
      }
    });
    
    // Module complete events
    this.testSuite.on('module-complete', (data) => {
      const status = data.results.success ? 'passed' : 'failed';
      this.updateModuleUI(data.moduleId, status, data.results);
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-module-complete', data);
      }
    });
    
    // Test events
    this.testSuite.on('test-start', (data) => {
      this.updateTestUI(data.moduleId, data.testName, 'running');
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-start', data);
      }
    });
    
    this.testSuite.on('test-pass', (data) => {
      this.updateTestUI(data.moduleId, data.testName, 'passed', { duration: data.duration });
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-pass', data);
      }
    });
    
    this.testSuite.on('test-fail', (data) => {
      this.updateTestUI(data.moduleId, data.testName, 'failed', { 
        error: data.error,
        duration: data.duration
      });
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-fail', data);
      }
    });
    
    this.testSuite.on('test-error', (data) => {
      this.updateTestUI(data.moduleId, data.testName, 'error', { 
        error: data.error.message,
        stack: data.error.stack
      });
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-error', data);
      }
    });
    
    this.testSuite.on('test-skip', (data) => {
      this.updateTestUI(data.moduleId, data.testName, 'skipped', { reason: data.reason });
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-skip', data);
      }
    });
    
    // Suite events
    this.testSuite.on('suite-complete', (results) => {
      this.testComplete(results);
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-suite-complete', results);
      }
    });
    
    this.testSuite.on('suite-error', (data) => {
      this.testError(data.error, data.results);
      
      if (this.eventBus) {
        this.eventBus.emit('security-test-suite-error', data);
      }
    });
  }
  
  /**
   * Render the dashboard
   */
  async render() {
    if (!this.element || !this.initialized) {
      console.error('Dashboard not initialized or no element provided');
      return;
    }
    
    // Create the main dashboard structure
    this.element.innerHTML = `
      <div class="security-test-dashboard">
        <div class="dashboard-header">
          <h2><i class="fas fa-shield-alt"></i> Security Test Suite</h2>
          <p>Run comprehensive security tests for all components</p>
          
          <div class="test-controls" id="test-controls">
            <button id="btn-run-all-tests" class="btn btn-primary">
              <i class="fas fa-play"></i> Run All Tests
            </button>
            <button id="btn-run-selected-tests" class="btn btn-secondary" disabled>
              <i class="fas fa-check-square"></i> Run Selected Tests
            </button>
            <button id="btn-export-results" class="btn btn-outline" disabled>
              <i class="fas fa-file-export"></i> Export Results
            </button>
          </div>
        </div>
        
        <div class="dashboard-summary" id="test-summary">
          <div class="summary-item">
            <span class="summary-label">Total Tests:</span>
            <span class="summary-value" id="summary-total">0</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Passed:</span>
            <span class="summary-value success" id="summary-passed">0</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Failed:</span>
            <span class="summary-value error" id="summary-failed">0</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Skipped:</span>
            <span class="summary-value warning" id="summary-skipped">0</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Duration:</span>
            <span class="summary-value" id="summary-duration">0ms</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Status:</span>
            <span class="summary-value" id="summary-status">Not Run</span>
          </div>
        </div>
        
        <div class="module-grid" id="module-grid"></div>
        
        <div class="test-details" id="test-details">
          <div class="details-header">
            <h3>Test Details</h3>
            <button class="btn btn-icon" id="btn-close-details">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="details-content" id="details-content">
            <p>Select a test to view details</p>
          </div>
        </div>
      </div>
    `;
    
    // Store references to key elements
    this.elements.controls = this.element.querySelector('#test-controls');
    this.elements.summary = {
      total: this.element.querySelector('#summary-total'),
      passed: this.element.querySelector('#summary-passed'),
      failed: this.element.querySelector('#summary-failed'),
      skipped: this.element.querySelector('#summary-skipped'),
      duration: this.element.querySelector('#summary-duration'),
      status: this.element.querySelector('#summary-status')
    };
    this.elements.moduleGrid = this.element.querySelector('#module-grid');
    this.elements.testDetails = this.element.querySelector('#test-details');
    this.elements.detailsContent = this.element.querySelector('#details-content');
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Render module cards
    this.renderModuleCards();
    
    // Render test history if available
    if (this.testHistory.length > 0) {
      this.updateSummary(this.testHistory[0]);
    }
    
    return true;
  }
  
  /**
   * Set up dashboard event handlers
   */
  setupEventHandlers() {
    // Run all tests button
    const btnRunAllTests = this.element.querySelector('#btn-run-all-tests');
    btnRunAllTests.addEventListener('click', () => {
      this.runAllTests();
    });
    
    // Run selected tests button
    const btnRunSelectedTests = this.element.querySelector('#btn-run-selected-tests');
    btnRunSelectedTests.addEventListener('click', () => {
      this.runSelectedTests();
    });
    
    // Export results button
    const btnExportResults = this.element.querySelector('#btn-export-results');
    btnExportResults.addEventListener('click', () => {
      this.exportResults();
    });
    
    // Close details button
    const btnCloseDetails = this.element.querySelector('#btn-close-details');
    btnCloseDetails.addEventListener('click', () => {
      this.toggleTestDetails(false);
    });
  }
  
  /**
   * Render module cards for each test module
   */
  renderModuleCards() {
    // Clear existing cards
    this.elements.moduleGrid.innerHTML = '';
    this.elements.moduleCards = {};
    
    // Create a card for each module
    Object.entries(this.testSuite.testModules).forEach(([moduleId, module]) => {
      const moduleCard = document.createElement('div');
      moduleCard.className = 'module-card';
      moduleCard.dataset.moduleId = moduleId;
      
      // Get test count for this module
      const testCount = module.tests.length;
      
      moduleCard.innerHTML = `
        <div class="module-header">
          <h3>${module.name}</h3>
          <span class="test-count">${testCount} tests</span>
          <div class="module-actions">
            <button class="btn btn-sm btn-primary btn-run-module" data-module-id="${moduleId}">
              <i class="fas fa-play"></i> Run
            </button>
            <button class="btn btn-sm btn-icon btn-toggle-tests" data-module-id="${moduleId}">
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
        </div>
        <div class="module-status pending">
          <i class="fas fa-circle"></i> Not Run
        </div>
        <div class="module-tests" style="display: none;">
          <ul class="test-list">
            ${module.tests.map(test => `
              <li class="test-item" data-test-id="${test.id}">
                <div class="test-name">
                  <i class="fas fa-vial"></i> 
                  ${test.name}
                </div>
                <div class="test-status pending">
                  <i class="fas fa-circle"></i> Not Run
                </div>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
      
      // Store reference to module card
      this.elements.moduleCards[moduleId] = {
        element: moduleCard,
        status: moduleCard.querySelector('.module-status'),
        tests: {}
      };
      
      // Store references to test elements
      const testItems = moduleCard.querySelectorAll('.test-item');
      testItems.forEach(testItem => {
        const testId = testItem.dataset.testId;
        this.elements.moduleCards[moduleId].tests[testId] = {
          element: testItem,
          status: testItem.querySelector('.test-status')
        };
      });
      
      // Add event listener for running this module's tests
      const btnRunModule = moduleCard.querySelector('.btn-run-module');
      btnRunModule.addEventListener('click', () => {
        this.runModuleTests(moduleId);
      });
      
      // Add event listener for toggling tests display
      const btnToggleTests = moduleCard.querySelector('.btn-toggle-tests');
      btnToggleTests.addEventListener('click', () => {
        const testsElement = moduleCard.querySelector('.module-tests');
        const isHidden = testsElement.style.display === 'none';
        
        testsElement.style.display = isHidden ? 'block' : 'none';
        btnToggleTests.querySelector('i').className = isHidden ? 
          'fas fa-chevron-up' : 'fas fa-chevron-down';
      });
      
      // Add event listeners for test items
      testItems.forEach(testItem => {
        testItem.addEventListener('click', () => {
          const testId = testItem.dataset.testId;
          this.showTestDetails(moduleId, testId);
        });
      });
      
      // Add module card to the grid
      this.elements.moduleGrid.appendChild(moduleCard);
    });
  }
  
  /**
   * Run all security tests
   */
  async runAllTests() {
    if (this.isRunning) {
      this.notifications.warning('Tests are already running');
      return;
    }
    
    this.isRunning = true;
    this.resetTestUI();
    
    // Update button state
    const btnRunAllTests = this.element.querySelector('#btn-run-all-tests');
    btnRunAllTests.disabled = true;
    btnRunAllTests.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
    
    // Update summary status
    this.updateSummaryStatus('running', 'Running tests...');
    
    try {
      // Run the tests
      const results = await this.testSuite.runAllTests();
      
      // Store results
      this.testComplete(results);
    } catch (error) {
      this.testError(error);
    } finally {
      // Update button state
      btnRunAllTests.disabled = false;
      btnRunAllTests.innerHTML = '<i class="fas fa-play"></i> Run All Tests';
      
      this.isRunning = false;
    }
  }
  
  /**
   * Run tests for a specific module
   * @param {string} moduleId Module ID
   */
  async runModuleTests(moduleId) {
    if (this.isRunning) {
      this.notifications.warning('Tests are already running');
      return;
    }
    
    const module = this.testSuite.testModules[moduleId];
    if (!module) {
      this.notifications.error(`Module ${moduleId} not found`);
      return;
    }
    
    this.isRunning = true;
    
    // Reset only this module's UI
    this.resetModuleUI(moduleId);
    
    // Update module button state
    const btnRunModule = this.elements.moduleCards[moduleId].element.querySelector('.btn-run-module');
    btnRunModule.disabled = true;
    btnRunModule.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
    
    // Update module status
    this.updateModuleUI(moduleId, 'running');
    
    try {
      // Run the module tests
      const results = await this.testSuite.runModuleTests(moduleId, module);
      
      // Update UI with results
      const status = results.success ? 'passed' : 'failed';
      this.updateModuleUI(moduleId, status, results);
      
      // Show notification
      if (results.success) {
        this.notifications.success(`${module.name} tests passed`);
      } else {
        this.notifications.error(`${module.name} tests failed`);
      }
      
      // Enable export button
      this.element.querySelector('#btn-export-results').disabled = false;
      
      // Store partial results
      const suiteResults = {
        modules: {
          [moduleId]: results
        },
        success: results.success,
        totalTests: results.totalTests,
        passedTests: results.passedTests,
        failedTests: results.failedTests,
        skippedTests: results.skippedTests,
        timestamp: new Date().toISOString(),
        duration: results.duration
      };
      
      this.currentResults = suiteResults;
      this.testHistory.unshift(suiteResults);
      
      // Update summary with partial results
      this.updateSummary(suiteResults);
    } catch (error) {
      // Update module status to error
      this.updateModuleUI(moduleId, 'error', { error: error.message });
      
      // Show error notification
      this.notifications.error(`Error running ${module.name} tests: ${error.message}`);
    } finally {
      // Update button state
      btnRunModule.disabled = false;
      btnRunModule.innerHTML = '<i class="fas fa-play"></i> Run';
      
      this.isRunning = false;
    }
  }
  
  /**
   * Run selected tests
   */
  runSelectedTests() {
    // Implement this in the future
    this.notifications.info('This feature is not yet implemented');
  }
  
  /**
   * Export test results
   */
  exportResults() {
    if (!this.currentResults) {
      this.notifications.warning('No test results to export');
      return;
    }
    
    // Create a JSON blob
    const resultsJson = JSON.stringify(this.currentResults, null, 2);
    const blob = new Blob([resultsJson], { type: 'application/json' });
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-test-results-${timestamp}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Show notification
    this.notifications.success('Test results exported successfully');
  }
  
  /**
   * Show test details
   * @param {string} moduleId Module ID
   * @param {string} testId Test ID
   */
  showTestDetails(moduleId, testId) {
    // Find the test in the results
    if (!this.currentResults || 
        !this.currentResults.modules || 
        !this.currentResults.modules[moduleId] ||
        !this.currentResults.modules[moduleId].tests ||
        !this.currentResults.modules[moduleId].tests[testId]) {
      this.elements.detailsContent.innerHTML = '<p>No results available for this test</p>';
      this.toggleTestDetails(true);
      return;
    }
    
    // Get test details
    const test = this.currentResults.modules[moduleId].tests[testId];
    const module = this.testSuite.testModules[moduleId];
    const testConfig = module.tests.find(t => t.id === testId);
    
    if (!test || !testConfig) {
      this.elements.detailsContent.innerHTML = '<p>Test configuration not found</p>';
      this.toggleTestDetails(true);
      return;
    }
    
    // Format the details
    let statusClass = '';
    let statusIcon = '';
    
    switch (test.status) {
      case 'passed':
        statusClass = 'success';
        statusIcon = 'check-circle';
        break;
      case 'failed':
        statusClass = 'error';
        statusIcon = 'times-circle';
        break;
      case 'skipped':
        statusClass = 'warning';
        statusIcon = 'exclamation-circle';
        break;
      case 'error':
        statusClass = 'error';
        statusIcon = 'exclamation-triangle';
        break;
      default:
        statusClass = '';
        statusIcon = 'circle';
        break;
    }
    
    this.elements.detailsContent.innerHTML = `
      <div class="details-header">
        <h3>${testConfig.name}</h3>
        <span class="test-status ${statusClass}">
          <i class="fas fa-${statusIcon}"></i> ${test.status}
        </span>
      </div>
      
      <div class="details-section">
        <div class="details-row">
          <span class="details-label">Module:</span>
          <span class="details-value">${module.name}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Test ID:</span>
          <span class="details-value">${testId}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Duration:</span>
          <span class="details-value">${test.duration || 'N/A'}ms</span>
        </div>
      </div>
      
      ${test.error ? `
        <div class="details-section">
          <h4>Error</h4>
          <div class="error-message">${test.error}</div>
          ${test.errorStack ? `
            <h5>Stack Trace</h5>
            <pre class="error-stack">${test.errorStack}</pre>
          ` : ''}
        </div>
      ` : ''}
      
      ${test.message ? `
        <div class="details-section">
          <h4>Message</h4>
          <div class="test-message">${test.message}</div>
        </div>
      ` : ''}
      
      <div class="details-section">
        <h4>Test Definition</h4>
        <pre class="test-code">${JSON.stringify(testConfig, null, 2)}</pre>
      </div>
    `;
    
    this.toggleTestDetails(true);
  }
  
  /**
   * Toggle test details panel
   * @param {boolean} show Whether to show or hide the panel
   */
  toggleTestDetails(show) {
    this.elements.testDetails.style.display = show ? 'block' : 'none';
  }
  
  /**
   * Update module UI with test results
   * @param {string} moduleId Module ID
   * @param {string} status Status of the module
   * @param {Object} results Test results
   */
  updateModuleUI(moduleId, status, results = null) {
    const moduleCard = this.elements.moduleCards[moduleId];
    if (!moduleCard) return;
    
    // Update module status
    const statusElement = moduleCard.status;
    statusElement.className = `module-status ${status}`;
    
    // Update status icon and text
    const statusText = this.getStatusText(status);
    statusElement.innerHTML = `<i class="fas fa-${this.getStatusIcon(status)}"></i> ${statusText}`;
    
    // If we have results, update test items
    if (results) {
      Object.entries(results.tests || {}).forEach(([testId, testResult]) => {
        this.updateTestUI(moduleId, testResult.name, testResult.status, testResult);
      });
    }
  }
  
  /**
   * Update test UI with results
   * @param {string} moduleId Module ID
   * @param {string} testName Test name
   * @param {string} status Status of the test
   * @param {Object} details Additional details
   */
  updateTestUI(moduleId, testName, status, details = null) {
    const moduleCard = this.elements.moduleCards[moduleId];
    if (!moduleCard) return;
    
    // Find the test element by name
    let testElement = null;
    
    // Look through all test elements in this module to find the matching test
    Object.values(moduleCard.tests).forEach(test => {
      if (test.element.querySelector('.test-name').textContent.trim().includes(testName)) {
        testElement = test;
      }
    });
    
    if (!testElement) return;
    
    // Update test status
    const statusElement = testElement.status;
    statusElement.className = `test-status ${status}`;
    
    // Update status icon and text
    const statusText = this.getStatusText(status);
    statusElement.innerHTML = `<i class="fas fa-${this.getStatusIcon(status)}"></i> ${statusText}`;
    
    // Add duration if available
    if (details && details.duration) {
      statusElement.innerHTML += ` (${details.duration}ms)`;
    }
  }
  
  /**
   * Reset test UI
   */
  resetTestUI() {
    // Reset all module cards
    Object.keys(this.elements.moduleCards).forEach(moduleId => {
      this.resetModuleUI(moduleId);
    });
    
    // Reset summary
    this.updateSummaryStatus('pending', 'Not Run');
    this.elements.summary.total.textContent = '0';
    this.elements.summary.passed.textContent = '0';
    this.elements.summary.failed.textContent = '0';
    this.elements.summary.skipped.textContent = '0';
    this.elements.summary.duration.textContent = '0ms';
    
    // Hide test details
    this.toggleTestDetails(false);
  }
  
  /**
   * Reset module UI
   * @param {string} moduleId Module ID
   */
  resetModuleUI(moduleId) {
    const moduleCard = this.elements.moduleCards[moduleId];
    if (!moduleCard) return;
    
    // Reset module status
    moduleCard.status.className = 'module-status pending';
    moduleCard.status.innerHTML = '<i class="fas fa-circle"></i> Not Run';
    
    // Reset all test statuses
    Object.values(moduleCard.tests).forEach(test => {
      test.status.className = 'test-status pending';
      test.status.innerHTML = '<i class="fas fa-circle"></i> Not Run';
    });
  }
  
  /**
   * Update summary with test results
   * @param {Object} results Test results
   */
  updateSummary(results) {
    if (!results) return;
    
    this.elements.summary.total.textContent = results.totalTests || 0;
    this.elements.summary.passed.textContent = results.passedTests || 0;
    this.elements.summary.failed.textContent = results.failedTests || 0;
    this.elements.summary.skipped.textContent = results.skippedTests || 0;
    this.elements.summary.duration.textContent = `${results.duration || 0}ms`;
    
    // Update status
    const status = results.success ? 'passed' : (results.error ? 'error' : 'failed');
    this.updateSummaryStatus(status);
    
    // Enable export button
    this.element.querySelector('#btn-export-results').disabled = false;
  }
  
  /**
   * Update summary status
   * @param {string} status Status of the test suite
   * @param {string} message Optional status message
   */
  updateSummaryStatus(status, message = null) {
    const statusElement = this.elements.summary.status;
    statusElement.className = `summary-value ${status}`;
    
    // Use message if provided, otherwise get status text
    const statusText = message || this.getStatusText(status);
    statusElement.innerHTML = `<i class="fas fa-${this.getStatusIcon(status)}"></i> ${statusText}`;
  }
  
  /**
   * Handle test completion
   * @param {Object} results Test results
   */
  testComplete(results) {
    this.isRunning = false;
    this.currentResults = results;
    
    // Add to history
    this.testHistory.unshift(results);
    
    // Update summary
    this.updateSummary(results);
    
    // Show notification
    if (results.success) {
      this.notifications.success('All security tests passed successfully');
    } else {
      this.notifications.error(`Security tests failed: ${results.failedTests} of ${results.totalTests} tests failed`);
    }
    
    // Enable export button
    this.element.querySelector('#btn-export-results').disabled = false;
    
    // Emit event
    this.emit('tests-complete', results);
  }
  
  /**
   * Handle test error
   * @param {Error} error Error object
   * @param {Object} results Partial results if available
   */
  testError(error, results = null) {
    this.isRunning = false;
    
    // Update summary status
    this.updateSummaryStatus('error', 'Test Error');
    
    // Show notification
    this.notifications.error(`Security test error: ${error.message}`);
    
    // If we have partial results, update UI
    if (results) {
      this.currentResults = results;
      this.testHistory.unshift(results);
      this.updateSummary(results);
    }
    
    // Emit event
    this.emit('tests-error', { error, results });
  }
  
  /**
   * Get status icon for a given status
   * @param {string} status Status string
   * @returns {string} Font Awesome icon name
   */
  getStatusIcon(status) {
    switch (status) {
      case 'passed':
        return 'check-circle';
      case 'failed':
        return 'times-circle';
      case 'error':
        return 'exclamation-triangle';
      case 'skipped':
        return 'exclamation-circle';
      case 'running':
        return 'spinner fa-spin';
      default:
        return 'circle';
    }
  }
  
  /**
   * Get status text for a given status
   * @param {string} status Status string
   * @returns {string} Status text
   */
  getStatusText(status) {
    switch (status) {
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      case 'error':
        return 'Error';
      case 'skipped':
        return 'Skipped';
      case 'running':
        return 'Running...';
      default:
        return 'Not Run';
    }
  }
}