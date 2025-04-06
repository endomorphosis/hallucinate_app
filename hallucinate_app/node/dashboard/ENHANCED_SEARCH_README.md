# Enhanced Search Interface for Content Discovery

This package provides advanced search capabilities for the PyArrow Content Index Dashboard. It enhances the existing search functionality with advanced filtering, saved searches, and search history tracking.

## Features

The enhanced search interface includes:

- **Advanced Search Form**: Search by multiple criteria including:
  - Content ID (CID)
  - File Path
  - File Name
  - MIME Type (with predefined options)
  - File Size Range
  - Creation Date Range
  - Storage Location
  - Pin Status
  - Tags

- **Saved Searches**: Save frequently used search queries for later use:
  - Name and describe your searches
  - Apply saved searches with a single click
  - Manage saved searches through a dedicated modal

- **Search History**: Track your search activity:
  - Automatically records all searches
  - Shows result counts
  - Rerun previous searches
  - Clear individual or all history items

- **Active Filters Indicator**: Shows when filters are active and allows quick clearing

## Installation

The integration is designed to work seamlessly with the existing PyArrow Content Index Dashboard. To install:

1. Ensure all files are in the correct location:
   - Enhanced search components: `enhanced_search/search_discovery.js`
   - Integration module: `enhanced_search/search_integration.js`
   - Loader script: `load_enhanced_search.js`

2. The required CSS styles are already included in the dashboard CSS file: `pyarrow_content_index_dashboard.css`

## Usage

### Automatic Integration

The simplest way to integrate the enhanced search functionality is to load the loader script in your dashboard HTML:

```html
<script src="./dashboard/load_enhanced_search.js"></script>
```

This will automatically:
1. Wait for the dashboard to initialize
2. Patch the dashboard's search controls and methods
3. Add the enhanced search functionality

### Manual Integration

If you prefer more control over the integration process, you can manually integrate the component:

```javascript
const { integrateEnhancedSearch } = require('./dashboard/enhanced_search/search_integration.js');

// After dashboard initialization
const dashboard = window.contentIndexDashboard;
integrateEnhancedSearch(dashboard);
```

### Integration with Existing Code

If you need to modify the existing dashboard file directly, you can add the following code to initialize the integration:

```javascript
// In your dashboard initialization code
document.addEventListener('DOMContentLoaded', () => {
  try {
    const { integrateEnhancedSearch } = require('./enhanced_search/search_integration.js');
    integrateEnhancedSearch(this);
  } catch (error) {
    console.error('Failed to load enhanced search functionality:', error);
  }
});
```

## User Interface

When successfully integrated, the search controls section will include:

1. **Basic Search Box**:
   - Text input for simple searches
   - Search button
   - Advanced button to toggle the advanced search panel

2. **Advanced Search Panel**:
   - Multiple search fields organized in a grid
   - Apply, Save, and Reset buttons for managing searches

3. **History and Saved Searches**:
   - Buttons to access search history and saved searches modals
   - Active filters indicator when filters are applied

4. **Modals**:
   - Search History modal showing past searches
   - Saved Searches modal for managing saved searches
   - Save Search dialog for naming and describing new saved searches

## Data Storage

The enhanced search functionality uses localStorage to persist:

- **Saved Searches**: Stored as `pyarrow_saved_searches`
- **Search History**: Stored as `pyarrow_search_history`

This ensures that user preferences and search history are preserved between sessions.

## Development

### File Structure

- `enhanced_search/search_discovery.js`: Core UI components for search functionality
- `enhanced_search/search_integration.js`: Integration module for patching the dashboard
- `load_enhanced_search.js`: Auto-loader script
- `ENHANCED_SEARCH_README.md`: This documentation

### Custom Modifications

If you need to customize the enhanced search:

1. Modify the `search_discovery.js` file to adjust the UI components
2. For integration changes, modify the `search_integration.js` file
3. CSS styles are already in `pyarrow_content_index_dashboard.css`

## Troubleshooting

If the enhanced search does not appear:

1. Check the browser console for errors
2. Verify all required files are in the correct locations
3. Ensure the dashboard instance is properly initialized before integration
4. Check localStorage availability (private browsing may restrict access)

## License

This component is part of the hallucinate_app project and falls under the same license.

## Contributors

This enhanced search interface was developed as part of the hallucinate_app project to meet the requirements outlined in Phase 2.3 UI Components of the project roadmap.