/**
 * Enhanced Storage Visualization components for PyArrow Content Index Dashboard
 * 
 * This file contains methods to enhance the storage location visualization
 * with more detailed charts, filters, and analytics.
 */

/**
 * Render enhanced storage location visualization
 * Provides detailed breakdown of storage locations with interactive elements
 * 
 * @returns {HTMLElement} The enhanced view container
 * @private
 */
function renderEnhancedStorageView() {
  const container = document.createElement('div');
  container.className = 'enhanced-storage-view';
  
  // Create filters section
  const filtersSection = document.createElement('div');
  filtersSection.className = 'storage-filters';
  filtersSection.innerHTML = `
    <div class="filter-group">
      <label for="storage-group-by">Group by:</label>
      <select id="storage-group-by">
        <option value="location" selected>Storage Location</option>
        <option value="provider">Provider Type</option>
        <option value="protocol">Protocol</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="storage-chart-type">Chart type:</label>
      <select id="storage-chart-type">
        <option value="bar" selected>Bar Chart</option>
        <option value="pie">Pie Chart</option>
        <option value="radar">Radar Chart</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="storage-metric">Metric:</label>
      <select id="storage-metric">
        <option value="count" selected>Content Count</option>
        <option value="size">Total Size</option>
      </select>
    </div>
  `;
  container.appendChild(filtersSection);
  
  // Create visualization area with multiple charts
  const visualizationArea = document.createElement('div');
  visualizationArea.className = 'storage-visualization-area';
  visualizationArea.innerHTML = `
    <div class="chart-row">
      <div class="chart-column">
        <div class="chart-wrapper">
          <h4>Primary Distribution</h4>
          <canvas id="primary-storage-chart" width="400" height="250"></canvas>
        </div>
      </div>
      <div class="chart-column">
        <div class="chart-wrapper">
          <h4>Storage Type Breakdown</h4>
          <canvas id="storage-type-chart" width="400" height="250"></canvas>
        </div>
      </div>
    </div>
    <div class="chart-row">
      <div class="chart-wrapper full-width">
        <h4>Timeline View</h4>
        <canvas id="storage-timeline-chart" width="800" height="200"></canvas>
      </div>
    </div>
  `;
  container.appendChild(visualizationArea);
  
  // Create detailed analytics table
  const analyticsTable = document.createElement('div');
  analyticsTable.className = 'storage-analytics-table';
  analyticsTable.innerHTML = `
    <h4>Detailed Storage Analysis</h4>
    <table class="enhanced-table">
      <thead>
        <tr>
          <th>Storage Location</th>
          <th>Content Count</th>
          <th>Size</th>
          <th>Last Updated</th>
          <th>Availability</th>
          <th>Provider Type</th>
          <th>Protocol</th>
        </tr>
      </thead>
      <tbody id="storage-analytics-body">
        <!-- Will be populated dynamically -->
      </tbody>
    </table>
  `;
  container.appendChild(analyticsTable);
  
  return container;
}

/**
 * Render the enhanced storage charts with interactive features
 * 
 * @private
 */
function renderEnhancedStorageCharts() {
  // Ensure Canvas contexts exist
  const primaryChartCanvas = document.getElementById('primary-storage-chart');
  const typeChartCanvas = document.getElementById('storage-type-chart');
  const timelineChartCanvas = document.getElementById('storage-timeline-chart');
  
  if (!primaryChartCanvas || !typeChartCanvas || !timelineChartCanvas) {
    console.error('Chart canvases not found');
    return;
  }
  
  // Get current filter values
  const groupBy = document.getElementById('storage-group-by')?.value || 'location';
  const chartType = document.getElementById('storage-chart-type')?.value || 'bar';
  const metric = document.getElementById('storage-metric')?.value || 'count';
  
  // Process data based on filters
  let processedData = processStorageData(this.storageDistribution, groupBy, metric);
  
  // Render Primary Chart
  renderPrimaryStorageChart(primaryChartCanvas, processedData, chartType);
  
  // Render Type Breakdown Chart
  renderStorageTypeChart(typeChartCanvas, processedData);
  
  // Render Timeline Chart (using mock data for now)
  renderStorageTimelineChart(timelineChartCanvas);
  
  // Populate the analytics table
  populateStorageAnalyticsTable(processedData);
  
  // Add event listeners to filters
  addStorageFilterListeners();
}

/**
 * Process storage data for visualization based on selected filters
 * 
 * @param {Array} storageDistribution - The raw storage distribution data
 * @param {string} groupBy - How to group the data (location, provider, protocol)
 * @param {string} metric - Which metric to display (count, size)
 * @returns {Object} Processed data for visualization
 * @private
 */
