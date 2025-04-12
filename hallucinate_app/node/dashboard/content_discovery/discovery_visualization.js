/**
 * Database Visualization for Content Discovery
 * 
 * This module provides advanced visualization tools for content discovery
 * in the PyArrow Content Index database. It includes interactive charts,
 * relationship graphs, timeline visualizations, and filtering capabilities.
 */

/**
 * Create the main content discovery visualization panel
 * 
 * @returns {HTMLElement} The content discovery panel
 */
function createDiscoveryPanel() {
  const panel = document.createElement('div');
  panel.className = 'discovery-panel';
  
  // Add header with title and controls
  const header = document.createElement('div');
  header.className = 'discovery-header';
  
  const title = document.createElement('h2');
  title.textContent = 'Content Discovery Visualization';
  header.appendChild(title);
  
  const controls = document.createElement('div');
  controls.className = 'discovery-controls';
  
  // Add visualization type selector
  const viewSelector = document.createElement('div');
  viewSelector.className = 'view-selector';
  viewSelector.innerHTML = `
    <label for="visualization-type">View:</label>
    <select id="visualization-type">
      <option value="overview">Content Overview</option>
      <option value="timeline">Content Timeline</option>
      <option value="relationships">Content Relationships</option>
      <option value="tags">Tag Cloud</option>
      <option value="patterns">Usage Patterns</option>
    </select>
  `;
  controls.appendChild(viewSelector);
  
  // Add refresh button
  const refreshButton = document.createElement('button');
  refreshButton.className = 'refresh-btn';
  refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
  controls.appendChild(refreshButton);
  
  header.appendChild(controls);
  panel.appendChild(header);
  
  // Create main visualization area
  const visualizationArea = document.createElement('div');
  visualizationArea.className = 'visualization-area';
  
  // Create container for each visualization type
  const overviewContainer = createOverviewVisualization();
  overviewContainer.style.display = 'block'; // Show by default
  visualizationArea.appendChild(overviewContainer);
  
  const timelineContainer = createTimelineVisualization();
  timelineContainer.style.display = 'none';
  visualizationArea.appendChild(timelineContainer);
  
  const relationshipsContainer = createRelationshipsVisualization();
  relationshipsContainer.style.display = 'none';
  visualizationArea.appendChild(relationshipsContainer);
  
  const tagCloudContainer = createTagCloudVisualization();
  tagCloudContainer.style.display = 'none';
  visualizationArea.appendChild(tagCloudContainer);
  
  const patternsContainer = createPatternsVisualization();
  patternsContainer.style.display = 'none';
  visualizationArea.appendChild(patternsContainer);
  
  panel.appendChild(visualizationArea);
  
  // Add detail panel for selected content
  const detailPanel = document.createElement('div');
  detailPanel.className = 'detail-panel';
  detailPanel.innerHTML = `
    <div class="detail-header">
      <h3>Selected Content Details</h3>
      <button class="close-details-btn">×</button>
    </div>
    <div class="detail-content">
      <p class="no-selection">Select content from the visualization to see details</p>
    </div>
  `;
  
  // Initially hidden
  detailPanel.style.display = 'none';
  panel.appendChild(detailPanel);
  
  // Add event listeners
  const visualizationTypeSelect = viewSelector.querySelector('#visualization-type');
  visualizationTypeSelect.addEventListener('change', () => {
    const selectedType = visualizationTypeSelect.value;
    
    // Hide all containers
    overviewContainer.style.display = 'none';
    timelineContainer.style.display = 'none';
    relationshipsContainer.style.display = 'none';
    tagCloudContainer.style.display = 'none';
    patternsContainer.style.display = 'none';
    
    // Show selected container
    switch (selectedType) {
      case 'overview':
        overviewContainer.style.display = 'block';
        break;
      case 'timeline':
        timelineContainer.style.display = 'block';
        break;
      case 'relationships':
        relationshipsContainer.style.display = 'block';
        break;
      case 'tags':
        tagCloudContainer.style.display = 'block';
        break;
      case 'patterns':
        patternsContainer.style.display = 'block';
        break;
    }
  });
  
  refreshButton.addEventListener('click', () => {
    refreshVisualization();
  });
  
  // Close button for details panel
  const closeDetailsBtn = detailPanel.querySelector('.close-details-btn');
  closeDetailsBtn.addEventListener('click', () => {
    detailPanel.style.display = 'none';
  });
  
  return panel;
}

/**
 * Create the content overview visualization
 * 
 * @returns {HTMLElement} The overview visualization container
 */
function createOverviewVisualization() {
  const container = document.createElement('div');
  container.className = 'visualization-container overview-visualization';
  
  // Add filter controls
  const filterControls = document.createElement('div');
  filterControls.className = 'filter-bar';
  filterControls.innerHTML = `
    <div class="filter-group">
      <label for="overview-group-by">Group by:</label>
      <select id="overview-group-by">
        <option value="type">Content Type</option>
        <option value="size">Size Range</option>
        <option value="location">Storage Location</option>
        <option value="date">Creation Date</option>
        <option value="tag">Tags</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="overview-chart-type">Chart type:</label>
      <select id="overview-chart-type">
        <option value="pie">Pie Chart</option>
        <option value="bar">Bar Chart</option>
        <option value="treemap">Treemap</option>
        <option value="polarArea">Polar Area</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="overview-limit">Limit:</label>
      <select id="overview-limit">
        <option value="5">Top 5</option>
        <option value="10" selected>Top 10</option>
        <option value="15">Top 15</option>
        <option value="20">Top 20</option>
        <option value="0">All</option>
      </select>
    </div>
  `;
  container.appendChild(filterControls);
  
  // Add chart container
  const chartArea = document.createElement('div');
  chartArea.className = 'chart-area';
  
  // Primary chart
  const primaryChartContainer = document.createElement('div');
  primaryChartContainer.className = 'chart-container primary-chart';
  
  const primaryChartTitle = document.createElement('h3');
  primaryChartTitle.className = 'chart-title';
  primaryChartTitle.textContent = 'Content Distribution';
  primaryChartContainer.appendChild(primaryChartTitle);
  
  const primaryCanvasContainer = document.createElement('div');
  primaryCanvasContainer.className = 'canvas-container';
  
  const primaryCanvas = document.createElement('canvas');
  primaryCanvas.id = 'overview-primary-chart';
  primaryCanvas.width = 500;
  primaryCanvas.height = 400;
  primaryCanvasContainer.appendChild(primaryCanvas);
  
  primaryChartContainer.appendChild(primaryCanvasContainer);
  chartArea.appendChild(primaryChartContainer);
  
  // Secondary chart
  const secondaryChartContainer = document.createElement('div');
  secondaryChartContainer.className = 'chart-container secondary-chart';
  
  const secondaryChartTitle = document.createElement('h3');
  secondaryChartTitle.className = 'chart-title';
  secondaryChartTitle.textContent = 'Size Distribution by Type';
  secondaryChartContainer.appendChild(secondaryChartTitle);
  
  const secondaryCanvasContainer = document.createElement('div');
  secondaryCanvasContainer.className = 'canvas-container';
  
  const secondaryCanvas = document.createElement('canvas');
  secondaryCanvas.id = 'overview-secondary-chart';
  secondaryCanvas.width = 500;
  secondaryCanvas.height = 400;
  secondaryCanvasContainer.appendChild(secondaryCanvas);
  
  secondaryChartContainer.appendChild(secondaryCanvasContainer);
  chartArea.appendChild(secondaryChartContainer);
  
  container.appendChild(chartArea);
  
  // Breakdown table
  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-container';
  
  const tableTitle = document.createElement('h3');
  tableTitle.textContent = 'Detailed Breakdown';
  tableContainer.appendChild(tableTitle);
  
  const breakdownTable = document.createElement('table');
  breakdownTable.className = 'breakdown-table';
  breakdownTable.innerHTML = `
    <thead>
      <tr>
        <th>Category</th>
        <th>Count</th>
        <th>Total Size</th>
        <th>Avg. Size</th>
        <th>% of Total</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="overview-table-body">
      <!-- Table rows will be populated dynamically -->
    </tbody>
  `;
  tableContainer.appendChild(breakdownTable);
  
  container.appendChild(tableContainer);
  
  return container;
}

