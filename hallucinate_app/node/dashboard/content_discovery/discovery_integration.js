/**
 * Database Visualization for Content Discovery - Integration Module
 * 
 * This module integrates the database visualization component into the
 * PyArrow Content Index Dashboard.
 */

const { createDiscoveryPanel, refreshVisualization, showContentDetails } = require('./discovery_visualization.js');

/**
 * Integrates database visualization functionality into the dashboard
 * 
 * @param {Object} dashboard - The dashboard instance to integrate with
 * @param {Object} options - Configuration options
 * @returns {boolean} - Whether the integration was successful
 */
function integrateDiscoveryVisualization(dashboard, options = {}) {
  if (!dashboard) {
    console.error('Dashboard instance is required for integration');
    return false;
  }

  try {
    // Configure chart.js with treemap plugin if needed
    if (window.Chart) {
      const isTreemapRegistered = window.Chart.registry.controllers.get('treemap');
      if (!isTreemapRegistered) {
        console.info('Registering Chart.js treemap plugin');
        // If using the plugin, register it here
        // This would typically be: window.Chart.register(ChartTreemap);
      }
    }

    // Add discovery tab to the dashboard
    addDiscoveryTab(dashboard, options);

    console.info('Database visualization integration successful');
    return true;
  } catch (error) {
    console.error('Failed to integrate database visualization:', error);
    return false;
  }
}

/**
 * Add a discovery tab to the dashboard
 * 
 * @param {Object} dashboard - The dashboard instance
 * @param {Object} options - Configuration options
 */
function addDiscoveryTab(dashboard, options) {
  // Check if dashboard has a tabs container
  const tabsContainer = dashboard.element.querySelector('.dashboard-tabs');
  if (!tabsContainer) {
    console.error('Dashboard tabs container not found');
    return;
  }

  // Check if dashboard has a tab content container
  const tabContentContainer = dashboard.element.querySelector('.tab-content');
  if (!tabContentContainer) {
    console.error('Dashboard tab content container not found');
    return;
  }

  // Create the discovery tab
  const discoveryTab = document.createElement('li');
  discoveryTab.className = 'tab-item';
  discoveryTab.dataset.tab = 'discovery';
  discoveryTab.innerHTML = `
    <a href="#discovery">
      <i class="fas fa-chart-network"></i>
      <span>Discovery</span>
    </a>
  `;
  tabsContainer.appendChild(discoveryTab);

  // Create the discovery tab content
  const discoveryContent = document.createElement('div');
  discoveryContent.className = 'tab-pane';
  discoveryContent.id = 'discovery';
  discoveryContent.style.display = 'none'; // Hidden by default

  // Create discovery panel
  const discoveryPanel = createDiscoveryPanel();
  discoveryContent.appendChild(discoveryPanel);

  tabContentContainer.appendChild(discoveryContent);

  // Add tab click handler
  discoveryTab.addEventListener('click', (e) => {
    e.preventDefault();

    // Update active tab
    const tabItems = tabsContainer.querySelectorAll('.tab-item');
    tabItems.forEach(item => item.classList.remove('active'));
    discoveryTab.classList.add('active');

    // Update visible tab content
    const tabPanes = tabContentContainer.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => pane.style.display = 'none');
    discoveryContent.style.display = 'block';

    // Initialize visualization if not already done
    refreshVisualization();
  });

  // Enhance the dashboard with content details method
  dashboard._showContentDetailsInDiscovery = function(content) {
    // First switch to the discovery tab
    const tabEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    discoveryTab.dispatchEvent(tabEvent);

    // Then show the content details
    showContentDetails(content);
  };

  // Enhance the content details view to include visualization link
  const originalShowContentDetails = dashboard._showContentDetails;
  if (originalShowContentDetails) {
    dashboard._showContentDetails = function(content) {
      // Call the original method
      originalShowContentDetails.call(this, content);

      // Add discovery visualization link
      setTimeout(() => {
        const detailActions = document.querySelector('.detail-actions');
        if (detailActions) {
          // Check if visualization button already exists
          if (!detailActions.querySelector('.visualize-btn')) {
            const visualizeButton = document.createElement('button');
            visualizeButton.className = 'visualize-btn';
            visualizeButton.innerHTML = '<i class="fas fa-chart-pie"></i> Visualize';
            visualizeButton.addEventListener('click', () => {
              this._showContentDetailsInDiscovery(content);
            });
            detailActions.appendChild(visualizeButton);
          }
        }
      }, 100);
    };
  }
}

/**
 * Creates a loader script that can be injected into the dashboard HTML
 * to automatically integrate the database visualization
 * 
 * @param {Object} options - Configuration options
 * @returns {string} - The loader script as a string
 */
function createDiscoveryIntegrationLoader(options = {}) {
  return `
    // Auto-integration script for database visualization
    (function() {
      try {
        // Wait for dashboard to be initialized
        const checkInterval = setInterval(() => {
          const dashboardInstance = window.contentIndexDashboard;
          if (dashboardInstance && dashboardInstance.element) {
            clearInterval(checkInterval);
            
            // Ensure Chart.js is available
            if (!window.Chart) {
              console.warn('Chart.js not found, loading from CDN...');
              const chartScript = document.createElement('script');
              chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
              chartScript.onload = () => {
                // Load treemap plugin
                const treemapScript = document.createElement('script');
                treemapScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@2.3.0/dist/chartjs-chart-treemap.min.js';
                treemapScript.onload = () => {
                  console.info('Chart.js and plugins loaded, integrating visualization...');
                  
                  // Load the integration module
                  const discoveryIntegration = require('./content_discovery/discovery_integration.js');
                  
                  // Integrate the discovery visualization
                  discoveryIntegration.integrateDiscoveryVisualization(dashboardInstance, ${JSON.stringify(options)});
                };
                document.head.appendChild(treemapScript);
              };
              document.head.appendChild(chartScript);
            } else {
              // Chart.js is already available
              const discoveryIntegration = require('./content_discovery/discovery_integration.js');
              discoveryIntegration.integrateDiscoveryVisualization(dashboardInstance, ${JSON.stringify(options)});
            }
            
            console.info('Database visualization loader initialized');
          }
        }, 500);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
      } catch (error) {
        console.error('Failed to auto-integrate database visualization:', error);
      }
    })();
  `;
}

/**
 * Initialize the integration manually
 * 
 * @param {string} dashboardSelector - CSS selector for the dashboard element
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Whether the integration was successful
 */
async function initializeDiscoveryIntegration(dashboardSelector = '.pyarrow-content-index-dashboard', options = {}) {
  return new Promise((resolve) => {
    try {
      // Wait for the dashboard to be available in the DOM
      const checkInterval = setInterval(() => {
        const dashboardElement = document.querySelector(dashboardSelector);
        if (dashboardElement && window.contentIndexDashboard) {
          clearInterval(checkInterval);
          
          // Ensure Chart.js is available
          if (!window.Chart) {
            console.warn('Chart.js not found, integration may fail');
          }
          
          // Integrate with the dashboard instance
          const result = integrateDiscoveryVisualization(window.contentIndexDashboard, options);
          resolve(result);
        }
      }, 500);
      
      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 10000);
    } catch (error) {
      console.error('Database visualization integration initialization failed:', error);
      resolve(false);
    }
  });
}

// Export the module functions
module.exports = {
  integrateDiscoveryVisualization,
  createDiscoveryIntegrationLoader,
  initializeDiscoveryIntegration
};