/**
 * Visualization Components for PyArrow Content Index Dashboard
 * 
 * This module provides interactive chart components for visualizing
 * statistics and metrics about the PyArrow Content Index.
 * 
 * @module dashboard/content_browser/visualization_components
 */

/**
 * Class that manages chart visualizations for PyArrow Content Index data
 */
export class VisualizationManager {
  /**
   * Create a visualization manager
   * @param {Object} options Configuration options
   * @param {Object} options.bridge PyArrow index bridge for data access
   * @param {Object} options.eventBus Event bus for communication
   * @param {Object} options.chartLibrary Chart library (e.g., Chart.js)
   * @param {Object} options.config Optional configuration
   */
  constructor(options = {}) {
    this.bridge = options.bridge;
    this.eventBus = options.eventBus;
    this.chartLibrary = options.chartLibrary || window.Chart;
    this.config = options.config || {};
    
    // Chart instances
    this.charts = {
      operations: null,
      fileType: null,
      sizeByType: null,
      locationDistribution: null,
      sizeDistribution: null,
      contentTimeline: null
    };
    
    // Chart data
    this.data = {
      operations: [],
      fileTypes: [],
      sizeByType: [],
      locationDistribution: [],
      sizeDistribution: {
        labels: [],
        counts: []
      },
      contentTimeline: {
        labels: [],
        counts: []
      },
      performanceMetrics: []
    };
    
    // Chart colors
    this.colors = [
      '#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565',
      '#38b2ac', '#ecc94b', '#667eea', '#f687b3', '#68d391'
    ];
    
    // Bind methods
    this._bindEvents();
  }
  
  /**
   * Initialize the visualization manager
   * @returns {Promise<boolean>} Success indicator
   */
  async init() {
    try {
      // Ensure Chart.js is available
      if (!this.chartLibrary) {
        console.warn('Chart library not available. Charts will not be rendered.');
        return false;
      }
      
      // Load initial data
      await this.loadData();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize visualization manager:', error);
      return false;
    }
  }
  
  /**
   * Load data from the PyArrow index bridge
   * @returns {Promise<void>}
   */
  async loadData() {
    try {
      if (!this.bridge) {
        console.warn('PyArrow index bridge not available. Using mock data.');
        this._loadMockData();
        return;
      }
      
      // Get statistics from the bridge
      const stats = await this.bridge.getStats();
      
      if (!stats) {
        console.warn('No statistics data available. Using mock data.');
        this._loadMockData();
        return;
      }
      
      // Process the data for visualizations
      this._processData(stats);
      
      // Emit event if event bus is available
      if (this.eventBus) {
        this.eventBus.emit('visualization-data-loaded', {
          success: true,
          data: this.data
        });
      }
    } catch (error) {
      console.error('Failed to load visualization data:', error);
      
      // Load mock data as fallback
      this._loadMockData();
      
      // Emit error event if event bus is available
      if (this.eventBus) {
        this.eventBus.emit('visualization-data-error', {
          error: error.message
        });
      }
    }
  }
  
  /**
   * Render all charts in their respective containers
   */
  renderCharts() {
    this.renderOperationsChart('operations-chart');
    this.renderFileTypeChart('file-type-chart');
    this.renderSizeByTypeChart('size-by-type-chart');
    this.renderLocationDistributionChart('location-distribution-chart');
    this.renderSizeDistributionChart('size-distribution-chart');
    this.renderContentTimelineChart('content-timeline-chart');
    this.renderPerformanceMetricsTable('performance-metrics-table');
  }
  