/**
 * Create the content timeline visualization
 * 
 * @returns {HTMLElement} The timeline visualization container
 */
function createTimelineVisualization() {
  const container = document.createElement('div');
  container.className = 'visualization-container timeline-visualization';
  
  // Add filter controls
  const filterControls = document.createElement('div');
  filterControls.className = 'filter-bar';
  filterControls.innerHTML = `
    <div class="filter-group">
      <label for="timeline-time-range">Time Range:</label>
      <select id="timeline-time-range">
        <option value="day">Last 24 Hours</option>
        <option value="week" selected>Last 7 Days</option>
        <option value="month">Last 30 Days</option>
        <option value="year">Last Year</option>
        <option value="all">All Time</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="timeline-group-by">Group by:</label>
      <select id="timeline-group-by">
        <option value="day">Day</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="timeline-content-type">Content Type:</label>
      <select id="timeline-content-type">
        <option value="all" selected>All Types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="document">Documents</option>
        <option value="audio">Audio</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="timeline-metric">Metric:</label>
      <select id="timeline-metric">
        <option value="count" selected>Count</option>
        <option value="size">Total Size</option>
        <option value="access">Access Frequency</option>
      </select>
    </div>
  `;
  container.appendChild(filterControls);
  
  // Main timeline chart
  const timelineChartContainer = document.createElement('div');
  timelineChartContainer.className = 'chart-container full-width';
  
  const timelineChartTitle = document.createElement('h3');
  timelineChartTitle.className = 'chart-title';
  timelineChartTitle.textContent = 'Content Timeline';
  timelineChartContainer.appendChild(timelineChartTitle);
  
  const timelineCanvasContainer = document.createElement('div');
  timelineCanvasContainer.className = 'canvas-container';
  
  const timelineCanvas = document.createElement('canvas');
  timelineCanvas.id = 'main-timeline-chart';
  timelineCanvas.width = 1000;
  timelineCanvas.height = 400;
  timelineCanvasContainer.appendChild(timelineCanvas);
  
  timelineChartContainer.appendChild(timelineCanvasContainer);
  container.appendChild(timelineChartContainer);
  
  // Activity heatmap
  const heatmapContainer = document.createElement('div');
  heatmapContainer.className = 'chart-container full-width';
  
  const heatmapTitle = document.createElement('h3');
  heatmapTitle.className = 'chart-title';
  heatmapTitle.textContent = 'Content Activity Heatmap';
  heatmapContainer.appendChild(heatmapTitle);
  
  const heatmapContent = document.createElement('div');
  heatmapContent.className = 'heatmap-container';
  heatmapContent.id = 'content-heatmap';
  heatmapContainer.appendChild(heatmapContent);
  
  container.appendChild(heatmapContainer);
  
  // Recent activity table
  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-container';
  
  const tableTitle = document.createElement('h3');
  tableTitle.textContent = 'Recent Content Activity';
  tableContainer.appendChild(tableTitle);
  
  const activityTable = document.createElement('table');
  activityTable.className = 'activity-table';
  activityTable.innerHTML = `
    <thead>
      <tr>
        <th>Time</th>
        <th>Content</th>
        <th>Type</th>
        <th>Action</th>
        <th>Size</th>
        <th>View</th>
      </tr>
    </thead>
    <tbody id="activity-table-body">
      <!-- Table rows will be populated dynamically -->
    </tbody>
  `;
  tableContainer.appendChild(activityTable);
  
  container.appendChild(tableContainer);
  
  return container;
}

/**
 * Create the content relationships visualization
 * 
 * @returns {HTMLElement} The relationships visualization container
 */
function createRelationshipsVisualization() {
  const container = document.createElement('div');
  container.className = 'visualization-container relationships-visualization';
  
  // Add filter controls
  const filterControls = document.createElement('div');
  filterControls.className = 'filter-bar';
  filterControls.innerHTML = `
    <div class="filter-group">
      <label for="relationship-type">Relationship Type:</label>
      <select id="relationship-type">
        <option value="content-type">Content Type Relations</option>
        <option value="storage">Storage Location Relations</option>
        <option value="access-pattern">Access Pattern Relations</option>
        <option value="tag-similarity">Tag Similarity Network</option>
        <option value="content-similarity">Content Similarity Clusters</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="relationship-layout">Layout:</label>
      <select id="relationship-layout">
        <option value="force">Force-Directed</option>
        <option value="circular">Circular</option>
        <option value="hierarchical">Hierarchical</option>
        <option value="radial">Radial</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="relationship-depth">Depth:</label>
      <select id="relationship-depth">
        <option value="1">Level 1</option>
        <option value="2" selected>Level 2</option>
        <option value="3">Level 3</option>
        <option value="all">All Levels</option>
      </select>
    </div>
    <div class="filter-group">
      <div class="toggle-group">
        <label for="show-labels">Show Labels:</label>
        <input type="checkbox" id="show-labels" checked>
      </div>
    </div>
  `;
  container.appendChild(filterControls);
  
  // Graph visualization container
  const graphContainer = document.createElement('div');
  graphContainer.className = 'graph-container';
  graphContainer.id = 'relationship-graph-container';
  
  // Placeholder text will be replaced with actual graph
  const placeholder = document.createElement('div');
  placeholder.className = 'graph-placeholder';
  placeholder.innerHTML = `
    <div class="graph-loading">
      <div class="spinner"></div>
      <p>Initializing Relationship Graph...</p>
    </div>
  `;
  graphContainer.appendChild(placeholder);
  
  container.appendChild(graphContainer);
  
  // Legend and information panel
  const infoPanel = document.createElement('div');
  infoPanel.className = 'info-panel';
  
  const legendSection = document.createElement('div');
  legendSection.className = 'legend-section';
  
  const legendTitle = document.createElement('h3');
  legendTitle.textContent = 'Legend';
  legendSection.appendChild(legendTitle);
  
  const legendContent = document.createElement('div');
  legendContent.className = 'legend-content';
  legendContent.id = 'relationship-legend';
  // Legend will be populated dynamically
  legendSection.appendChild(legendContent);
  
  infoPanel.appendChild(legendSection);
  
  const statsSection = document.createElement('div');
  statsSection.className = 'stats-section';
  
  const statsTitle = document.createElement('h3');
  statsTitle.textContent = 'Graph Statistics';
  statsSection.appendChild(statsTitle);
  
  const statsContent = document.createElement('div');
  statsContent.className = 'stats-content';
  statsContent.id = 'graph-stats';
  // Stats will be populated dynamically
  statsSection.appendChild(statsContent);
  
  infoPanel.appendChild(statsSection);
  
  container.appendChild(infoPanel);
  
  return container;
}

