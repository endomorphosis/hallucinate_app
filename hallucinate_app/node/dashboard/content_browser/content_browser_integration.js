/**
 * Content Browser Integration
 * 
 * This module integrates the metadata browser, search interface, and storage distribution 
 * components with the PyArrow Content Index Dashboard.
 * 
 * @module dashboard/content_browser/content_browser_integration
 */

// Import the UI components
import { MetadataBrowser } from './metadata_browser.js';
import { SearchInterface } from './search_interface.js';
import { StorageDistribution } from './storage_distribution.js';

// Import styles
import './styles.css';
import './storage_distribution.css';

/**
 * Integrates the content browser components with the PyArrow Content Index Dashboard
 * 
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.container - The container element to render components in
 * @param {Object} options.bridge - The PyArrow index bridge or secure manager
 * @param {Object} options.eventBus - Event bus for component communication
 * @param {Object} options.config - Configuration options
 * @param {Object} options.chartLibrary - Chart library for visualizations (e.g., Chart.js)
 * @returns {Object} - Integration result with component instances
 */
export async function initializeContentBrowser(options = {}) {
  const { container, bridge, eventBus, config = {}, chartLibrary } = options;

  if (!container) {
    throw new Error('Container element is required');
  }

  if (!bridge) {
    throw new Error('PyArrow index bridge or secure manager is required');
  }
  
  // Check if Chart.js is available for visualizations
  const chartLib = chartLibrary || (typeof window !== 'undefined' ? window.Chart : null);
  
  if (!chartLib) {
    console.warn('Chart.js not detected. Visualizations will have limited functionality.');
  }

  // Create container elements for components
  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-interface-container';
  
  const metadataContainer = document.createElement('div');
  metadataContainer.className = 'metadata-browser-container';
  
  const storageDistributionContainer = document.createElement('div');
  storageDistributionContainer.className = 'storage-distribution-container';
  storageDistributionContainer.style.display = 'none'; // Hide initially

  // Add containers to the main container
  container.appendChild(searchContainer);
  container.appendChild(metadataContainer);
  container.appendChild(storageDistributionContainer);

  // Create tab navigation
  const tabNav = document.createElement('div');
  tabNav.className = 'content-browser-tabs';
  tabNav.innerHTML = `
    <button class="tab-button active" data-tab="browser">Browser</button>
    <button class="tab-button" data-tab="statistics">Storage Statistics</button>
  `;
  container.insertBefore(tabNav, container.firstChild);

  // Create event bus if not provided
  const localEventBus = eventBus || {
    listeners: {},
    on(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
      return this;
    },
    emit(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(callback => callback(data));
      }
      return this;
    }
  };

  // Create and initialize the search interface
  const searchInterface = new SearchInterface({
    container: searchContainer,
    bridge: bridge,
    eventBus: localEventBus,
    config: config.searchConfig || {}
  });

  // Create and initialize the metadata browser
  const metadataBrowser = new MetadataBrowser({
    container: metadataContainer,
    bridge: bridge,
    eventBus: localEventBus,
    config: config.browserConfig || {}
  });
  
  // Create and initialize the storage distribution visualization
  const storageDistribution = new StorageDistribution({
    container: storageDistributionContainer,
    bridge: bridge,
    eventBus: localEventBus,
    chartLibrary: chartLib,
    config: config.distributionConfig || {}
  });

  // Initialize components
  await searchInterface.init();
  await metadataBrowser.init();
  await storageDistribution.init();

  // Connect components with event listeners
  searchInterface.on('search', (query) => {
    metadataBrowser.applyFilter({ query });
  });

  searchInterface.on('filter-change', (filters) => {
    metadataBrowser.applyFilter(filters);
  });

  metadataBrowser.on('selection-change', (selectedItem) => {
    // If an event bus was provided, propagate the selection event
    if (eventBus) {
      eventBus.emit('metadata-item-selected', selectedItem);
    }
  });

  // Handle real-time updates
  localEventBus.on('content-index-updated', (updateData) => {
    // Refresh all components when content is updated
    metadataBrowser.refresh(true);
    storageDistribution.refresh(true);
    
    // Update the search interface with new suggestions
    if (updateData && updateData.type) {
      searchInterface.refreshSuggestions();
    }
  });
  
  // Set up tab navigation
  tabNav.querySelectorAll('.tab-button').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      tabNav.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show/hide content based on selected tab
      const tabName = tab.dataset.tab;
      
      if (tabName === 'browser') {
        searchContainer.style.display = 'block';
        metadataContainer.style.display = 'block';
        storageDistributionContainer.style.display = 'none';
      } else if (tabName === 'statistics') {
        searchContainer.style.display = 'none';
        metadataContainer.style.display = 'none';
        storageDistributionContainer.style.display = 'block';
        
        // Refresh storage distribution when tab is selected
        storageDistribution.refresh(true);
        
        // Emit event for tab change
        localEventBus.emit('tab-changed', tabName);
      }
    });
  });
  
  // Storage distribution integration
  storageDistribution.on('storage-distribution:location-clicked', (data) => {
    // When a location is clicked in the chart, switch to browser tab and filter by location
    const locationTab = tabNav.querySelector('.tab-button[data-tab="browser"]');
    if (locationTab) {
      locationTab.click();
      
      // Apply filter to metadata browser
      if (data && data.location) {
        metadataBrowser.applyFilter({ location: data.location });
      }
    }
  });
  
  storageDistribution.on('storage-distribution:type-clicked', (data) => {
    // When a content type is clicked in the chart, switch to browser tab and filter by type
    const browserTab = tabNav.querySelector('.tab-button[data-tab="browser"]');
    if (browserTab) {
      browserTab.click();
      
      // Apply filter to metadata browser
      if (data && data.type) {
        metadataBrowser.applyFilter({ mimetype: data.type });
      }
    }
  });
  
  storageDistribution.on('storage-distribution:size-clicked', (data) => {
    // When a size range is clicked in the chart, switch to browser tab and filter by size
    const browserTab = tabNav.querySelector('.tab-button[data-tab="browser"]');
    if (browserTab) {
      browserTab.click();
      
      // Apply filter to metadata browser (if size filtering is implemented)
      if (data && data.sizeRange) {
        metadataBrowser.applyFilter({ size_range: data.sizeRange });
      }
    }
  });

  return {
    success: true,
    metadataBrowser,
    searchInterface,
    storageDistribution,
    container,
    dispose: () => {
      // Clean up resources when components are no longer needed
      searchInterface.dispose();
      metadataBrowser.dispose();
      storageDistribution.dispose();
    }
  };
}

// Add CSS styles for tab navigation
const tabStyles = `
.content-browser-tabs {
  display: flex;
  margin-bottom: 16px;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 0;
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  color: #718096;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.tab-button:hover {
  color: #4a5568;
}

.tab-button.active {
  border-bottom-color: #4299e1;
  color: #2d3748;
}

/* Dark mode support */
.dark-mode .content-browser-tabs {
  border-bottom-color: #4a5568;
}

.dark-mode .tab-button {
  color: #a0aec0;
}

.dark-mode .tab-button:hover {
  color: #e2e8f0;
}

.dark-mode .tab-button.active {
  border-bottom-color: #4299e1;
  color: #f7fafc;
}
`;

// Inject styles if in browser environment
if (typeof document !== 'undefined') {
  // Check if styles are already added
  if (!document.getElementById('content-browser-tab-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'content-browser-tab-styles';
    styleEl.textContent = tabStyles;
    document.head.appendChild(styleEl);
  }
}

export default initializeContentBrowser;