/**
 * Storage Visualization Integration Module
 * 
 * This module provides integration code for incorporating the enhanced storage visualization
 * into the PyArrow Content Index Dashboard. It patches the dashboard's _renderStorageLocationChart
 * method to include both basic and enhanced visualization views with toggle functionality.
 */

/**
 * Integrates enhanced storage visualization into the dashboard
 * 
 * @param {Object} dashboard - The dashboard instance to integrate with
 * @returns {boolean} - Whether the integration was successful
 */
function integrateEnhancedStorageVisualization(dashboard) {
  if (!dashboard) {
    console.error('Dashboard instance is required for integration');
    return false;
  }

  try {
    // Store reference to the original method
    const originalRenderMethod = dashboard._renderStorageLocationChart;

    if (!originalRenderMethod) {
      console.error('Dashboard does not have _renderStorageLocationChart method');
      return false;
    }

    // Import the enhanced storage visualization components
    let storageViz;
    try {
      storageViz = require('./enhanced_storage/storage_visualization.js');
    } catch (error) {
      console.error('Failed to load enhanced storage visualization components:', error);
      return false;
    }

    // Create a new enhanced implementation
    dashboard._renderStorageLocationChart = function() {
      const container = document.createElement('div');
      container.className = 'chart-container storage-container';
      
      // Add title with view toggle
      const titleSection = document.createElement('div');
      titleSection.className = 'chart-title-section';
      
      const heading = document.createElement('h3');
      heading.textContent = 'Storage Location Distribution';
      titleSection.appendChild(heading);
      
      // Add view toggle
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'chart-view-toggle';
      toggleContainer.innerHTML = `
        <button class="view-toggle-btn active" data-view="simple">Basic View</button>
        <button class="view-toggle-btn" data-view="enhanced">Enhanced View</button>
      `;
      titleSection.appendChild(toggleContainer);
      container.appendChild(titleSection);
      
      // Create simple view container (default view)
      const simpleView = document.createElement('div');
      simpleView.className = 'chart-view simple-view';
      simpleView.style.display = 'block';
      
      // Create enhanced view container (hidden by default)
      const enhancedView = document.createElement('div');
      enhancedView.className = 'chart-view enhanced-view';
      enhancedView.style.display = 'none';
      
      if (!this.storageDistribution || this.storageDistribution.length === 0) {
        const message = document.createElement('p');
        message.className = 'no-data';
        message.textContent = 'No storage location data available';
        simpleView.appendChild(message);
        enhancedView.appendChild(message.cloneNode(true));
        container.appendChild(simpleView);
        container.appendChild(enhancedView);
        return container;
      }
      
      // Create simple view content (using logic similar to original implementation)
      const chartContainer = document.createElement('div');
      chartContainer.className = 'chart-container';
      
      // Create bar chart for storage locations in simple view
      const chartCanvas = document.createElement('canvas');
      chartCanvas.id = 'storage-location-chart';
      chartCanvas.width = 400;
      chartCanvas.height = 200;
      chartContainer.appendChild(chartCanvas);
      
      // Add table with details for simple view
      const detailsTable = document.createElement('table');
      detailsTable.className = 'chart-details-table';
      
      // Table header
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Storage Location</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
      `;
      detailsTable.appendChild(thead);
      
      // Table body
      const tbody = document.createElement('tbody');
      
      // Calculate total for percentages
      const total = this.storageDistribution.reduce((sum, item) => sum + item.count, 0);
      
      this.storageDistribution.forEach(item => {
        const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${item.location}</td>
          <td>${item.count.toLocaleString()}</td>
          <td>${percentage}%</td>
        `;
        tbody.appendChild(row);
      });
      
      detailsTable.appendChild(tbody);
      chartContainer.appendChild(detailsTable);
      
      // Add the chart container to the simple view
      simpleView.appendChild(chartContainer);
      
      // Add the enhanced view content
      try {
        // Use the enhanced visualization components to render the enhanced view
        const enhancedContent = storageViz.renderEnhancedStorageView();
        enhancedView.appendChild(enhancedContent);
        
        // Pass the storage distribution data to the enhanced view
        // This ensures the visualization has access to the dashboard's data
        this.enhancedStorageView = {
          storageDistribution: this.storageDistribution,
          render: () => {
            try {
              const boundRenderCharts = storageViz.renderEnhancedStorageCharts.bind(this);
              boundRenderCharts();
            } catch (error) {
              console.error('Failed to render enhanced storage charts:', error);
            }
          }
        };
      } catch (error) {
        console.error('Failed to render enhanced storage view:', error);
        const errorMessage = document.createElement('p');
        errorMessage.className = 'error-text';
        errorMessage.textContent = 'Failed to load enhanced visualization components';
        enhancedView.appendChild(errorMessage);
      }
      
      // Add both views to the container
      container.appendChild(simpleView);
      container.appendChild(enhancedView);
      
      // Set up view toggle functionality
      const toggleButtons = toggleContainer.querySelectorAll('.view-toggle-btn');
      toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
          // Update active button
          toggleButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          
          // Show the selected view
          const viewType = button.getAttribute('data-view');
          if (viewType === 'simple') {
            simpleView.style.display = 'block';
            enhancedView.style.display = 'none';
          } else {
            simpleView.style.display = 'none';
            enhancedView.style.display = 'block';
            
            // Render enhanced charts when switching to enhanced view
            // Use the stored render function if available, otherwise fall back to binding
            if (this.enhancedStorageView && typeof this.enhancedStorageView.render === 'function') {
              // Render charts after a short delay to ensure DOM is ready
              setTimeout(() => {
                try {
                  this.enhancedStorageView.render();
                } catch (error) {
                  console.error('Failed to render enhanced charts:', error);
                }
              }, 10);
            } else {
              // Fallback to direct binding
              const boundRenderCharts = storageViz.renderEnhancedStorageCharts.bind(this);
              setTimeout(() => {
                try {
                  boundRenderCharts();
                } catch (error) {
                  console.error('Failed to render enhanced charts:', error);
                }
              }, 10);
            }
          }
        });
      });
      
      // Render the simple view chart if Chart.js is available
      setTimeout(() => {
        if (window.Chart) {
          const ctx = chartCanvas.getContext('2d');
          
          this.storageLocationChartInstance = new window.Chart(ctx, {
            type: 'horizontalBar',
            data: {
              labels: this.storageDistribution.map(item => item.location),
              datasets: [{
                label: 'Content Count',
                data: this.storageDistribution.map(item => item.count),
                backgroundColor: '#FFCE56'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                xAxes: [{
                  ticks: {
                    beginAtZero: true
                  }
                }]
              },
              title: {
                display: true,
                text: 'Storage Location Distribution'
              }
            }
          });
        }
      }, 0);
      
      return container;
    };

    // Patch the dashboard's refresh method to update enhanced visualizations
    const originalRefreshMethod = dashboard.refresh || dashboard._refreshData;
    
    if (typeof originalRefreshMethod === 'function') {
      // Store the original refresh method and create a new one that also updates our visualizations
      dashboard._originalRefreshMethod = originalRefreshMethod;
      
      dashboard.refresh = async function(...args) {
        // Call the original refresh method
        const result = await this._originalRefreshMethod.apply(this, args);
        
        // Update enhanced storage visualization if available
        if (this.enhancedStorageView) {
          this.enhancedStorageView.storageDistribution = this.storageDistribution;
          
          // If the enhanced view is currently visible, rerender it
          const enhancedView = document.querySelector('.enhanced-view');
          if (enhancedView && enhancedView.style.display === 'block') {
            this.enhancedStorageView.render();
          }
        }
        
        return result;
      };
    }
    
    console.info('Enhanced storage visualization successfully integrated');
    return true;
  } catch (error) {
    console.error('Failed to integrate enhanced storage visualization:', error);
    return false;
  }
}