/**
 * Create the tag cloud visualization
 * 
 * @returns {HTMLElement} The tag cloud visualization container
 */
function createTagCloudVisualization() {
  const container = document.createElement('div');
  container.className = 'visualization-container tagcloud-visualization';
  
  // Add filter controls
  const filterControls = document.createElement('div');
  filterControls.className = 'filter-bar';
  filterControls.innerHTML = `
    <div class="filter-group">
      <label for="tag-content-type">Content Type:</label>
      <select id="tag-content-type">
        <option value="all" selected>All Types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="document">Documents</option>
        <option value="audio">Audio</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="tag-time-period">Time Period:</label>
      <select id="tag-time-period">
        <option value="all" selected>All Time</option>
        <option value="day">Last 24 Hours</option>
        <option value="week">Last 7 Days</option>
        <option value="month">Last 30 Days</option>
        <option value="year">Last Year</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="tag-min-count">Minimum Count:</label>
      <select id="tag-min-count">
        <option value="1">1+ (All Tags)</option>
        <option value="2" selected>2+</option>
        <option value="5">5+</option>
        <option value="10">10+</option>
        <option value="20">20+</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="tag-max-tags">Max Tags:</label>
      <select id="tag-max-tags">
        <option value="25">25 Tags</option>
        <option value="50" selected>50 Tags</option>
        <option value="100">100 Tags</option>
        <option value="200">200 Tags</option>
        <option value="0">All Tags</option>
      </select>
    </div>
  `;
  container.appendChild(filterControls);
  
  // Main tag cloud area
  const tagCloudContainer = document.createElement('div');
  tagCloudContainer.className = 'tagcloud-container';
  tagCloudContainer.id = 'main-tag-cloud';
  container.appendChild(tagCloudContainer);
  
  // Tag statistics charts
  const tagStatsContainer = document.createElement('div');
  tagStatsContainer.className = 'chart-row';
  
  // Tag frequency over time
  const tagTimelineContainer = document.createElement('div');
  tagTimelineContainer.className = 'chart-container half-width';
  
  const tagTimelineTitle = document.createElement('h3');
  tagTimelineTitle.className = 'chart-title';
  tagTimelineTitle.textContent = 'Tag Frequency Over Time';
  tagTimelineContainer.appendChild(tagTimelineTitle);
  
  const tagTimelineCanvasContainer = document.createElement('div');
  tagTimelineCanvasContainer.className = 'canvas-container';
  
  const tagTimelineCanvas = document.createElement('canvas');
  tagTimelineCanvas.id = 'tag-timeline-chart';
  tagTimelineCanvas.width = 500;
  tagTimelineCanvas.height = 300;
  tagTimelineCanvasContainer.appendChild(tagTimelineCanvas);
  
  tagTimelineContainer.appendChild(tagTimelineCanvasContainer);
  tagStatsContainer.appendChild(tagTimelineContainer);
  
  // Tag co-occurrence
  const tagCooccurrenceContainer = document.createElement('div');
  tagCooccurrenceContainer.className = 'chart-container half-width';
  
  const tagCooccurrenceTitle = document.createElement('h3');
  tagCooccurrenceTitle.className = 'chart-title';
  tagCooccurrenceTitle.textContent = 'Tag Co-occurrence';
  tagCooccurrenceContainer.appendChild(tagCooccurrenceTitle);
  
  const tagCooccurrenceCanvasContainer = document.createElement('div');
  tagCooccurrenceCanvasContainer.className = 'canvas-container';
  
  const tagCooccurrenceCanvas = document.createElement('canvas');
  tagCooccurrenceCanvas.id = 'tag-cooccurrence-chart';
  tagCooccurrenceCanvas.width = 500;
  tagCooccurrenceCanvas.height = 300;
  tagCooccurrenceCanvasContainer.appendChild(tagCooccurrenceCanvas);
  
  tagCooccurrenceContainer.appendChild(tagCooccurrenceCanvasContainer);
  tagStatsContainer.appendChild(tagCooccurrenceContainer);
  
  container.appendChild(tagStatsContainer);
  
  // Top tags table
  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-container';
  
  const tableTitle = document.createElement('h3');
  tableTitle.textContent = 'Top Tags Analysis';
  tableContainer.appendChild(tableTitle);
  
  const tagsTable = document.createElement('table');
  tagsTable.className = 'tags-table';
  tagsTable.innerHTML = `
    <thead>
      <tr>
        <th>Tag</th>
        <th>Count</th>
        <th>Content Types</th>
        <th>Total Size</th>
        <th>First Added</th>
        <th>Last Used</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="tags-table-body">
      <!-- Table rows will be populated dynamically -->
    </tbody>
  `;
  tableContainer.appendChild(tagsTable);
  
  container.appendChild(tableContainer);
  
  return container;
}

/**
 * Create the usage patterns visualization
 * 
 * @returns {HTMLElement} The patterns visualization container
 */