function processStorageData(storageDistribution, groupBy, metric) {
  if (!storageDistribution || storageDistribution.length === 0) {
    return { groupedData: [], extendedData: [], metric, groupBy };
  }
  
  // Map storage locations to provider types and protocols (in a real implementation, this would 
  // come from actual metadata, but for this demo we'll create mock mappings)
  const providerMap = {
    'ipfs': { type: 'Distributed', protocol: 'IPFS' },
    'huggingface': { type: 'Hosted API', protocol: 'HTTPS' },
    'filecoin': { type: 'Distributed', protocol: 'Filecoin' },
    's3': { type: 'Cloud Storage', protocol: 'S3' },
    'local': { type: 'Local', protocol: 'File' },
    'pinata': { type: 'Pinning Service', protocol: 'IPFS' },
    'web3storage': { type: 'Distributed', protocol: 'IPFS' },
    'arweave': { type: 'Distributed', protocol: 'Arweave' },
    'googlecloud': { type: 'Cloud Storage', protocol: 'HTTP' },
    'azure': { type: 'Cloud Storage', protocol: 'HTTP' }
  };
  
  // Add mock size data for the size metric
  const mockSizes = {
    'ipfs': 2500000000, // 2.5 GB
    'huggingface': 9800000000, // 9.8 GB
    'filecoin': 5300000000, // 5.3 GB
    's3': 7200000000, // 7.2 GB
    'local': 1500000000, // 1.5 GB
    'pinata': 800000000, // 800 MB
    'web3storage': 1200000000, // 1.2 GB
    'arweave': 600000000, // 600 MB
    'googlecloud': 4100000000, // 4.1 GB
    'azure': 3300000000 // 3.3 GB
  };
  
  // Create an extended dataset with additional attributes
  const extendedData = storageDistribution.map(item => {
    const provider = providerMap[item.location.toLowerCase()] || { type: 'Unknown', protocol: 'Unknown' };
    return {
      location: item.location,
      count: item.count,
      size: mockSizes[item.location.toLowerCase()] || Math.floor(Math.random() * 1000000000), // Random fallback
      lastUpdated: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(), // Random date within last 30 days
      availability: Math.floor(90 + Math.random() * 10), // 90-100%
      providerType: provider.type,
      protocol: provider.protocol
    };
  });
  
  // Group the data based on the groupBy parameter
  let groupedData = [];
  if (groupBy === 'location') {
    groupedData = extendedData;
  } else if (groupBy === 'provider') {
    const providerGroups = {};
    extendedData.forEach(item => {
      const key = item.providerType;
      if (!providerGroups[key]) {
        providerGroups[key] = {
          location: key, // For consistency with the original data structure
          providerType: key,
          count: 0,
          size: 0,
          items: []
        };
      }
      providerGroups[key].count += item.count;
      providerGroups[key].size += item.size;
      providerGroups[key].items.push(item);
    });
    groupedData = Object.values(providerGroups);
  } else if (groupBy === 'protocol') {
    const protocolGroups = {};
    extendedData.forEach(item => {
      const key = item.protocol;
      if (!protocolGroups[key]) {
        protocolGroups[key] = {
          location: key, // For consistency
          protocol: key,
          count: 0,
          size: 0,
          items: []
        };
      }
      protocolGroups[key].count += item.count;
      protocolGroups[key].size += item.size;
      protocolGroups[key].items.push(item);
    });
    groupedData = Object.values(protocolGroups);
  }
  
  // Sort by the selected metric
  const metricValue = metric === 'count' ? 'count' : 'size';
  groupedData.sort((a, b) => b[metricValue] - a[metricValue]);
  
  return {
    groupedData,
    extendedData,
    metric,
    groupBy
  };
}

/**
 * Render the primary storage chart based on selected chart type
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @param {Object} data - The processed data object
 * @param {string} chartType - The type of chart to render (bar, pie, radar)
 * @private
 */
