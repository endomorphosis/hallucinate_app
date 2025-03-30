/**
 * Dashboard Main Module
 * 
 * Provides a comprehensive testing dashboard for all modules
 * Integrates various dashboard components for monitoring and testing
 * Follows the architecture described in CLAUDE.md
 */

import AuthDashboard from './auth_dashboard.js';
import ModelManagerDashboard from './model_manager_dashboard.js';

class Dashboard {
  /**
   * Create a new Dashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.element Container element for the dashboard
   * @param {Object} options.config Dashboard configuration
   * @param {Object} options.testHandler Test handler instance
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.config = options.config || {
      refreshInterval: 5000,
      theme: 'system',
      defaultView: 'modules'
    };
    this.testHandler = options.testHandler;
    
    this.panels = [];
    this.initialized = false;
    this.eventBus = this.createEventBus();
  }
  
  /**
   * Create an event bus for dashboard components
   * @returns {Object} Event bus object
   */
  createEventBus() {
    const events = {};
    
    return {
      on(event, callback) {
        if (!events[event]) {
          events[event] = [];
        }
        events[event].push(callback);
      },
      
      off(event, callback) {
        if (!events[event]) return;
        events[event] = events[event].filter(cb => cb !== callback);
      },
      
      emit(event, data) {
        if (!events[event]) return;
        events[event].forEach(callback => callback(data));
      }
    };
  }
  
  /**
   * Initialize the dashboard
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Initialize components
      for (const panel of this.panels) {
        if (panel.init && typeof panel.init === 'function') {
          await panel.init();
        }
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      return false;
    }
  }
  
  /**
   * Add a panel to the dashboard
   * @param {Object} panel Panel component to add
   */
  addPanel(panel) {
    this.panels.push(panel);
  }
  
  /**
   * Add predefined panels
   */
  addDefaultPanels() {
    // Create auth dashboard panel
    const authContainer = document.createElement('div');
    authContainer.id = 'auth-dashboard-container';
    
    const authDashboard = new AuthDashboard({
      element: authContainer,
      eventBus: this.eventBus
    });
    
    this.addPanel({
      id: 'auth',
      title: 'Authentication & Security',
      component: authDashboard,
      element: authContainer,
      icon: 'shield-alt'
    });
    
    // Create model manager dashboard panel
    const modelManagerContainer = document.createElement('div');
    modelManagerContainer.id = 'model-manager-dashboard-container';
    
    const modelManagerDashboard = new ModelManagerDashboard({
      element: modelManagerContainer,
      eventBus: this.eventBus
    });
    
    this.addPanel({
      id: 'model-manager',
      title: 'Model Manager',
      component: modelManagerDashboard,
      element: modelManagerContainer,
      icon: 'cubes'
    });
    
    // Add more dashboard panels here as they are implemented
  }
  
  /**
   * Render the dashboard
   */
  async render() {
    if (!this.element) {
      console.error('No container element provided for dashboard');
      return;
    }
    
    // Add default panels if none defined
    if (this.panels.length === 0) {
      this.addDefaultPanels();
    }
    
    // Create main layout
    this.element.innerHTML = `
      <div class="dashboard">
        <div class="dashboard-sidebar">
          <div class="sidebar-header">
            <h2><i class="fas fa-tachometer-alt"></i> Dashboard</h2>
          </div>
          <div class="sidebar-menu">
            ${this.panels.map(panel => `
              <button class="sidebar-item" data-panel="${panel.id || panel.title}">
                <i class="fas fa-${panel.icon || 'cube'}"></i>
                <span>${panel.title}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="dashboard-content">
          ${this.panels.map(panel => `
            <div class="panel-container" id="${panel.id || panel.title}-panel" style="display: none;">
              ${panel.element ? '' : `<h2>${panel.title}</h2>`}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    // Initialize components if not already initialized
    if (!this.initialized) {
      await this.init();
    }
    
    // Add event listeners for sidebar navigation
    const sidebarItems = this.element.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
      item.addEventListener('click', () => {
        // Remove active class from all items
        sidebarItems.forEach(i => i.classList.remove('active'));
        
        // Add active class to clicked item
        item.classList.add('active');
        
        // Hide all panels
        const panels = this.element.querySelectorAll('.panel-container');
        panels.forEach(p => p.style.display = 'none');
        
        // Show selected panel
        const panelId = item.getAttribute('data-panel');
        document.getElementById(`${panelId}-panel`).style.display = 'block';
        
        // Emit panel change event
        this.eventBus.emit('panel-change', panelId);
      });
    });
    
    // Render panels with custom elements
    for (const panel of this.panels) {
      if (panel.element) {
        const container = document.getElementById(`${panel.id || panel.title}-panel`);
        container.appendChild(panel.element);
        
        // Render panel component if it has a render method
        if (panel.component && typeof panel.component.render === 'function') {
          await panel.component.render();
        }
      }
    }
    
    // Activate first panel by default
    if (sidebarItems.length > 0) {
      sidebarItems[0].click();
    }
  }
  
  /**
   * Update module status in the dashboard
   * @param {string} moduleId Module identifier
   * @param {boolean} success Whether the module is working correctly
   */
  updateModuleStatus(moduleId, success) {
    // Emit module status event
    this.eventBus.emit('module-status', { moduleId, success });
  }
  
  /**
   * Log a test result
   * @param {Object} result Test result to log
   */
  logTestResult(result) {
    // Emit test result event
    this.eventBus.emit('test-result', result);
  }
  
  /**
   * Create a test button for a module
   * @param {string} moduleId Module identifier
   * @param {Function} callback Function to call when button is clicked
   * @returns {HTMLElement} Created button element
   */
  createTestButton(moduleId, callback) {
    const button = document.createElement('button');
    button.className = 'test-button';
    button.innerHTML = `<i class="fas fa-vial"></i> Test ${moduleId}`;
    
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Testing...`;
      
      try {
        const result = await callback();
        this.logTestResult(result);
      } catch (error) {
        console.error(`Failed to test ${moduleId}:`, error);
        this.logTestResult({
          module: moduleId,
          success: false,
          error: error.message
        });
      }
      
      button.disabled = false;
      button.innerHTML = `<i class="fas fa-vial"></i> Test ${moduleId}`;
    });
    
    return button;
  }
  
  /**
   * Set up database panels
   * @param {Array<string>} databases Array of database types to display
   */
  setupDatabasePanels(databases) {
    // Event handlers for database panels will be implemented here
    // This is a placeholder for future implementation
  }
  
  /**
   * Render module dependencies visualization
   * @param {Object} modules Module dependencies object
   */
  renderModuleDependencies(modules) {
    // Dependency visualization will be implemented here
    // This is a placeholder for future implementation
  }
}

export default Dashboard;