function createPatternsVisualization() {
  const container = document.createElement('div');
  container.className = 'visualization-container patterns-visualization';
  
  // Add filter controls
  const filterControls = document.createElement('div');
  filterControls.className = 'filter-bar';
  filterControls.innerHTML = `
    <div class="filter-group">
      <label for="pattern-time-range">Time Range:</label>
      <select id="pattern-time-range">
        <option value="week">Last 7 Days</option>
        <option value="month" selected>Last 30 Days</option>
        <option value="quarter">Last 90 Days</option>
        <option value="year">Last Year</option>
        <option value="all">All Time</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="pattern-type">Pattern Type:</label>
      <select id="pattern-type">
        <option value="access" selected>Access Patterns</option>
        <option value="addition">Content Addition</option>
        <option value="modification">Content Modification</option>
        <option value="deletion">Content Deletion</option>
        <option value="combined">Combined Activity</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="pattern-view">View:</label>
      <select id="pattern-view">
        <option value="chart" selected>Charts</option>
        <option value="analysis">Analysis</option>
        <option value="prediction">Predictions</option>
      </select>
    </div>
  `;
  container.appendChild(filterControls);
  
  // Chart container for patterns
  const patternChartsContainer = document.createElement('div');
  patternChartsContainer.className = 'patterns-charts';
  patternChartsContainer.id = 'pattern-charts-view';
  
  // Access frequency by time
  const timePatternContainer = document.createElement('div');
  timePatternContainer.className = 'chart-container full-width';
  
  const timePatternTitle = document.createElement('h3');
  timePatternTitle.className = 'chart-title';
  timePatternTitle.textContent = 'Access Frequency by Time';
  timePatternContainer.appendChild(timePatternTitle);
  
  const timePatternCanvasContainer = document.createElement('div');
  timePatternCanvasContainer.className = 'canvas-container';
  
  const timePatternCanvas = document.createElement('canvas');
  timePatternCanvas.id = 'time-pattern-chart';
  timePatternCanvas.width = 1000;
  timePatternCanvas.height = 300;
  timePatternCanvasContainer.appendChild(timePatternCanvas);
  
  timePatternContainer.appendChild(timePatternCanvasContainer);
  patternChartsContainer.appendChild(timePatternContainer);
  
  // Content popularity chart
  const popularityChartRow = document.createElement('div');
  popularityChartRow.className = 'chart-row';
  
  // Top content
  const popularityContainer = document.createElement('div');
  popularityContainer.className = 'chart-container half-width';
  
  const popularityTitle = document.createElement('h3');
  popularityTitle.className = 'chart-title';
  popularityTitle.textContent = 'Most Accessed Content';
  popularityContainer.appendChild(popularityTitle);
  
  const popularityCanvasContainer = document.createElement('div');
  popularityCanvasContainer.className = 'canvas-container';
  
  const popularityCanvas = document.createElement('canvas');
  popularityCanvas.id = 'popularity-chart';
  popularityCanvas.width = 450;
  popularityCanvas.height = 300;
  popularityCanvasContainer.appendChild(popularityCanvas);
  
  popularityContainer.appendChild(popularityCanvasContainer);
  popularityChartRow.appendChild(popularityContainer);
  
  // Access by type
  const typeAccessContainer = document.createElement('div');
  typeAccessContainer.className = 'chart-container half-width';
  
  const typeAccessTitle = document.createElement('h3');
  typeAccessTitle.className = 'chart-title';
  typeAccessTitle.textContent = 'Access by Content Type';
  typeAccessContainer.appendChild(typeAccessTitle);
  
  const typeAccessCanvasContainer = document.createElement('div');
  typeAccessCanvasContainer.className = 'canvas-container';
  
  const typeAccessCanvas = document.createElement('canvas');
  typeAccessCanvas.id = 'type-access-chart';
  typeAccessCanvas.width = 450;
  typeAccessCanvas.height = 300;
  typeAccessCanvasContainer.appendChild(typeAccessCanvas);
  
  typeAccessContainer.appendChild(typeAccessCanvasContainer);
  popularityChartRow.appendChild(typeAccessContainer);
  
  patternChartsContainer.appendChild(popularityChartRow);
  
  container.appendChild(patternChartsContainer);
  
  // Analysis view (initially hidden)
  const analysisContainer = document.createElement('div');
  analysisContainer.className = 'patterns-analysis';
  analysisContainer.id = 'pattern-analysis-view';
  analysisContainer.style.display = 'none';
  
  // Analysis cards
  const analysisCards = document.createElement('div');
  analysisCards.className = 'analysis-cards';
  
  // Usage patterns card
  const usagePatternsCard = document.createElement('div');
  usagePatternsCard.className = 'analysis-card';
  usagePatternsCard.innerHTML = `
    <h3>Usage Pattern Analysis</h3>
    <div class="pattern-summary" id="usage-pattern-summary">
      <p>Loading pattern analysis...</p>
    </div>
    <div class="pattern-details">
      <h4>Key Observations</h4>
      <ul id="usage-pattern-observations">
        <!-- Will be populated dynamically -->
      </ul>
    </div>
  `;
  analysisCards.appendChild(usagePatternsCard);
  
  // Content lifecycle card
  const lifecycleCard = document.createElement('div');
  lifecycleCard.className = 'analysis-card';
  lifecycleCard.innerHTML = `
    <h3>Content Lifecycle Metrics</h3>
    <div class="metrics-grid" id="lifecycle-metrics">
      <!-- Will be populated dynamically -->
    </div>
  `;
  analysisCards.appendChild(lifecycleCard);
  
  // Anomaly detection card
  const anomalyCard = document.createElement('div');
  anomalyCard.className = 'analysis-card';
  anomalyCard.innerHTML = `
    <h3>Anomaly Detection</h3>
    <div class="anomaly-list" id="detected-anomalies">
      <p>No anomalies detected in the selected time period.</p>
    </div>
  `;
  analysisCards.appendChild(anomalyCard);
  
  analysisContainer.appendChild(analysisCards);
  
  // Correlation table
  const correlationContainer = document.createElement('div');
  correlationContainer.className = 'table-container';
  
  const correlationTitle = document.createElement('h3');
  correlationTitle.textContent = 'Correlation Analysis';
  correlationContainer.appendChild(correlationTitle);
  
  const correlationTable = document.createElement('table');
  correlationTable.className = 'correlation-table';
  correlationTable.innerHTML = `
    <thead>
      <tr>
        <th>Metric 1</th>
        <th>Metric 2</th>
        <th>Correlation</th>
        <th>Significance</th>
        <th>Direction</th>
        <th>Visualization</th>
      </tr>
    </thead>
    <tbody id="correlation-table-body">
      <!-- Table rows will be populated dynamically -->
    </tbody>
  `;
  correlationContainer.appendChild(correlationTable);
  
  analysisContainer.appendChild(correlationContainer);
  
  container.appendChild(analysisContainer);
  
  // Prediction view (initially hidden)
  const predictionContainer = document.createElement('div');
  predictionContainer.className = 'patterns-prediction';
  predictionContainer.id = 'pattern-prediction-view';
  predictionContainer.style.display = 'none';
  
  // Prediction charts
  const predictionChartContainer = document.createElement('div');
  predictionChartContainer.className = 'chart-container full-width';
  
  const predictionTitle = document.createElement('h3');
  predictionTitle.className = 'chart-title';
  predictionTitle.textContent = 'Usage Prediction (Next 30 Days)';
  predictionChartContainer.appendChild(predictionTitle);
  
  const predictionCanvasContainer = document.createElement('div');
  predictionCanvasContainer.className = 'canvas-container';
  
  const predictionCanvas = document.createElement('canvas');
  predictionCanvas.id = 'prediction-chart';
  predictionCanvas.width = 1000;
  predictionCanvas.height = 400;
  predictionCanvasContainer.appendChild(predictionCanvas);
  
  predictionChartContainer.appendChild(predictionCanvasContainer);
  predictionContainer.appendChild(predictionChartContainer);
  
  // Prediction scenarios
  const scenariosContainer = document.createElement('div');
  scenariosContainer.className = 'prediction-scenarios';
  
  const scenariosTitle = document.createElement('h3');
  scenariosTitle.textContent = 'Prediction Scenarios';
  scenariosContainer.appendChild(scenariosTitle);
  
  const scenariosGrid = document.createElement('div');
  scenariosGrid.className = 'scenarios-grid';
  scenariosGrid.id = 'prediction-scenarios';
  // Will be populated dynamically
  scenariosContainer.appendChild(scenariosGrid);
  
  predictionContainer.appendChild(scenariosContainer);
  
  container.appendChild(predictionContainer);
  
  // Add event listeners for view switching
  const patternViewSelect = filterControls.querySelector('#pattern-view');
  patternViewSelect.addEventListener('change', () => {
    const selectedView = patternViewSelect.value;
    
    // Hide all views
    patternChartsContainer.style.display = 'none';
    analysisContainer.style.display = 'none';
    predictionContainer.style.display = 'none';
    
    // Show selected view
    switch (selectedView) {
      case 'chart':
        patternChartsContainer.style.display = 'block';
        break;
      case 'analysis':
        analysisContainer.style.display = 'block';
        break;
      case 'prediction':
        predictionContainer.style.display = 'block';
        break;
    }
  });
  
  return container;
}

