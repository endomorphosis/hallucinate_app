# Database Visualization for Content Discovery

This package provides advanced database visualization tools for the PyArrow Content Index Dashboard. It adds interactive charts, relationship graphs, timeline visualizations, and filtering capabilities to help users discover and analyze content in the IPFS database.

## Features

The database visualization module includes:

- **Content Overview**: Multi-dimensional visualization of content distribution by:
  - Content type
  - Size range
  - Storage location
  - Creation date
  - Tags
  
- **Timeline View**: Temporal analysis of content with:
  - Time-based trends
  - Activity heatmaps
  - Change tracking
  - Temporal filtering
  
- **Relationship Visualization**: Interactive graph visualization showing:
  - Content type relationships
  - Storage location connections
  - Tag similarity networks
  - Content similarity clusters
  
- **Tag Cloud**: Interactive tag exploration with:
  - Tag frequency visualization
  - Timeline of tag usage
  - Tag co-occurrence analysis
  - Filtering by content type and time period
  
- **Usage Patterns**: Advanced analytics including:
  - Access frequency analysis
  - Content popularity metrics
  - Anomaly detection
  - Predictive analysis
  
- **Interactive Elements**:
  - Multiple chart types (pie, bar, treemap, radar, etc.)
  - Interactive filtering and grouping
  - Detailed breakdowns and analytics tables
  - Content selection and drill-down

## Installation

The component is designed to integrate seamlessly with the existing PyArrow Content Index Dashboard. To install:

1. Ensure all files are in the correct locations:
   - Core visualization: `content_discovery/discovery_visualization.js`
   - Integration module: `content_discovery/discovery_integration.js`
   - Loader script: `load_content_discovery.js`

2. Add the required libraries:
   - Chart.js (v3.7.1 or later)
   - Chart.js Treemap plugin (if using treemap visualization)

## Usage

### Automatic Integration

The simplest way to integrate the database visualization is to load the loader script in your dashboard HTML:

```html
<script src="./dashboard/load_content_discovery.js"></script>
```

This will automatically:
1. Load Chart.js and required plugins if not already present
2. Wait for dashboard initialization
3. Add the "Discovery" tab with all visualization components

### Manual Integration

If you prefer more control over the integration process, you can manually integrate the component:

```javascript
const { integrateDiscoveryVisualization } = require('./dashboard/content_discovery/discovery_integration.js');

// After dashboard initialization
const dashboard = window.contentIndexDashboard;
integrateDiscoveryVisualization(dashboard, {
  enableChartAnimation: true,
  enableTreemapChart: true,
  enableRelationshipGraph: true,
  enableTagCloud: true,
  dataRefreshInterval: 300000,
  maxDataPoints: 500,
  colorScheme: 'default'
});
```

### Configuration Options

The visualization can be configured with several options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableChartAnimation` | Boolean | `true` | Whether to animate charts when they update |
| `enableTreemapChart` | Boolean | `true` | Whether to include treemap chart types |
| `enableRelationshipGraph` | Boolean | `true` | Whether to enable the relationship visualization |
| `enableTagCloud` | Boolean | `true` | Whether to include the tag cloud visualization |
| `dataRefreshInterval` | Number | `300000` | Auto-refresh interval in milliseconds (5 min) |
| `maxDataPoints` | Number | `500` | Maximum number of data points to include in charts |
| `colorScheme` | String | `'default'` | Color scheme for charts ('default', 'monochrome', 'colorful') |

### Integration with Existing Code

If you need to modify the existing dashboard file directly, you can add the following code to initialize the integration:

```javascript
// In your dashboard initialization code
document.addEventListener('DOMContentLoaded', () => {
  try {
    const { integrateDiscoveryVisualization } = require('./content_discovery/discovery_integration.js');
    integrateDiscoveryVisualization(this);
  } catch (error) {
    console.error('Failed to load database visualization:', error);
  }
});
```

## User Interface

When successfully integrated, the dashboard will include a new "Discovery" tab with these views:

1. **Content Overview**: Shows distribution visualizations with options for:
   - Grouping by different content properties
   - Choosing different chart types (pie, bar, treemap, polar area)
   - Filtering to top N items
   - Detailed breakdown table with key metrics

2. **Timeline View**: Shows temporal patterns with:
   - Main timeline chart showing content changes over time
   - Activity heatmap for time-of-day/day-of-week patterns
   - Recent activity table with content actions

3. **Relationships**: Shows content relationships with:
   - Interactive graph visualization of content connections
   - Multiple layout options (force-directed, circular, hierarchical)
   - Depth control and filtering
   - Graph statistics and legend

4. **Tag Cloud**: Shows tag analysis with:
   - Interactive tag cloud sized by frequency
   - Tag frequency timeline over time
   - Tag co-occurrence visualization
   - Detailed tag analysis table

5. **Usage Patterns**: Shows usage analytics with:
   - Access frequency charts
   - Content popularity metrics
   - Access patterns by content type
   - Predictive analysis and anomaly detection

## Data Sources

By default, the visualization uses the following data from the PyArrow Content Index:

- Content metadata from index entries
- Content type distribution statistics
- Size distribution metrics
- Storage location information
- Temporal metadata (creation dates, update times)
- Tag information and relationships
- Access statistics (if available)

## Customization

### Adding New Visualizations

To add a new visualization type to the discovery panel:

1. Create a new visualization container function in `discovery_visualization.js`
2. Add a new option to the view selector in `createDiscoveryPanel()`
3. Implement the corresponding update function
4. Add event handling in the view selector change handler

### Custom Chart Types

To use a custom chart type:

1. Include the Chart.js plugin for your chart type
2. Add a new option to the chart type selector in the appropriate visualization
3. Add a new case in the chart rendering function to handle the custom type

### Custom Data Processing

To implement custom data processing:

1. Modify the `generateExampleData()` function to include your data structure
2. Update the data processing functions to handle the new data
3. Add visualization options to display the new data

## Browser Compatibility

The visualization component is compatible with modern browsers:
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Chart.js itself requires a browser with Canvas support.

## Troubleshooting

If visualizations don't appear:

1. Check browser console for errors
2. Verify Chart.js is properly loaded
3. Ensure the dashboard is initialized before integration
4. Check if the content index has data to visualize
5. Try refreshing the visualizations manually

## License

This component is part of the hallucinate_app project and falls under the same license.

## Contributors

This database visualization for content discovery was developed as part of the hallucinate_app project to meet the requirements outlined in Phase 2.3 UI Components of the project roadmap.