/**
 * Creates a loader script that can be injected into the dashboard HTML
 * to automatically integrate the enhanced storage visualization
 * 
 * @returns {string} - The loader script as a string
 */
function createIntegrationLoader() {
  return `
    // Auto-integration script for enhanced storage visualization
    (function() {
      try {
        // Wait for dashboard to be initialized
        const checkInterval = setInterval(() => {
          const dashboardInstance = window.contentIndexDashboard;
          if (dashboardInstance && typeof dashboardInstance._renderStorageLocationChart === 'function') {
            clearInterval(checkInterval);
            
            // Load the integration module
            const storageIntegration = require('./storage_integration.js');
            
            // Integrate the enhanced visualization
            storageIntegration.integrateEnhancedStorageVisualization(dashboardInstance);
            
            console.info('Enhanced storage visualization loaded');
          }
        }, 500);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
      } catch (error) {
        console.error('Failed to auto-integrate enhanced storage visualization:', error);
      }
    })();
  `;
}

/**
 * Initialize the integration manually
 * 
 * @param {string} dashboardSelector - CSS selector for the dashboard element
 * @returns {Promise<boolean>} - Whether the integration was successful
 */
async function initializeIntegration(dashboardSelector = '.pyarrow-content-index-dashboard') {
  return new Promise((resolve) => {
    try {
      // Wait for the dashboard to be available in the DOM
      const checkInterval = setInterval(() => {
        const dashboardElement = document.querySelector(dashboardSelector);
        if (dashboardElement && window.contentIndexDashboard) {
          clearInterval(checkInterval);
          
          // Integrate with the dashboard instance
          const result = integrateEnhancedStorageVisualization(window.contentIndexDashboard);
          resolve(result);
        }
      }, 500);
      
      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 10000);
    } catch (error) {
      console.error('Integration initialization failed:', error);
      resolve(false);
    }
  });
}

module.exports = {
  integrateEnhancedStorageVisualization,
  createIntegrationLoader,
  initializeIntegration
};