/**
 * Generate example data for visualization
 * This would be replaced with real data from the PyArrow index
 * 
 * @returns {Object} Sample data for all visualizations
 */
function generateExampleData() {
  // Define content types for consistent data
  const contentTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf', 'text/plain', 'text/markdown',
    'application/json', 'application/javascript',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'application/zip', 'application/x-ipfs-dir'
  ];
  
  // Define storage locations
  const storageLocations = [
    'ipfs', 'filecoin', 'arweave', 's3', 'huggingface',
    'local', 'pinata', 'web3storage', 'googlecloud', 'azure'
  ];
  
  // Define tags pool
  const tagPool = [
    'dataset', 'model', 'image', 'photography', 'artwork', 'document', 
    'report', 'video', 'tutorial', 'audio', 'music', 'podcast', 
    'code', 'script', 'configuration', 'backup', 'archive', 'draft', 
    'final', 'public', 'private', 'encrypted', 'compressed', 'project', 
    'research', 'development', 'testing', 'production', 'personal', 
    'shared', 'machine-learning', 'deep-learning', 'nlp', 'computer-vision',
    'blockchain', 'web3', 'defi', 'social', 'blog', 'documentation',
    'thumbnail', 'profile', 'avatar', 'background', 'icon', 'logo'
  ];
  
  // Generate random date within range
  const randomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  };
  
  // Generate random size with weighted distribution
  const randomSize = () => {
    // Use exponential distribution to favor smaller files
    const base = Math.random();
    if (base < 0.7) {
      // Small files (up to 10MB)
      return Math.floor(Math.random() * 10 * 1024 * 1024);
    } else if (base < 0.9) {
      // Medium files (10MB to 100MB)
      return Math.floor((10 + Math.random() * 90) * 1024 * 1024);
    } else {
      // Large files (100MB to 1GB)
      return Math.floor((100 + Math.random() * 900) * 1024 * 1024);
    }
  };
  
  // Generate random tags
  const randomTags = () => {
    const numTags = Math.floor(Math.random() * 5) + 1; // 1-5 tags
    const tags = new Set();
    for (let i = 0; i < numTags; i++) {
      tags.add(tagPool[Math.floor(Math.random() * tagPool.length)]);
    }
    return Array.from(tags);
  };
  
  // Generate random CID
  const randomCid = () => {
    const prefix = Math.random() < 0.5 ? 'Qm' : 'bafy';
    let result = prefix;
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = prefix === 'Qm' ? 44 : 58;
    for (let i = 0; i < length - prefix.length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };
  
  // Generate example content entries
  const generateEntries = (count) => {
    const entries = [];
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    for (let i = 0; i < count; i++) {
      const contentType = contentTypes[Math.floor(Math.random() * contentTypes.length)];
      const mainType = contentType.split('/')[0];
      
      const timestamp = randomDate(oneYearAgo, now);
      
      // Generate path based on content type
      let path;
      switch (mainType) {
        case 'image':
          path = `/images/${timestamp.getFullYear()}/${(timestamp.getMonth() + 1).toString().padStart(2, '0')}/image_${i}.${contentType.split('/')[1]}`;
          break;
        case 'video':
          path = `/videos/${timestamp.getFullYear()}/video_${i}.${contentType.split('/')[1]}`;
          break;
        case 'audio':
          path = `/audio/${timestamp.getFullYear()}/audio_${i}.${contentType.split('/')[1]}`;
          break;
        case 'application':
          if (contentType === 'application/pdf') {
            path = `/documents/pdf/doc_${i}.pdf`;
          } else if (contentType === 'application/json') {
            path = `/data/json/data_${i}.json`;
          } else if (contentType === 'application/zip') {
            path = `/archives/archive_${i}.zip`;
          } else if (contentType === 'application/x-ipfs-dir') {
            path = `/directories/dir_${i}`;
          } else {
            path = `/files/${contentType.split('/')[1]}/file_${i}`;
          }
          break;
        case 'text':
          path = `/text/${contentType.split('/')[1]}/text_${i}.${contentType === 'text/markdown' ? 'md' : 'txt'}`;
          break;
        default:
          path = `/other/file_${i}`;
      }
      
      // Generate access count with exponential decay from creation date
      const daysSinceCreation = (now.getTime() - timestamp.getTime()) / (24 * 60 * 60 * 1000);
      const baseAccessRate = Math.random() * 0.5 + 0.1; // 0.1 to 0.6 accesses per day
      const accessCount = Math.floor(baseAccessRate * Math.pow(0.997, daysSinceCreation) * daysSinceCreation);
      
      entries.push({
        cid: randomCid(),
        path: path,
        name: path.split('/').pop(),
        mime_type: contentType,
        size: randomSize(),
        timestamp: timestamp.toISOString(),
        tags: randomTags(),
        pinned: Math.random() < 0.7, // 70% chance of being pinned
        location: storageLocations[Math.floor(Math.random() * storageLocations.length)],
        access_count: accessCount,
        last_accessed: randomDate(timestamp, now).toISOString()
      });
    }
    
    return entries;
  };
  
  // Generate dataset with 1000 example entries
  const entries = generateEntries(1000);
  
  // Process entries to create visualization datasets
  
  // Content type distribution
  const typeDistribution = entries.reduce((acc, entry) => {
    const mainType = entry.mime_type.split('/')[0];
    const subType = entry.mime_type.split('/')[1];
    
    // Group by main type
    if (!acc.byMainType[mainType]) {
      acc.byMainType[mainType] = { count: 0, size: 0 };
    }
    acc.byMainType[mainType].count++;
    acc.byMainType[mainType].size += entry.size;
    
    // Group by full mime type
    if (!acc.byMimeType[entry.mime_type]) {
      acc.byMimeType[entry.mime_type] = { count: 0, size: 0 };
    }
    acc.byMimeType[entry.mime_type].count++;
    acc.byMimeType[entry.mime_type].size += entry.size;
    
    return acc;
  }, { byMainType: {}, byMimeType: {} });
  
  // Size distribution
  const sizeRanges = [
    { label: '< 100 KB', max: 100 * 1024 },
    { label: '100 KB - 1 MB', min: 100 * 1024, max: 1024 * 1024 },
    { label: '1 MB - 10 MB', min: 1024 * 1024, max: 10 * 1024 * 1024 },
    { label: '10 MB - 100 MB', min: 10 * 1024 * 1024, max: 100 * 1024 * 1024 },
    { label: '100 MB - 1 GB', min: 100 * 1024 * 1024, max: 1024 * 1024 * 1024 },
    { label: '> 1 GB', min: 1024 * 1024 * 1024 }
  ];
  
  const sizeDistribution = entries.reduce((acc, entry) => {
    for (const range of sizeRanges) {
      if (
        (range.min === undefined || entry.size >= range.min) &&
        (range.max === undefined || entry.size < range.max)
      ) {
        if (!acc[range.label]) {
          acc[range.label] = { count: 0, totalSize: 0 };
        }
        acc[range.label].count++;
        acc[range.label].totalSize += entry.size;
        break;
      }
    }
    return acc;
  }, {});
  
  // Storage location distribution
  const storageDistribution = entries.reduce((acc, entry) => {
    if (!acc[entry.location]) {
      acc[entry.location] = { count: 0, size: 0 };
    }
    acc[entry.location].count++;
    acc[entry.location].size += entry.size;
    return acc;
  }, {});
  
  // Time-based distribution
  const timeDistribution = entries.reduce((acc, entry) => {
    const date = new Date(entry.timestamp);
    const month = date.toISOString().substring(0, 7); // YYYY-MM format
    
    if (!acc[month]) {
      acc[month] = { count: 0, size: 0, byType: {} };
    }
    
    acc[month].count++;
    acc[month].size += entry.size;
    
    const mainType = entry.mime_type.split('/')[0];
    if (!acc[month].byType[mainType]) {
      acc[month].byType[mainType] = { count: 0, size: 0 };
    }
    acc[month].byType[mainType].count++;
    acc[month].byType[mainType].size += entry.size;
    
    return acc;
  }, {});
  
  // Tag distribution
  const tagDistribution = entries.reduce((acc, entry) => {
    entry.tags.forEach(tag => {
      if (!acc[tag]) {
        acc[tag] = { count: 0, size: 0, contentTypes: new Set(), firstSeen: entry.timestamp };
      }
      acc[tag].count++;
      acc[tag].size += entry.size;
      acc[tag].contentTypes.add(entry.mime_type.split('/')[0]);
      
      // Update firstSeen if earlier
      if (new Date(entry.timestamp) < new Date(acc[tag].firstSeen)) {
        acc[tag].firstSeen = entry.timestamp;
      }
      
      // Update lastSeen if later
      if (!acc[tag].lastSeen || new Date(entry.timestamp) > new Date(acc[tag].lastSeen)) {
        acc[tag].lastSeen = entry.timestamp;
      }
    });
    return acc;
  }, {});
  
  // Process tag distribution to convert Sets to arrays
  Object.keys(tagDistribution).forEach(tag => {
    tagDistribution[tag].contentTypes = Array.from(tagDistribution[tag].contentTypes);
  });
  
  // Tag co-occurrence
  const tagCooccurrence = {};
  entries.forEach(entry => {
    // For each pair of tags, increment co-occurrence
    for (let i = 0; i < entry.tags.length; i++) {
      const tagA = entry.tags[i];
      if (!tagCooccurrence[tagA]) {
        tagCooccurrence[tagA] = {};
      }
      
      for (let j = i + 1; j < entry.tags.length; j++) {
        const tagB = entry.tags[j];
        if (!tagCooccurrence[tagA][tagB]) {
          tagCooccurrence[tagA][tagB] = 0;
        }
        tagCooccurrence[tagA][tagB]++;
        
        // Mirror the relationship
        if (!tagCooccurrence[tagB]) {
          tagCooccurrence[tagB] = {};
        }
        if (!tagCooccurrence[tagB][tagA]) {
          tagCooccurrence[tagB][tagA] = 0;
        }
        tagCooccurrence[tagB][tagA]++;
      }
    }
  });
  
  // Access patterns
  // Generate example daily access data for the past 90 days
  const accessPatterns = {};
  const now = new Date();
  
  // Generate synthetic access data with weekly patterns
  for (let i = 0; i < 90; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    
    // Create weekday pattern (more on weekdays, less on weekends)
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Base count with some randomness
    let baseCount = isWeekend ? 
      Math.floor(Math.random() * 30) + 10 : // 10-40 on weekends
      Math.floor(Math.random() * 80) + 40;  // 40-120 on weekdays
    
    // Add time trend (slight growth)
    baseCount = Math.floor(baseCount * (1 + (90 - i) * 0.005));
    
    // Add by content type
    accessPatterns[dateKey] = {
      total: baseCount,
      byType: {
        image: Math.floor(baseCount * (0.3 + Math.random() * 0.1)),
        video: Math.floor(baseCount * (0.2 + Math.random() * 0.1)),
        document: Math.floor(baseCount * (0.25 + Math.random() * 0.1)),
        audio: Math.floor(baseCount * (0.1 + Math.random() * 0.05)),
        other: Math.floor(baseCount * (0.1 + Math.random() * 0.05))
      }
    };
  }
  
  // Create example data for relationships visualization
  // For simplicity, we'll use content type relationships
  
  // Relationship nodes (content types)
  const typeNodes = Object.keys(typeDistribution.byMimeType).map((mimeType, index) => {
    const [mainType, subType] = mimeType.split('/');
    return {
      id: `type-${index}`,
      label: mimeType,
      group: mainType,
      value: typeDistribution.byMimeType[mimeType].count,
      data: {
        count: typeDistribution.byMimeType[mimeType].count,
        size: typeDistribution.byMimeType[mimeType].size,
        mainType
      }
    };
  });
  
  // Relationship edges (connections between types)
  const typeEdges = [];
  
  // Create edges based on similar content types
  for (let i = 0; i < typeNodes.length; i++) {
    for (let j = i + 1; j < typeNodes.length; j++) {
      const nodeA = typeNodes[i];
      const nodeB = typeNodes[j];
      
      // Connect nodes of the same main type
      if (nodeA.data.mainType === nodeB.data.mainType) {
        typeEdges.push({
          id: `edge-${i}-${j}`,
          from: nodeA.id,
          to: nodeB.id,
          value: Math.min(nodeA.value, nodeB.value) * 0.5,
          title: `Relationship: ${nodeA.label} - ${nodeB.label}`,
          label: 'same type'
        });
      }
      
      // Connect some nodes of different types with weaker relationships
      else if (Math.random() < 0.2) {
        typeEdges.push({
          id: `edge-cross-${i}-${j}`,
          from: nodeA.id,
          to: nodeB.id,
          value: Math.min(nodeA.value, nodeB.value) * 0.1,
          title: `Cross-type: ${nodeA.label} - ${nodeB.label}`,
          label: 'cross type',
          dashes: true
        });
      }
    }
  }
  
  // Compile all data into a single object
  return {
    entries,
    typeDistribution,
    sizeDistribution,
    storageDistribution,
    timeDistribution,
    tagDistribution,
    tagCooccurrence,
    accessPatterns,
    relationships: {
      nodes: typeNodes,
      edges: typeEdges
    }
  };
}

