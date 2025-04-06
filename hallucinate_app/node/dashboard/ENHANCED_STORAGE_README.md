# Enhanced Storage Visualization Integration

This package provides enhanced visualization capabilities for the storage location distribution in the PyArrow Content Index Dashboard. It adds a toggle button that allows users to switch between a basic view (the original implementation) and an enhanced view with interactive features.

## Features

The enhanced storage visualization includes:

- **Toggle View**: Switch between basic and enhanced visualizations
- **Interactive Filtering**: Group data by location, provider type, or protocol
- **Multiple Chart Types**: View data as bar charts, pie charts, or radar charts
- **Metric Selection**: Analyze by content count or total size
- **Multi-Chart Visualization**: See primary distribution alongside type breakdown and timeline views
- **Detailed Analytics Table**: Comprehensive view of all storage metadata

## Installation

The integration is designed to work seamlessly with the existing PyArrow Content Index Dashboard. To install:

1. Ensure all files are in the correct location:
   - Enhanced visualization components: `enhanced_storage/storage_visualization.js`
   - Integration module: `storage_integration.js`
   - Loader script: `load_enhanced_storage.js`

2. Verify the CSS styles are in the dashboard CSS file: `pyarrow_content_index_dashboard.css`
   - The required CSS classes for the enhanced view have already been added

## Usage

### Automatic Integration

The simplest way to integrate the enhanced storage visualization is to load the loader script in your dashboard HTML:

```html
<script src="./dashboard/load_enhanced_storage.js"></script>
```

This will automatically:
1. Wait for the dashboard to initialize
2. Patch the dashboard's storage location chart method
3. Add the enhanced visualization toggle

### Manual Integration

If you prefer more control over the integration process, you can manually integrate the component:

```javascript
const { integrateEnhancedStorageVisualization } = require('./dashboard/storage_integration.js');

// After dashboard initialization
const dashboard = window.contentIndexDashboard;
integrateEnhancedStorageVisualization(dashboard);
```

### Integration with Existing Code

If you need to modify the existing dashboard file directly, you can add the following code to initialize the integration:

```javascript
// In your dashboard initialization code
document.addEventListener('DOMContentLoaded', () => {
  try {
    const { integrateEnhancedStorageVisualization } = require('./storage_integration.js');
    integrateEnhancedStorageVisualization(this);
  } catch (error) {
    console.error('Failed to load enhanced storage visualization:', error);
  }
});
```

## User Interface

When successfully integrated, the storage location chart section will include:

1. A toggle button at the top to switch between "Basic View" and "Enhanced View"
2. The basic view shows the original chart and table
3. The enhanced view includes:
   - Filter controls for grouping, chart type, and metric
   - A primary distribution chart (configurable chart type)
   - A storage type breakdown chart (doughnut)
   - A storage timeline chart (line)
   - A detailed analytics table with comprehensive storage information

## Development

### File Structure

- `enhanced_storage/storage_visualization.js`: Core visualization components
- `storage_integration.js`: Integration module for patching the dashboard
- `load_enhanced_storage.js`: Auto-loader script
- `ENHANCED_STORAGE_README.md`: This documentation

### Custom Modifications

If you need to customize the enhanced visualization:

1. Modify the `storage_visualization.js` file to adjust the visualization components
2. For CSS changes, update the styles in `pyarrow_content_index_dashboard.css`
3. For integration changes, modify the `storage_integration.js` file

## Troubleshooting

If the enhanced visualization does not appear:

1. Check the browser console for errors
2. Verify all required files are in the correct locations
3. Ensure the CSS styles are properly loaded
4. Confirm the dashboard instance is properly initialized before integration

## License

This component is part of the hallucinate_app project and falls under the same license.

## Contributors

This enhanced storage visualization was developed as part of the hallucinate_app project.