function renderPrimaryStorageChart(canvas, data, chartType) {
  if (!canvas || !data || !data.groupedData || data.groupedData.length === 0) {
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const { groupedData, metric } = data;
  
  // Generate color palette for chart
  const backgroundColors = [
    '#FFCE56', '#4BC0C0', '#36A2EB', '#FF6384', '#9966FF',
    '#FF9F40', '#C9CBCF', '#7BC8A4', '#E6B0AA', '#5D6D7E'
  ];
  
  // Get the appropriate metric values and labels
  const metricValues = metric === 'count' 
    ? groupedData.map(item => item.count)
    : groupedData.map(item => item.size);
  
  const labels = groupedData.map(item => item.location);
  
  // Format the metric values for tooltip display
  const formatValue = (value) => {
    if (metric === 'size') {
      // Format size in appropriate units (KB, MB, GB)
      const kb = value / 1024;
      const mb = kb / 1024;
      const gb = mb / 1024;
      
      if (gb >= 1) {
        return `${gb.toFixed(2)} GB`;
      } else if (mb >= 1) {
        return `${mb.toFixed(2)} MB`;
      } else {
        return `${kb.toFixed(2)} KB`;
      }
    } else {
      // Format count with locale-specific number formatting
      return value.toLocaleString();
    }
  };
  
  // Create chart configuration based on chart type
  const chartConfig = {
    data: {
      labels: labels,
      datasets: [{
        label: metric === 'count' ? 'Content Count' : 'Total Size',
        data: metricValues,
        backgroundColor: backgroundColors.slice(0, groupedData.length),
        borderColor: backgroundColors.slice(0, groupedData.length),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      title: {
        display: true,
        text: `Storage Distribution by ${data.groupBy.charAt(0).toUpperCase() + data.groupBy.slice(1)}`
      },
      tooltips: {
        callbacks: {
          label: (tooltipItem, data) => {
            const value = data.datasets[0].data[tooltipItem.index];
            return `${data.labels[tooltipItem.index]}: ${formatValue(value)}`;
          }
        }
      }
    }
  };
  
  // Configure chart based on type
  if (chartType === 'bar') {
    chartConfig.type = 'horizontalBar';
    chartConfig.options.scales = {
      xAxes: [{
        ticks: {
          beginAtZero: true
        }
      }]
    };
  } else if (chartType === 'pie') {
    chartConfig.type = 'pie';
    chartConfig.options.legend = {
      position: 'right'
    };
  } else if (chartType === 'radar') {
    chartConfig.type = 'radar';
    chartConfig.options.elements = {
      line: {
        tension: 0.1
      }
    };
  }
  
  // Create the chart
  if (this.primaryStorageChart) {
    this.primaryStorageChart.destroy();
  }
  
  if (window.Chart) {
    this.primaryStorageChart = new window.Chart(ctx, chartConfig);
  }
}

/**
 * Render the storage type breakdown chart
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @param {Object} data - The processed data object
 * @private
 */
function renderStorageTypeChart(canvas, data) {
  if (!canvas || !data || !data.extendedData || data.extendedData.length === 0) {
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const { extendedData } = data;
  
  // Group data by provider type
  const providerGroups = {};
  extendedData.forEach(item => {
    if (!providerGroups[item.providerType]) {
      providerGroups[item.providerType] = 0;
    }
    providerGroups[item.providerType] += item.count;
  });
  
  // Convert to arrays for Chart.js
  const providerLabels = Object.keys(providerGroups);
  const providerData = Object.values(providerGroups);
  
  // Color palette
  const backgroundColors = [
    '#4BC0C0', '#FF6384', '#FFCE56', '#36A2EB', '#9966FF',
    '#FF9F40', '#C9CBCF', '#7BC8A4', '#E6B0AA', '#5D6D7E'
  ];
  
  // Create doughnut chart
  if (this.typeStorageChart) {
    this.typeStorageChart.destroy();
  }
  
  if (window.Chart) {
    this.typeStorageChart = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: providerLabels,
        datasets: [{
          data: providerData,
          backgroundColor: backgroundColors.slice(0, providerLabels.length),
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          position: 'right',
          align: 'center'
        },
        title: {
          display: true,
          text: 'Storage Provider Types'
        },
        tooltips: {
          callbacks: {
            label: (tooltipItem, data) => {
              const value = data.datasets[0].data[tooltipItem.index];
              const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
              const percentage = Math.round((value / total) * 100);
              return `${data.labels[tooltipItem.index]}: ${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    });
  }
}

/**
 * Render the storage timeline chart showing changes over time
 * Note: This uses mock data for demonstration purposes
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @private
 */
function renderStorageTimelineChart(canvas) {
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Create mock timeline data for demonstration
  // In a real implementation, this would come from actual historical data
  const today = new Date();
  const labels = [];
  
  // Generate last 14 days as labels
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString());
  }
  
  // Generate mock data for IPFS and other providers
  const generateMockTimelineData = (baseline, variability, growth) => {
    return labels.map((_, index) => {
      return Math.floor(baseline * (1 + growth * index / 13) + (Math.random() - 0.5) * variability);
    });
  };
  
  // Create datasets with different growth patterns
  const datasets = [
    {
      label: 'IPFS',
      data: generateMockTimelineData(800, 200, 0.4),
      backgroundColor: 'rgba(255, 206, 86, 0.2)',
      borderColor: 'rgba(255, 206, 86, 1)',
      borderWidth: 2,
      fill: true
    },
    {
      label: 'Filecoin',
      data: generateMockTimelineData(500, 150, 0.6),
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 2,
      fill: true
    },
    {
      label: 'Hosted APIs',
      data: generateMockTimelineData(650, 180, 0.25),
      backgroundColor: 'rgba(153, 102, 255, 0.2)',
      borderColor: 'rgba(153, 102, 255, 1)',
      borderWidth: 2,
      fill: true
    },
    {
      label: 'Cloud Storage',
      data: generateMockTimelineData(450, 100, 0.3),
      backgroundColor: 'rgba(54, 162, 235, 0.2)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 2,
      fill: true
    }
  ];
  
  // Create the chart
  if (this.timelineStorageChart) {
    this.timelineStorageChart.destroy();
  }
  
  if (window.Chart) {
    this.timelineStorageChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        title: {
          display: true,
          text: 'Storage Usage Trend (14 Days)'
        },
        scales: {
          xAxes: [{
            display: true,
            scaleLabel: {
              display: true,
              labelString: 'Date'
            }
          }],
          yAxes: [{
            display: true,
            scaleLabel: {
              display: true,
              labelString: 'Content Count'
            },
            ticks: {
              beginAtZero: true
            }
          }]
        },
        elements: {
          line: {
            tension: 0.4
          }
        },
        tooltips: {
          mode: 'index',
          intersect: false
        },
        hover: {
          mode: 'nearest',
          intersect: true
        }
      }
    });
  }
}

/**
 * Populate the detailed storage analytics table
 * 
 * @param {Object} data - The processed data object
 * @private
 */
function populateStorageAnalyticsTable(data) {
  const tableBody = document.getElementById('storage-analytics-body');
  if (!tableBody || !data || !data.extendedData) return;
  
  // Clear existing content
  tableBody.innerHTML = '';
  
  // Format file size to human-readable format
  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    else return (bytes / 1073741824).toFixed(2) + ' GB';
  };
  
  // Format date to readable format
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  // Add rows for each storage location
  data.extendedData.forEach(item => {
    const row = document.createElement('tr');
    
    // Add cells
    row.innerHTML = `
      <td>${item.location}</td>
      <td>${item.count.toLocaleString()}</td>
      <td>${formatSize(item.size)}</td>
      <td>${formatDate(item.lastUpdated)}</td>
      <td>${item.availability}%</td>
      <td>${item.providerType}</td>
      <td>${item.protocol}</td>
    `;
    
    tableBody.appendChild(row);
  });
}

/**
 * Add event listeners to the storage filter controls
 * 
 * @private
 */
function addStorageFilterListeners() {
  const groupBySelect = document.getElementById('storage-group-by');
  const chartTypeSelect = document.getElementById('storage-chart-type');
  const metricSelect = document.getElementById('storage-metric');
  
  const updateCharts = () => {
    const groupBy = groupBySelect.value;
    const chartType = chartTypeSelect.value;
    const metric = metricSelect.value;
    
    // Process data based on current filters
    const processedData = processStorageData(this.storageDistribution, groupBy, metric);
    
    // Update charts
    const primaryChartCanvas = document.getElementById('primary-storage-chart');
    const typeChartCanvas = document.getElementById('storage-type-chart');
    const timelineChartCanvas = document.getElementById('storage-timeline-chart');
    
    renderPrimaryStorageChart(primaryChartCanvas, processedData, chartType);
    renderStorageTypeChart(typeChartCanvas, processedData);
    renderStorageTimelineChart(timelineChartCanvas);
    
    // Update table
    populateStorageAnalyticsTable(processedData);
  };
  
  // Add event listeners
  if (groupBySelect) {
    groupBySelect.addEventListener('change', updateCharts);
  }
  
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', updateCharts);
  }
  
  if (metricSelect) {
    metricSelect.addEventListener('change', updateCharts);
  }
}

// Export functions for integration
module.exports = {
  renderEnhancedStorageView,
  renderEnhancedStorageCharts,
  processStorageData,
  renderPrimaryStorageChart,
  renderStorageTypeChart,
  renderStorageTimelineChart,
  populateStorageAnalyticsTable,
  addStorageFilterListeners
};