/**
 * Refresh the visualization with the latest data
 */
function refreshVisualization() {
  // This would typically fetch data from the PyArrow index
  // For this example, we'll use the sample data
  const data = generateExampleData();
  
  // Get current selected visualization type
  const visualizationType = document.getElementById('visualization-type').value;
  
  // Update the appropriate visualization
  switch (visualizationType) {
    case 'overview':
      updateOverviewVisualization(data);
      break;
    case 'timeline':
      updateTimelineVisualization(data);
      break;
    case 'relationships':
      updateRelationshipsVisualization(data);
      break;
    case 'tags':
      updateTagCloudVisualization(data);
      break;
    case 'patterns':
      updatePatternsVisualization(data);
      break;
  }
}

/**
 * Update the overview visualization with the provided data
 * 
 * @param {Object} data - The data for visualization
 */
function updateOverviewVisualization(data) {
  // Get filter values
  const groupBy = document.getElementById('overview-group-by').value;
  const chartType = document.getElementById('overview-chart-type').value;
  const limit = parseInt(document.getElementById('overview-limit').value);
  
  // Prepare data based on grouping
  let chartData;
  let title;
  let metricName;
  
  switch (groupBy) {
    case 'type':
      // Group by content type
      chartData = prepareChartData(data.typeDistribution.byMainType, limit);
      title = 'Content Distribution by Type';
      metricName = 'Content Type';
      break;
    case 'size':
      // Group by size range
      chartData = prepareChartData(data.sizeDistribution, limit);
      title = 'Content Distribution by Size';
      metricName = 'Size Range';
      break;
    case 'location':
      // Group by storage location
      chartData = prepareChartData(data.storageDistribution, limit);
      title = 'Content Distribution by Storage Location';
      metricName = 'Storage Location';
      break;
    case 'date':
      // Group by date (monthly)
      const dateData = {};
      Object.entries(data.timeDistribution).forEach(([month, stats]) => {
        dateData[month] = { count: stats.count, size: stats.size };
      });
      chartData = prepareChartData(dateData, limit);
      title = 'Content Distribution by Month';
      metricName = 'Month';
      break;
    case 'tag':
      // Group by tag
      const tagData = {};
      Object.entries(data.tagDistribution).forEach(([tag, stats]) => {
        tagData[tag] = { count: stats.count, size: stats.size };
      });
      chartData = prepareChartData(tagData, limit);
      title = 'Content Distribution by Tag';
      metricName = 'Tag';
      break;
  }
  
  // Update chart title
  document.querySelector('.primary-chart .chart-title').textContent = title;
  
  // Render primary chart
  renderOverviewChart('overview-primary-chart', chartData, chartType);
  
  // Render secondary chart (size by type)
  renderSizeByTypeChart('overview-secondary-chart', data);
  
  // Update breakdown table
  updateBreakdownTable(chartData, metricName);
}