  /**
   * Render the operations chart
   * @param {string} containerId ID of the container element
   */
  renderOperationsChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found for operations chart.`);
      return;
    }
    
    // Clear any loading indicators
    container.innerHTML = '';
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    
    // Destroy existing chart if it exists
    if (this.charts.operations) {
      this.charts.operations.destroy();
      this.charts.operations = null;
    }
    
    // Prepare data
    const labels = this.data.operations.map(op => op.operation);
    const values = this.data.operations.map(op => op.count);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.operations = new this.chartLibrary(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Operation Count',
          data: values,
          backgroundColor: this._generateColors(labels.length),
          borderColor: 'rgba(255, 255, 255, 0.5)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (context) => {
                return \`Count: \${context.raw}\`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }
  
  /**
   * Render the file type distribution chart
   * @param {string} containerId ID of the container element
   */
  renderFileTypeChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found for file type chart.`);
      return;
    }
    
    // Clear any loading indicators
    container.innerHTML = '';
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    
    // Destroy existing chart if it exists
    if (this.charts.fileType) {
      this.charts.fileType.destroy();
      this.charts.fileType = null;
    }
    
    // Prepare data
    const labels = this.data.fileTypes.map(type => type.type);
    const values = this.data.fileTypes.map(type => type.count);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.fileType = new this.chartLibrary(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: this._generateColors(labels.length),
          borderColor: 'rgba(255, 255, 255, 0.8)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              padding: 10
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return \`\${label}: \${value} (\${percentage}%)\`;
              }
            }
          }
        }
      }
    });
  }
  
  /**
   * Render the size by content type chart
   * @param {string} containerId ID of the container element
   */
  renderSizeByTypeChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found for size by type chart.`);
      return;
    }
    
    // Clear any loading indicators
    container.innerHTML = '';
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    
    // Destroy existing chart if it exists
    if (this.charts.sizeByType) {
      this.charts.sizeByType.destroy();
      this.charts.sizeByType = null;
    }
    
    // Prepare data
    const labels = this.data.sizeByType.map(item => item.type);
    const values = this.data.sizeByType.map(item => item.size);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.sizeByType = new this.chartLibrary(ctx, {
      type: 'horizontalBar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Size (MB)',
          data: values,
          backgroundColor: this._generateColors(labels.length),
          borderColor: 'rgba(255, 255, 255, 0.5)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw || 0;
                // Format size as human-readable
                if (value >= 1000000) {
                  return \`Size: \${(value / 1000000).toFixed(2)} GB\`;
                } else if (value >= 1000) {
                  return \`Size: \${(value / 1000).toFixed(2)} MB\`;
                } else {
                  return \`Size: \${value.toFixed(2)} KB\`;
                }
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (value) => {
                // Format size as human-readable
                if (value >= 1000000) {
                  return \`\${(value / 1000000).toFixed(1)} GB\`;
                } else if (value >= 1000) {
                  return \`\${(value / 1000).toFixed(1)} MB\`;
                } else {
                  return \`\${value.toFixed(1)} KB\`;
                }
              }
            }
          }
        }
      }
    });
  }
  
  /**
   * Render the performance metrics table
   * @param {string} tableId ID of the table element
   */
  renderPerformanceMetricsTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) {
      console.warn(`Table ${tableId} not found for performance metrics.`);
      return;
    }
    
    // Clear existing table content
    table.innerHTML = '';
    
    // Check if data is available
    if (!this.data.performanceMetrics || this.data.performanceMetrics.length === 0) {
      table.innerHTML = '<tr><td colspan="6" class="text-center">No performance metrics available</td></tr>';
      return;
    }
    
    // Render table rows
    this.data.performanceMetrics.forEach(metric => {
      const row = document.createElement('tr');
      
      // Format date
      const lastExecuted = metric.lastExecuted 
        ? new Date(metric.lastExecuted).toLocaleString() 
        : 'Never';
      
      row.innerHTML = \`
        <td>\${metric.operation}</td>
        <td>\${metric.count.toLocaleString()}</td>
        <td>\${metric.avgDuration.toFixed(2)}</td>
        <td>\${metric.minDuration.toFixed(2)}</td>
        <td>\${metric.maxDuration.toFixed(2)}</td>
        <td>\${lastExecuted}</td>
      \`;
      
      table.appendChild(row);
    });
  }
  
  /**
   * Render the location distribution chart
   * @param {string} containerId ID of the container element
   */
  renderLocationDistributionChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found for location distribution chart.`);
      return;
    }
    
    // Clear any loading indicators
    container.innerHTML = '';
    
    // Create wrapper for chart and controls
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-with-controls';
    container.appendChild(wrapper);
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    
    // Create chart controls
    const controls = document.createElement('div');
    controls.className = 'chart-controls';
    controls.innerHTML = `
      <div class="chart-type-controls">
        <button class="chart-type-btn active" data-type="pie">Pie</button>
        <button class="chart-type-btn" data-type="doughnut">Doughnut</button>
        <button class="chart-type-btn" data-type="polarArea">Polar Area</button>
      </div>
      <div class="chart-filter-controls mt-2">
        <label>
          <input type="checkbox" id="show-all-locations" checked> Show All
        </label>
        <div class="filter-list mt-1">
          <!-- Location filters will be added dynamically -->
        </div>
      </div>
    `;
    wrapper.appendChild(controls);
    
    // Destroy existing chart if it exists
    if (this.charts.locationDistribution) {
      this.charts.locationDistribution.destroy();
      this.charts.locationDistribution = null;
    }
    
    // Prepare data
    const labels = this.data.locationDistribution.map(item => item.location);
    const values = this.data.locationDistribution.map(item => item.count);
    const colors = this._generateColors(labels.length);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.locationDistribution = new this.chartLibrary(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: 'rgba(255, 255, 255, 0.8)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              padding: 10
            },
            onClick: (e, legendItem, legend) => {
              // Custom legend click handler to toggle visibility
              const index = legendItem.index;
              const chart = legend.chart;
              
              // Toggle the hidden state
              const meta = chart.getDatasetMeta(0);
              const isHidden = meta.data[index].hidden || false;
              meta.data[index].hidden = !isHidden;
              
              // Also update the checkbox state
              const checkbox = controls.querySelector(`.location-filter[data-index="${index}"]`);
              if (checkbox) {
                checkbox.checked = !isHidden;
              }
              
              // Update the chart
              chart.update();
              
              // Emit event if eventBus exists
              if (this.eventBus) {
                this.eventBus.emit('chart-filter-changed', {
                  chart: 'locationDistribution',
                  index,
                  hidden: !isHidden
                });
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          },
          title: {
            display: true,
            text: 'Content Location Distribution'
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const location = labels[index];
            
            // Emit click event if eventBus exists
            if (this.eventBus) {
              this.eventBus.emit('chart-item-clicked', {
                chart: 'locationDistribution',
                item: location,
                data: {
                  location,
                  count: values[index]
                }
              });
              
              // You could also trigger a filter operation
              this.eventBus.emit('filter-by-location', location);
            }
          }
        }
      }
    });
    
    // Add location filter checkboxes
    const filterList = controls.querySelector('.filter-list');
    this.data.locationDistribution.forEach((item, index) => {
      const filterItem = document.createElement('div');
      filterItem.className = 'filter-item';
      filterItem.innerHTML = `
        <label>
          <input type="checkbox" class="location-filter" data-index="${index}" data-location="${item.location}" checked>
          <span class="color-indicator" style="background-color: ${colors[index]}"></span>
          ${item.location} (${item.count})
        </label>
      `;
      filterList.appendChild(filterItem);
      
      // Add event listener to checkbox
      const checkbox = filterItem.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        const chart = this.charts.locationDistribution;
        if (chart) {
          const meta = chart.getDatasetMeta(0);
          meta.data[index].hidden = !checkbox.checked;
          chart.update();
          
          // Emit event if eventBus exists
          if (this.eventBus) {
            this.eventBus.emit('chart-filter-changed', {
              chart: 'locationDistribution',
              index,
              hidden: !checkbox.checked
            });
          }
        }
      });
    });
    
    // Add event listener to "Show All" checkbox
    const showAllCheckbox = controls.querySelector('#show-all-locations');
    showAllCheckbox.addEventListener('change', () => {
      const checked = showAllCheckbox.checked;
      const chart = this.charts.locationDistribution;
      
      if (chart) {
        const meta = chart.getDatasetMeta(0);
        
        // Update all data points visibility
        meta.data.forEach((dataPoint, i) => {
          dataPoint.hidden = !checked;
        });
        
        // Update all filter checkboxes
        controls.querySelectorAll('.location-filter').forEach(checkbox => {
          checkbox.checked = checked;
        });
        
        // Update the chart
        chart.update();
        
        // Emit event if eventBus exists
        if (this.eventBus) {
          this.eventBus.emit('chart-filter-all-changed', {
            chart: 'locationDistribution',
            allVisible: checked
          });
        }
      }
    });
    
    // Add event listeners to chart type buttons
    controls.querySelectorAll('.chart-type-btn').forEach(button => {
      button.addEventListener('click', () => {
        // Update button states
        controls.querySelectorAll('.chart-type-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Get chart type
        const chartType = button.dataset.type;
        
        // Update chart configuration
        const chart = this.charts.locationDistribution;
        if (chart) {
          chart.config.type = chartType;
          
          // For polar area, adjust the radius calculation
          if (chartType === 'polarArea') {
            chart.data.datasets[0].borderColor = 'rgba(255, 255, 255, 0.8)';
            chart.options.plugins.legend.position = 'right';
          }
          
          // Update the chart
          chart.update();
          
          // Emit event if eventBus exists
          if (this.eventBus) {
            this.eventBus.emit('chart-type-changed', {
              chart: 'locationDistribution',
              type: chartType
            });
          }
        }
      });
    });
  }
  
  /**
   * Render the size distribution chart
   * @param {string} containerId ID of the container element
   */
  renderSizeDistributionChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found for size distribution chart.`);
      return;
    }
    
    // Clear any loading indicators
    container.innerHTML = '';
    
    // Create wrapper for chart and controls
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-with-controls';
    container.appendChild(wrapper);
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    
    // Create chart controls
    const controls = document.createElement('div');
    controls.className = 'chart-controls';
    controls.innerHTML = `
      <div class="chart-type-controls">
        <button class="chart-type-btn active" data-type="bar">Bar</button>
        <button class="chart-type-btn" data-type="line">Line</button>
        <button class="chart-type-btn" data-type="radar">Radar</button>
      </div>
      <div class="chart-option-controls mt-2">
        <label>
          <input type="checkbox" id="enable-animations" checked> Animations
        </label>
        <label class="ml-2">
          <input type="checkbox" id="show-average-line"> Show Average
        </label>
      </div>
    `;
    wrapper.appendChild(controls);
    
    // Destroy existing chart if it exists
    if (this.charts.sizeDistribution) {
      this.charts.sizeDistribution.destroy();
      this.charts.sizeDistribution = null;
    }
    
    // Prepare data
    const { labels, counts } = this.data.sizeDistribution;
    
    // Calculate average for the average line plugin
    const average = counts.reduce((sum, value) => sum + value, 0) / counts.length;
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.sizeDistribution = new this.chartLibrary(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Number of Files',
          data: counts,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1000,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.raw} files`;
              }
            }
          },
          title: {
            display: true,
            text: 'Content Size Distribution'
          },
          // Custom average line plugin
          averageLine: {
            enabled: false,
            value: average,
            text: `Average: ${average.toFixed(1)} files`,
            color: 'rgba(255, 99, 132, 1)',
            width: 2,
            dashPattern: [5, 5]
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'File Size Range'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Files'
            },
            ticks: {
              precision: 0
            }
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const sizeRange = labels[index];
            
            // Emit click event if eventBus exists
            if (this.eventBus) {
              this.eventBus.emit('chart-item-clicked', {
                chart: 'sizeDistribution',
                item: sizeRange,
                data: {
                  sizeRange,
                  count: counts[index]
                }
              });
              
              // You could also trigger a filter operation
              this.eventBus.emit('filter-by-size-range', sizeRange);
            }
            
            // Toggle highlight on the clicked bar
            this._toggleHighlight('sizeDistribution', index);
          }
        }
      },
      plugins: [{
        id: 'averageLine',
        afterDraw: (chart) => {
          if (chart.options.plugins.averageLine && chart.options.plugins.averageLine.enabled) {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const value = chart.options.plugins.averageLine.value;
            const yPosition = yAxis.getPixelForValue(value);
            const text = chart.options.plugins.averageLine.text || `Average: ${value}`;
            
            // Draw line
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(chart.chartArea.left, yPosition);
            ctx.lineTo(chart.chartArea.right, yPosition);
            ctx.lineWidth = chart.options.plugins.averageLine.width || 2;
            ctx.strokeStyle = chart.options.plugins.averageLine.color || 'rgba(255, 99, 132, 1)';
            
            // Set dash pattern if specified
            if (chart.options.plugins.averageLine.dashPattern) {
              ctx.setLineDash(chart.options.plugins.averageLine.dashPattern);
            }
            
            ctx.stroke();
            
            // Draw text
            ctx.fillStyle = chart.options.plugins.averageLine.color || 'rgba(255, 99, 132, 1)';
            ctx.textAlign = 'right';
            ctx.fillText(text, chart.chartArea.right - 5, yPosition - 5);
            ctx.restore();
          }
        }
      }]
    });
    
    // Add event listeners to chart type buttons
    controls.querySelectorAll('.chart-type-btn').forEach(button => {
      button.addEventListener('click', () => {
        // Update button states
        controls.querySelectorAll('.chart-type-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Get chart type
        const chartType = button.dataset.type;
        
        // Update chart configuration
        const chart = this.charts.sizeDistribution;
        if (chart) {
          chart.config.type = chartType;
          
          // Adjust dataset configuration based on chart type
          if (chartType === 'line') {
            chart.data.datasets[0].fill = true;
            chart.data.datasets[0].tension = 0.4;
          } else if (chartType === 'radar') {
            chart.data.datasets[0].fill = true;
            chart.options.scales.r = {
              beginAtZero: true,
              ticks: {
                backdropColor: 'rgba(255, 255, 255, 0.8)'
              }
            };
          } else {
            // Bar chart
            chart.data.datasets[0].fill = undefined;
            chart.data.datasets[0].tension = undefined;
          }
          
          // Update the chart
          chart.update();
          
          // Emit event if eventBus exists
          if (this.eventBus) {
            this.eventBus.emit('chart-type-changed', {
              chart: 'sizeDistribution',
              type: chartType
            });
          }
        }
      });
    });
    
    // Add event listener to animations checkbox
    const animationsCheckbox = controls.querySelector('#enable-animations');
    animationsCheckbox.addEventListener('change', () => {
      const chart = this.charts.sizeDistribution;
      if (chart) {
        chart.options.animation.duration = animationsCheckbox.checked ? 1000 : 0;
        chart.update();
      }
    });
    
    // Add event listener to average line checkbox
    const averageLineCheckbox = controls.querySelector('#show-average-line');
    averageLineCheckbox.addEventListener('change', () => {
      const chart = this.charts.sizeDistribution;
      if (chart) {
        chart.options.plugins.averageLine.enabled = averageLineCheckbox.checked;
        chart.update();
      }
    });
  }
  
  /**
   * Render the content timeline chart
   * @param {string} containerId ID of the container element
   */
  renderContentTimelineChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found for content timeline chart.`);
      return;
    }
    
    // Clear any loading indicators
    container.innerHTML = '';
    
    // Create wrapper for chart and controls
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-with-controls';
    container.appendChild(wrapper);
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    
    // Create chart controls
    const controls = document.createElement('div');
    controls.className = 'chart-controls';
    controls.innerHTML = `
      <div class="chart-option-controls">
        <select id="timeline-range-selector" class="chart-select">
          <option value="all">All Time</option>
          <option value="year">Last Year</option>
          <option value="quarter">Last Quarter</option>
          <option value="month">Last Month</option>
          <option value="week">Last Week</option>
        </select>
        <label class="ml-2">
          <input type="checkbox" id="show-trend-line"> Show Trend
        </label>
        <label class="ml-2">
          <input type="checkbox" id="enable-cumulative"> Cumulative
        </label>
      </div>
    `;
    wrapper.appendChild(controls);
    
    // Destroy existing chart if it exists
    if (this.charts.contentTimeline) {
      this.charts.contentTimeline.destroy();
      this.charts.contentTimeline = null;
    }
    
    // Prepare data
    const { labels, counts } = this.data.contentTimeline;
    
    // Calculate cumulative counts
    const cumulativeCounts = [];
    let sum = 0;
    counts.forEach(count => {
      sum += count;
      cumulativeCounts.push(sum);
    });
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.contentTimeline = new this.chartLibrary(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Content Added',
          data: counts,
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        },
        {
          label: 'Trend Line',
          data: this._calculateTrendLine(labels, counts),
          backgroundColor: 'rgba(255, 99, 132, 0)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0,
          pointRadius: 0,
          hidden: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true
          },
          tooltip: {
            mode: 'index',
            intersect: false
          },
          title: {
            display: true,
            text: 'Content Addition Timeline'
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x'
            },
            zoom: {
              wheel: {
                enabled: true
              },
              pinch: {
                enabled: true
              },
              mode: 'x'
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Items'
            },
            ticks: {
              precision: 0
            }
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const date = labels[index];
            const count = chart.data.datasets[0].data[index];
            
            // Emit click event if eventBus exists
            if (this.eventBus) {
              this.eventBus.emit('chart-item-clicked', {
                chart: 'contentTimeline',
                item: date,
                data: {
                  date,
                  count
                }
              });
              
              // You could also trigger a filter operation
              this.eventBus.emit('filter-by-date', date);
            }
          }
        }
      }
    });
    
    // Add event listener to timeline range selector
    const rangeSelector = controls.querySelector('#timeline-range-selector');
    rangeSelector.addEventListener('change', () => {
      this._updateTimelineRange(rangeSelector.value);
    });
    
    // Add event listener to trend line checkbox
    const trendLineCheckbox = controls.querySelector('#show-trend-line');
    trendLineCheckbox.addEventListener('change', () => {
      const chart = this.charts.contentTimeline;
      if (chart) {
        chart.data.datasets[1].hidden = !trendLineCheckbox.checked;
        chart.update();
      }
    });
    
    // Add event listener to cumulative checkbox
    const cumulativeCheckbox = controls.querySelector('#enable-cumulative');
    cumulativeCheckbox.addEventListener('change', () => {
      const chart = this.charts.contentTimeline;
      if (chart) {
        // Toggle between regular and cumulative data
        if (cumulativeCheckbox.checked) {
          chart.data.datasets[0].data = cumulativeCounts;
          chart.data.datasets[0].label = 'Cumulative Content';
          chart.data.datasets[1].data = this._calculateTrendLine(labels, cumulativeCounts);
        } else {
          chart.data.datasets[0].data = counts;
          chart.data.datasets[0].label = 'Content Added';
          chart.data.datasets[1].data = this._calculateTrendLine(labels, counts);
        }
        chart.update();
      }
    });
    
    // Add reset zoom button
    const resetZoomButton = document.createElement('button');
    resetZoomButton.textContent = 'Reset Zoom';
    resetZoomButton.className = 'chart-btn reset-zoom-btn';
    resetZoomButton.style.display = 'none';
    controls.appendChild(resetZoomButton);
    
    resetZoomButton.addEventListener('click', () => {
      const chart = this.charts.contentTimeline;
      if (chart && chart.options.plugins.zoom) {
        chart.resetZoom();
        resetZoomButton.style.display = 'none';
      }
    });
    
    // Show reset zoom button when zoomed
    if (this.charts.contentTimeline.options.plugins.zoom) {
      this.charts.contentTimeline.options.plugins.zoom.zoom.onZoom = () => {
        resetZoomButton.style.display = 'inline-block';
      };
    }
  }
  
  /**
   * Update the timeline chart based on selected range
   * @param {string} range Selected time range (all, year, quarter, month, week)
   * @private
   */
  _updateTimelineRange(range) {
    const chart = this.charts.contentTimeline;
    if (!chart) return;
    
    const { labels, counts } = this.data.contentTimeline;
    const isCumulative = document.querySelector('#enable-cumulative')?.checked || false;
    
    // Calculate data based on selected range
    let filteredLabels = [...labels];
    let filteredCounts = isCumulative ? 
      this._calculateCumulativeCounts(counts) : 
      [...counts];
    
    // Apply filtering based on range
    if (range !== 'all' && labels.length > 0) {
      const lastDate = new Date(labels[labels.length - 1]);
      let startDate = new Date(lastDate);
      
      switch (range) {
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
      }
      
      // Filter labels and counts based on date range
      const startIndex = labels.findIndex(label => {
        const date = new Date(label);
        return date >= startDate;
      });
      
      if (startIndex >= 0) {
        filteredLabels = labels.slice(startIndex);
        filteredCounts = isCumulative ? 
          this._calculateCumulativeCounts(counts.slice(startIndex)) : 
          counts.slice(startIndex);
      }
    }
    
    // Update chart data
    chart.data.labels = filteredLabels;
    chart.data.datasets[0].data = filteredCounts;
    
    // Update trend line
    chart.data.datasets[1].data = this._calculateTrendLine(filteredLabels, filteredCounts);
    
    // Update chart
    chart.update();
    
    // Emit event if eventBus exists
    if (this.eventBus) {
      this.eventBus.emit('timeline-range-changed', {
        range,
        labels: filteredLabels,
        counts: filteredCounts
      });
    }
  }
  
  /**
   * Calculate cumulative counts from a series of individual counts
   * @param {number[]} counts Array of individual counts
   * @returns {number[]} Array of cumulative counts
   * @private
   */
  _calculateCumulativeCounts(counts) {
    const cumulativeCounts = [];
    let sum = 0;
    counts.forEach(count => {
      sum += count;
      cumulativeCounts.push(sum);
    });
    return cumulativeCounts;
  }
  
  /**
   * Calculate trend line data points using linear regression
   * @param {string[]} labels The x-axis labels (dates)
   * @param {number[]} values The y-axis values
   * @returns {number[]} Calculated trend line points
   * @private
   */
  _calculateTrendLine(labels, values) {
    if (!labels || !values || labels.length < 2 || values.length < 2) {
      return [];
    }
    
    // Convert dates to numerical x values (days since first date)
    const xValues = labels.map((label, i) => i);
    const yValues = values;
    
    // Calculate linear regression (y = mx + b)
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    const n = xValues.length;
    
    for (let i = 0; i < n; i++) {
      sumX += xValues[i];
      sumY += yValues[i];
      sumXY += xValues[i] * yValues[i];
      sumXX += xValues[i] * xValues[i];
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Generate trend line points
    return xValues.map(x => slope * x + intercept);
  }
  
  /**
   * Toggle highlight on a specific data point in a chart
   * @param {string} chartName Name of the chart in this.charts
   * @param {number} index Index of the data point to toggle highlight
   * @private
   */
  _toggleHighlight(chartName, index) {
    const chart = this.charts[chartName];
    if (!chart) return;
    
    // Get the current dataset
    const dataset = chart.data.datasets[0];
    
    // Store original colors if not already stored
    if (!dataset._originalBackgroundColor) {
      dataset._originalBackgroundColor = Array.isArray(dataset.backgroundColor) ? 
        [...dataset.backgroundColor] : 
        dataset.backgroundColor;
        
      dataset._originalBorderColor = Array.isArray(dataset.borderColor) ? 
        [...dataset.borderColor] : 
        dataset.borderColor;
    }
    
    // Reset all colors to original
    if (Array.isArray(dataset.backgroundColor)) {
      for (let i = 0; i < dataset.backgroundColor.length; i++) {
        dataset.backgroundColor[i] = dataset._originalBackgroundColor[i];
        dataset.borderColor[i] = dataset._originalBorderColor[i];
      }
    } else {
      // Create arrays of the same color if it was a single color
      dataset.backgroundColor = Array(dataset.data.length).fill(dataset._originalBackgroundColor);
      dataset.borderColor = Array(dataset.data.length).fill(dataset._originalBorderColor);
    }
    
    // Highlight the selected item
    if (dataset._highlightIndex !== index) {
      dataset.backgroundColor[index] = 'rgba(255, 99, 132, 0.6)';
      dataset.borderColor[index] = 'rgba(255, 99, 132, 1)';
      dataset._highlightIndex = index;
    } else {
      // If clicking the same item, remove highlight
      dataset._highlightIndex = undefined;
    }
    
    // Update the chart
    chart.update();
  }
  
  /**
   * Update all charts with new data
   */
  updateCharts() {
    this.renderOperationsChart('operations-chart');
    this.renderFileTypeChart('file-type-chart');
    this.renderSizeByTypeChart('size-by-type-chart');
    this.renderLocationDistributionChart('location-distribution-chart');
    this.renderSizeDistributionChart('size-distribution-chart');
    this.renderContentTimelineChart('content-timeline-chart');
    this.renderPerformanceMetricsTable('performance-metrics-table');
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Destroy all chart instances
    Object.values(this.charts).forEach(chart => {
      if (chart) {
        chart.destroy();
      }
    });
    
    // Clear chart references
    this.charts = {
      operations: null,
      fileType: null,
      sizeByType: null,
      locationDistribution: null,
      sizeDistribution: null,
      contentTimeline: null
    };
    
    // Remove event listeners
    if (this.eventBus) {
      // If there's a specific removeListener method, use it
      if (typeof this.eventBus.removeListener === 'function') {
        this.eventBus.removeListener('content-index-updated', this._handleContentIndexUpdated);
      }
    }
  }
  
  /**
   * Bind event listeners
   * @private
   */
  _bindEvents() {
    // Handle content index updates
    if (this.eventBus) {
      this.eventBus.on('content-index-updated', this._handleContentIndexUpdated.bind(this));
      
      // Handle tab switching to initialize charts when the Statistics tab is shown
      this.eventBus.on('tab-changed', (tabId) => {
        if (tabId === 'stats') {
          // Delay rendering to ensure containers are visible
          setTimeout(() => this.renderCharts(), 100);
        }
      });
    }
  }
  
  /**
   * Handle content index update events
   * @param {Object} data Update data
   * @private
   */
  _handleContentIndexUpdated(data) {
    // Reload data and update charts
    this.loadData().then(() => {
      this.updateCharts();
    });
  }
  
  /**
   * Process statistics data for visualizations
   * @param {Object} stats Statistics data
   * @private
   */
  _processData(stats) {
    // Process operations data
    if (stats.operations) {
      this.data.operations = Object.entries(stats.operations).map(([operation, count]) => ({
        operation,
        count
      })).sort((a, b) => b.count - a.count);
    } else {
      this.data.operations = [];
    }
    
    // Process file type distribution
    if (stats.type_counts) {
      this.data.fileTypes = Object.entries(stats.type_counts).map(([type, count]) => ({
        type,
        count
      })).sort((a, b) => b.count - a.count);
    } else {
      this.data.fileTypes = [];
    }
    
    // Process size by content type
    if (stats.type_sizes) {
      this.data.sizeByType = Object.entries(stats.type_sizes).map(([type, size]) => ({
        type,
        size
      })).sort((a, b) => b.size - a.size);
    } else {
      this.data.sizeByType = [];
    }
    
    // Process location distribution
    if (stats.location_counts) {
      this.data.locationDistribution = Object.entries(stats.location_counts).map(([location, count]) => ({
        location,
        count
      })).sort((a, b) => b.count - a.count);
    } else {
      this.data.locationDistribution = [];
    }
    
    // Process size distribution
    if (stats.size_distribution) {
      this.data.sizeDistribution = {
        labels: Object.keys(stats.size_distribution),
        counts: Object.values(stats.size_distribution)
      };
    } else {
      this.data.sizeDistribution = {
        labels: [],
        counts: []
      };
    }
    
    // Process content timeline
    if (stats.content_timeline) {
      this.data.contentTimeline = {
        labels: Object.keys(stats.content_timeline),
        counts: Object.values(stats.content_timeline)
      };
    } else {
      this.data.contentTimeline = {
        labels: [],
        counts: []
      };
    }
    
    // Process performance metrics
    if (stats.performance) {
      this.data.performanceMetrics = Object.entries(stats.performance).map(([operation, metrics]) => ({
        operation,
        count: metrics.count || 0,
        avgDuration: metrics.avg_duration || 0,
        minDuration: metrics.min_duration || 0,
        maxDuration: metrics.max_duration || 0,
        lastExecuted: metrics.last_executed
      })).sort((a, b) => b.count - a.count);
    } else {
      this.data.performanceMetrics = [];
    }
  }
  
  /**
   * Load mock data for development and testing
   * @private
   */
  _loadMockData() {
    // Mock operations data
    this.data.operations = [
      { operation: 'query', count: 256 },
      { operation: 'lookupByCid', count: 189 },
      { operation: 'lookupByPath', count: 132 },
      { operation: 'addEntry', count: 45 },
      { operation: 'updateEntry', count: 23 },
      { operation: 'deleteEntry', count: 8 },
      { operation: 'export', count: 3 },
      { operation: 'sync', count: 2 }
    ];
    
    // Mock file type distribution
    this.data.fileTypes = [
      { type: 'image/jpeg', count: 87 },
      { type: 'application/pdf', count: 54 },
      { type: 'application/octet-stream', count: 42 },
      { type: 'text/plain', count: 38 },
      { type: 'image/png', count: 25 },
      { type: 'video/mp4', count: 12 },
      { type: 'application/json', count: 8 },
      { type: 'other', count: 14 }
    ];
    
    // Mock size by content type (sizes in KB)
    this.data.sizeByType = [
      { type: 'video/mp4', size: 512000 },
      { type: 'application/octet-stream', size: 256000 },
      { type: 'image/jpeg', size: 48000 },
      { type: 'application/pdf', size: 24000 },
      { type: 'image/png', size: 12000 },
      { type: 'text/plain', size: 2500 },
      { type: 'application/json', size: 1200 },
      { type: 'other', size: 8000 }
    ];
    
    // Mock location distribution
    this.data.locationDistribution = [
      { location: 'IPFS', count: 156 },
      { location: 'Hugging Face', count: 98 },
      { location: 'Local', count: 76 },
      { location: 'S3', count: 43 },
      { location: 'Filecoin', count: 32 },
      { location: 'Web3.Storage', count: 25 },
      { location: 'Pinata', count: 18 },
      { location: 'Other', count: 12 }
    ];
    
    // Mock size distribution
    this.data.sizeDistribution = {
      labels: ['<1KB', '1KB-10KB', '10KB-100KB', '100KB-1MB', '1MB-10MB', '10MB-100MB', '100MB-1GB', '>1GB'],
      counts: [42, 87, 124, 96, 64, 32, 13, 7]
    };
    
    // Mock content timeline
    const today = new Date();
    const labels = [];
    const counts = [];
    
    // Generate data for the last 14 days
    for (let i = 13; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString());
      
      // Generate a random count with an upward trend
      const baseCount = 5 + Math.floor(i * 0.7);
      const randomVariation = Math.floor(Math.random() * 8) - 4;
      counts.push(baseCount + randomVariation);
    }
    
    this.data.contentTimeline = { labels, counts };
    
    // Mock performance metrics
    this.data.performanceMetrics = [
      {
        operation: 'query',
        count: 256,
        avgDuration: 45.23,
        minDuration: 12.87,
        maxDuration: 128.45,
        lastExecuted: new Date().toISOString()
      },
      {
        operation: 'lookupByCid',
        count: 189,
        avgDuration: 22.56,
        minDuration: 8.12,
        maxDuration: 78.34,
        lastExecuted: new Date().toISOString()
      },
      {
        operation: 'lookupByPath',
        count: 132,
        avgDuration: 24.78,
        minDuration: 9.45,
        maxDuration: 82.19,
        lastExecuted: new Date().toISOString()
      },
      {
        operation: 'addEntry',
        count: 45,
        avgDuration: 112.34,
        minDuration: 45.67,
        maxDuration: 345.21,
        lastExecuted: new Date().toISOString()
      },
      {
        operation: 'updateEntry',
        count: 23,
        avgDuration: 98.76,
        minDuration: 42.12,
        maxDuration: 278.45,
        lastExecuted: new Date().toISOString()
      }
    ];
  }
  
  /**
   * Generate a sequence of colors for charts
   * @param {number} count Number of colors to generate
   * @returns {string[]} Array of color strings
   * @private
   */
  _generateColors(count) {
    if (count <= this.colors.length) {
      return this.colors.slice(0, count);
    }
    
    // If we need more colors, generate them by cycling through the base colors
    // with varying opacity
    const result = [];
    for (let i = 0; i < count; i++) {
      const baseColor = this.colors[i % this.colors.length];
      
      // For additional cycles, adjust the opacity
      if (i < this.colors.length) {
        result.push(baseColor);
      } else {
        const opacity = 0.7 - (Math.floor(i / this.colors.length) * 0.15);
        
        // Extract RGB components and create new color with adjusted opacity
        const rgbMatch = baseColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1], 16);
          const g = parseInt(rgbMatch[2], 16);
          const b = parseInt(rgbMatch[3], 16);
          result.push(`rgba(${r}, ${g}, ${b}, ${opacity})`);
        } else {
          // If we can't parse the color, just reuse it
          result.push(baseColor);
        }
      }
    }
    
    return result;
  }
}

export default VisualizationManager;