/**
 * Prepare chart data from raw data
 * 
 * @param {Object} rawData - The raw data object
 * @param {number} limit - The maximum number of items to include
 * @returns {Object} Processed chart data
 */
function prepareChartData(rawData, limit) {
  // Convert data to array and sort by count
  let dataArray = Object.entries(rawData).map(([key, value]) => ({
    label: key,
    count: value.count || 0,
    size: value.size || 0,
    color: getColorForLabel(key)
  }));
  
  // Sort by count (descending)
  dataArray.sort((a, b) => b.count - a.count);
  
  // Apply limit if specified
  if (limit > 0) {
    // If we have more items than the limit, create an "Other" category
    if (dataArray.length > limit) {
      const topItems = dataArray.slice(0, limit);
      const otherItems = dataArray.slice(limit);
      
      const otherCount = otherItems.reduce((sum, item) => sum + item.count, 0);
      const otherSize = otherItems.reduce((sum, item) => sum + item.size, 0);
      
      dataArray = [
        ...topItems,
        { 
          label: 'Other', 
          count: otherCount, 
          size: otherSize,
          color: '#808080'
        }
      ];
    }
  }
  
  return dataArray;
}

/**
 * Get a consistent color for a label
 * 
 * @param {string} label - The label to get a color for
 * @returns {string} The color in hex format
 */
function getColorForLabel(label) {
  // Simple hash function to generate a color
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to hex color
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
}

/**
 * Render the overview chart
 * 
 * @param {string} canvasId - The ID of the canvas element
 * @param {Array} data - The chart data
 * @param {string} chartType - The type of chart to render
 */
function renderOverviewChart(canvasId, data, chartType) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Destroy existing chart if it exists
  if (window.overviewChart) {
    window.overviewChart.destroy();
  }
  
  // Format based on chart type
  let chartConfig;
  
  switch (chartType) {
    case 'pie':
      chartConfig = {
        type: 'pie',
        data: {
          labels: data.map(item => item.label),
          datasets: [{
            data: data.map(item => item.count),
            backgroundColor: data.map(item => item.color)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.raw || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            }
          }
        }
      };
      break;
    
    case 'bar':
      chartConfig = {
        type: 'bar',
        data: {
          labels: data.map(item => item.label),
          datasets: [{
            label: 'Count',
            data: data.map(item => item.count),
            backgroundColor: data.map(item => item.color)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          },
          plugins: {
            legend: {
              display: false
            }
          }
        }
      };
      break;
    
    case 'treemap':
      // Create treemap dataset structure
      const treemapData = {
        datasets: [{
          tree: data.map(item => ({
            value: item.count,
            label: item.label,
            backgroundColor: item.color
          })),
          key: 'count',
          groups: ['label'],
          spacing: 2,
          borderWidth: 1,
          borderColor: '#fff',
          backgroundColor: data.map(item => item.color)
        }]
      };
      
      chartConfig = {
        type: 'treemap',
        data: treemapData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.raw.l || '';
                  const value = context.raw.v || 0;
                  const total = data.reduce((sum, item) => sum + item.count, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            },
            legend: {
              display: false
            }
          }
        }
      };
      break;
    
    case 'polarArea':
      chartConfig = {
        type: 'polarArea',
        data: {
          labels: data.map(item => item.label),
          datasets: [{
            data: data.map(item => item.count),
            backgroundColor: data.map(item => item.color)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.raw || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            }
          }
        }
      };
      break;
  }
  
  // Create new chart instance
  window.overviewChart = new Chart(ctx, chartConfig);
}

/**
 * Render the size by type chart
 * 
 * @param {string} canvasId - The ID of the canvas element
 * @param {Object} data - The visualization data
 */
function renderSizeByTypeChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Destroy existing chart if it exists
  if (window.sizeByTypeChart) {
    window.sizeByTypeChart.destroy();
  }
  
  // Prepare data
  const typeLabels = Object.keys(data.typeDistribution.byMainType);
  const typeSizes = typeLabels.map(type => data.typeDistribution.byMainType[type].size);
  const typeColors = typeLabels.map(type => getColorForLabel(type));
  
  // Create new chart instance
  window.sizeByTypeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: typeLabels,
      datasets: [{
        label: 'Total Size',
        data: typeSizes,
        backgroundColor: typeColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              // Format byte values to human-readable form
              return formatBytes(value);
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.raw || 0;
              return `${label}: ${formatBytes(value)}`;
            }
          }
        }
      }
    }
  });
}

/**
 * Update the breakdown table
 * 
 * @param {Array} data - The chart data
 * @param {string} categoryName - The name of the category
 */
function updateBreakdownTable(data, categoryName) {
  const tableBody = document.getElementById('overview-table-body');
  if (!tableBody) return;
  
  // Clear existing rows
  tableBody.innerHTML = '';
  
  // Calculate totals
  const totalCount = data.reduce((sum, item) => sum + item.count, 0);
  const totalSize = data.reduce((sum, item) => sum + item.size, 0);
  
  // Add rows for each item
  data.forEach(item => {
    const row = document.createElement('tr');
    
    // Category cell
    const categoryCell = document.createElement('td');
    categoryCell.textContent = item.label;
    row.appendChild(categoryCell);
    
    // Count cell
    const countCell = document.createElement('td');
    countCell.textContent = item.count.toLocaleString();
    row.appendChild(countCell);
    
    // Size cell
    const sizeCell = document.createElement('td');
    sizeCell.textContent = formatBytes(item.size);
    row.appendChild(sizeCell);
    
    // Average size cell
    const avgSizeCell = document.createElement('td');
    avgSizeCell.textContent = item.count > 0 ? formatBytes(item.size / item.count) : '0 B';
    row.appendChild(avgSizeCell);
    
    // Percentage cell
    const percentCell = document.createElement('td');
    const percent = totalCount > 0 ? (item.count / totalCount * 100).toFixed(1) : '0.0';
    percentCell.textContent = `${percent}%`;
    row.appendChild(percentCell);
    
    // Actions cell
    const actionsCell = document.createElement('td');
    
    const viewButton = document.createElement('button');
    viewButton.className = 'table-action-btn';
    viewButton.innerHTML = '<i class="fas fa-search"></i>';
    viewButton.title = `View ${item.label} content`;
    viewButton.addEventListener('click', () => {
      // This would filter the content list to show only items of this category
      console.log(`View ${item.label} content`);
    });
    actionsCell.appendChild(viewButton);
    
    const detailsButton = document.createElement('button');
    detailsButton.className = 'table-action-btn';
    detailsButton.innerHTML = '<i class="fas fa-chart-bar"></i>';
    detailsButton.title = `Analyze ${item.label} details`;
    detailsButton.addEventListener('click', () => {
      // This would show detailed analysis for this category
      console.log(`Analyze ${item.label} details`);
    });
    actionsCell.appendChild(detailsButton);
    
    row.appendChild(actionsCell);
    
    tableBody.appendChild(row);
  });
}

/**
 * Update the timeline visualization with the provided data
 * 
 * @param {Object} data - The data for visualization
 */
function updateTimelineVisualization(data) {
  // Implementation for timeline visualization
  // This would use the data.timeDistribution and data.accessPatterns
}

/**
 * Update the relationships visualization with the provided data
 * 
 * @param {Object} data - The data for visualization
 */
function updateRelationshipsVisualization(data) {
  // Implementation for relationships visualization
  // This would use data.relationships to create a graph visualization
}

/**
 * Update the tag cloud visualization with the provided data
 * 
 * @param {Object} data - The data for visualization
 */
function updateTagCloudVisualization(data) {
  // Implementation for tag cloud visualization
  // This would use data.tagDistribution to create the tag cloud
}

/**
 * Update the patterns visualization with the provided data
 * 
 * @param {Object} data - The data for visualization
 */
function updatePatternsVisualization(data) {
  // Implementation for patterns visualization
  // This would use data.accessPatterns for usage analytics
}

/**
 * Format bytes to human-readable string
 * 
 * @param {number} bytes - The size in bytes
 * @param {number} decimals - The number of decimal places
 * @returns {string} Formatted size string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Show content details in the detail panel
 * 
 * @param {Object} content - The content item to show details for
 */
function showContentDetails(content) {
  const detailPanel = document.querySelector('.detail-panel');
  const detailContent = detailPanel.querySelector('.detail-content');
  
  // Clear existing content
  detailContent.innerHTML = '';
  
  // Create content details
  const details = document.createElement('div');
  details.className = 'content-details';
  
  // Add details based on content type
  if (content.mime_type && content.mime_type.startsWith('image/')) {
    // Add image preview
    const preview = document.createElement('div');
    preview.className = 'detail-preview';
    preview.innerHTML = `
      <img src="https://ipfs.io/ipfs/${content.cid}" alt="${content.name || content.path}" class="detail-image">
    `;
    details.appendChild(preview);
  }
  
  // Add metadata table
  const metadataTable = document.createElement('table');
  metadataTable.className = 'detail-table';
  
  // Add content properties
  const addDetailRow = (label, value) => {
    const row = document.createElement('tr');
    
    const labelCell = document.createElement('th');
    labelCell.textContent = label;
    row.appendChild(labelCell);
    
    const valueCell = document.createElement('td');
    valueCell.textContent = value;
    row.appendChild(valueCell);
    
    metadataTable.appendChild(row);
  };
  
  addDetailRow('Name', content.name || 'Unknown');
  addDetailRow('Path', content.path || 'N/A');
  addDetailRow('CID', content.cid);
  addDetailRow('MIME Type', content.mime_type || 'Unknown');
  addDetailRow('Size', formatBytes(content.size));
  addDetailRow('Created', new Date(content.timestamp).toLocaleString());
  addDetailRow('Storage Location', content.location);
  addDetailRow('Pinned', content.pinned ? 'Yes' : 'No');
  
  if (content.tags && content.tags.length > 0) {
    const tagsValue = content.tags.join(', ');
    addDetailRow('Tags', tagsValue);
  }
  
  details.appendChild(metadataTable);
  
  // Add action buttons
  const actionButtons = document.createElement('div');
  actionButtons.className = 'detail-actions';
  
  const viewButton = document.createElement('button');
  viewButton.className = 'primary-btn';
  viewButton.innerHTML = '<i class="fas fa-external-link-alt"></i> View in Gateway';
  viewButton.addEventListener('click', () => {
    window.open(`https://ipfs.io/ipfs/${content.cid}`, '_blank');
  });
  actionButtons.appendChild(viewButton);
  
  const pinButton = document.createElement('button');
  pinButton.innerHTML = content.pinned ? 
    '<i class="fas fa-unlink"></i> Unpin' : 
    '<i class="fas fa-thumbtack"></i> Pin';
  pinButton.addEventListener('click', () => {
    // Handle pin/unpin action
    console.log(`${content.pinned ? 'Unpin' : 'Pin'} ${content.cid}`);
  });
  actionButtons.appendChild(pinButton);
  
  details.appendChild(actionButtons);
  
  // Add to the detail content
  detailContent.appendChild(details);
  
  // Show the detail panel
  detailPanel.style.display = 'block';
}

// Export the module functions
module.exports = {
  createDiscoveryPanel,
  refreshVisualization,
  showContentDetails
};