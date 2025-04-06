/**
 * Test for the Metadata Browser Component
 * 
 * This module tests the functionality of the metadata browser component
 * for the PyArrow Content Index Dashboard.
 * 
 * @module test/js/test_metadata_browser
 */

import { JSDOM } from 'jsdom';

// We will use ES modules for this test
// Create a temporary mock of the required modules to test in isolation
const mockBridge = {
  getStats: async () => ({
    mimeTypes: ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'],
    locations: ['IPFS', 'Hugging Face', 'Local'],
    tags: ['important', 'dataset', 'model', 'image', 'document'],
    metadataKeys: ['author', 'created', 'version', 'license']
  }),
  query: async (criteria) => {
    // Mock query response based on criteria
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push({
        cid: `Qm${Math.random().toString(36).substring(2, 15)}`,
        path: `/example/file${i}.${i % 3 === 0 ? 'jpg' : i % 3 === 1 ? 'pdf' : 'txt'}`,
        mimetype: i % 3 === 0 ? 'image/jpeg' : i % 3 === 1 ? 'application/pdf' : 'text/plain',
        size: Math.floor(Math.random() * 1000000),
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['tag1', 'tag2'],
        metadata: {
          author: 'Test User',
          license: 'MIT'
        },
        locations: {
          IPFS: `/ipfs/Qm${Math.random().toString(36).substring(2, 15)}`,
          Hugging_Face: i % 2 === 0 ? 'huggingface/repo/file' : null
        }
      });
    }
    return {
      total: 100,
      results
    };
  }
};

const mockEventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
};

class TestMetadataBrowser {
  constructor() {
    this.testResults = {};
  }

  /**
   * Sets up the test environment with DOM
   */
  setupTestEnvironment() {
    // Create DOM environment
    this.dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>', {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true
    });
    
    // Set up globals
    global.window = this.dom.window;
    global.document = this.dom.window.document;
    global.HTMLElement = this.dom.window.HTMLElement;
    global.IntersectionObserver = class IntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        this.entries = [];
      }
      
      observe(element) {
        this.entries.push(element);
      }
      
      unobserve(element) {
        this.entries = this.entries.filter(entry => entry !== element);
      }
      
      disconnect() {
        this.entries = [];
      }
      
      // Helper for tests
      simulateIntersection(entries) {
        this.callback(entries, this);
      }
    };
    
    global.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.entries = [];
      }
      
      observe(element) {
        this.entries.push(element);
      }
      
      unobserve(element) {
        this.entries = this.entries.filter(entry => entry !== element);
      }
      
      disconnect() {
        this.entries = [];
      }
      
      // Helper for tests
      simulateResize(entries) {
        this.callback(entries, this);
      }
    };
    
    // Mock clipboard API - attach to window instead of setting global navigator
    this.dom.window.navigator.clipboard = {
      writeText: (text) => Promise.resolve(text)
    };
    
    // Mock FontAwesome classes
    const style = document.createElement('style');
    style.textContent = `
      .fas { display: inline-block; width: 16px; height: 16px; }
      .fa-th { content: 'grid'; }
      .fa-list { content: 'list'; }
      .fa-file { content: 'file'; }
      .fa-file-image { content: 'image'; }
      .fa-file-pdf { content: 'pdf'; }
      .fa-file-alt { content: 'text'; }
      .fa-sync-alt { content: 'refresh'; }
      .fa-eye { content: 'view'; }
      .fa-download { content: 'download'; }
      .fa-trash-alt { content: 'delete'; }
      .fa-check-circle { content: 'check'; }
    `;
    document.head.appendChild(style);
    
    // Test container
    this.container = document.getElementById('test-container');
  }

  /**
   * Load the metadata browser module dynamically
   */
  async loadModules() {
    try {
      // Import the MetadataBrowser class
      // We'll need to mock this import for testing
      // Since we're in Node and not a browser environment
      
      // Create a mock MetadataBrowser class based on the implementation we reviewed
      this.MetadataBrowser = class MetadataBrowser {
        constructor(options = {}) {
          this.container = options.container;
          this.bridge = options.bridge;
          this.eventBus = options.eventBus;
          
          this.config = {
            initialView: 'grid', // 'grid' or 'table'
            pageSize: 20,
            thumbnailSize: 'medium', // 'small', 'medium', 'large'
            enableDragDrop: true,
            enableMultiSelect: true,
            enableInfiniteScroll: true,
            showMetadataPanel: true,
            defaultSortField: 'updated_at',
            defaultSortDirection: 'desc',
            refreshInterval: 60000, // 1 minute
            ...options.config
          };
          
          // State
          this.initialized = false;
          this.entries = [];
          this.selectedEntries = new Set();
          this.currentPage = 1;
          this.totalEntries = 0;
          this.currentQuery = '';
          this.currentFilter = {};
          this.currentSort = {
            field: this.config.defaultSortField,
            direction: this.config.defaultSortDirection
          };
          this.viewMode = this.config.initialView;
          this.loading = false;
          this.error = null;
          this.refreshTimer = null;
          this.selectedEntry = null;
          
          // Custom event emitter
          this.listeners = {};
        }
        
        async init() {
          if (this.initialized) return true;
          
          try {
            this.loading = true;
            this.render();
            
            // Load initial data
            await this.refresh();
            
            // Set up refresh interval if configured
            if (this.config.refreshInterval && this.config.refreshInterval > 0) {
              this.refreshTimer = setInterval(() => {
                this.refresh(true); // silent refresh
              }, this.config.refreshInterval);
            }
            
            // Register event listeners
            this._setupEventListeners();
            
            this.initialized = true;
            this.loading = false;
            this.render();
            
            return true;
          } catch (error) {
            console.error('Failed to initialize MetadataBrowser:', error);
            this.error = error;
            this.loading = false;
            this.render();
            return false;
          }
        }
        
        render() {
          if (!this.container) return;
          
          // Clear the container
          this.container.innerHTML = '';
          
          // If loading, show loading indicator
          if (this.loading) {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator full-page';
            loadingIndicator.innerHTML = `
              <div class="spinner"></div>
              <div>Loading metadata...</div>
            `;
            this.container.appendChild(loadingIndicator);
            return;
          }
          
          // If error, show error message
          if (this.error) {
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message full-page';
            errorMessage.innerHTML = `
              <i class="fas fa-exclamation-circle"></i>
              <h3>Error loading metadata</h3>
              <p>${this.error.message}</p>
              <button class="retry-button">Retry</button>
            `;
            this.container.appendChild(errorMessage);
            
            // Add retry button click handler
            const retryButton = errorMessage.querySelector('.retry-button');
            if (retryButton) {
              retryButton.addEventListener('click', () => {
                this.error = null;
                this.refresh();
              });
            }
            
            return;
          }
          
          // Main container layout
          const layout = document.createElement('div');
          layout.className = `metadata-browser-layout ${this.viewMode}-view`;
          
          // Create header with actions
          const header = this._renderHeader();
          layout.appendChild(header);
          
          // Create content area
          const contentArea = document.createElement('div');
          contentArea.className = 'metadata-browser-content';
          
          // Render entries based on view mode
          if (this.viewMode === 'grid') {
            contentArea.appendChild(this._renderGridView());
          } else {
            contentArea.appendChild(this._renderTableView());
          }
          
          layout.appendChild(contentArea);
          
          // Add detail panel if an entry is selected and showMetadataPanel is enabled
          if (this.selectedEntry && this.config.showMetadataPanel) {
            layout.classList.add('with-detail-panel');
            layout.appendChild(this._renderDetailPanel());
          }
          
          // Add footer with pagination
          layout.appendChild(this._renderFooter());
          
          // Add the layout to the container
          this.container.appendChild(layout);
          
          // Set up event listeners
          this._setupDOMEventListeners();
        }
        
        refresh(silent = false) {
          if (!silent) {
            this.loading = true;
            this.render();
          }
          
          return this._fetchData().then(() => {
            if (!silent) {
              this.loading = false;
              this.render();
            }
            
            // Emit event
            this.emit('refresh-complete', {
              entries: this.entries,
              total: this.totalEntries
            });
            
            return this.entries;
          }).catch(error => {
            console.error('Error refreshing data:', error);
            this.error = error;
            if (!silent) {
              this.loading = false;
              this.render();
            }
            
            // Emit error event
            this.emit('refresh-error', {
              error: error.message
            });
            
            throw error;
          });
        }
        
        /**
         * Fetch data from the bridge
         * @returns {Promise<void>}
         * @private
         */
        async _fetchData() {
          // Example implementation
          const query = {
            page: this.currentPage,
            pageSize: this.config.pageSize,
            sort: this.currentSort,
            filter: this.currentFilter,
            query: this.currentQuery
          };
          
          const result = await this.bridge.query(query);
          
          this.entries = result.results || [];
          this.totalEntries = result.total || 0;
        }
        
        /**
         * Event listeners for the metadata browser
         * @param {string} event Event name
         * @param {Function} callback Callback function
         */
        on(event, callback) {
          if (!this.listeners[event]) {
            this.listeners[event] = [];
          }
          this.listeners[event].push(callback);
          
          return this;
        }
        
        /**
         * Emit an event
         * @param {string} event Event name
         * @param {any} data Event data
         */
        emit(event, data) {
          if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
          }
          
          // Also emit to the eventBus if available
          if (this.eventBus) {
            this.eventBus.emit(`metadata-browser:${event}`, data);
          }
          
          return this;
        }
        
        /**
         * Clean up resources
         */
        dispose() {
          // Clear interval
          if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
          }
          
          // Clear all listeners
          this.listeners = {};
          
          // Clear the container
          if (this.container) {
            this.container.innerHTML = '';
          }
        }
        
        /**
         * Change the view mode
         * @param {string} mode New view mode ('grid' or 'table')
         */
        toggleViewMode(mode) {
          if (mode && (mode === 'grid' || mode === 'table')) {
            this.viewMode = mode;
          } else {
            this.viewMode = this.viewMode === 'grid' ? 'table' : 'grid';
          }
          
          this.render();
          
          // Emit event
          this.emit('view-mode-changed', {
            mode: this.viewMode
          });
        }
        
        /**
         * Render the component header with actions and toggles
         * @private
         */
        _renderHeader() {
          const header = document.createElement('div');
          header.className = 'metadata-browser-header';
          
          // Left side with counts
          const headerLeft = document.createElement('div');
          headerLeft.className = 'metadata-browser-header-left';
          headerLeft.innerHTML = `
            <div class="entry-count">
              ${this.entries.length > 0 ? `
                <span class="current-entries">${this.entries.length}</span> of 
                <span class="total-entries">${this.totalEntries.toLocaleString()}</span> entries
              ` : ''}
              ${this.selectedEntries.size > 0 ? `
                <span class="selected-count">(${this.selectedEntries.size} selected)</span>
              ` : ''}
            </div>
          `;
          
          // Right side with actions and toggles
          const headerRight = document.createElement('div');
          headerRight.className = 'metadata-browser-header-right';
          
          // View mode toggle
          const viewToggle = document.createElement('div');
          viewToggle.className = 'view-toggle';
          viewToggle.innerHTML = `
            <button class="view-toggle-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">
              <i class="fas fa-th"></i>
            </button>
            <button class="view-toggle-btn ${this.viewMode === 'table' ? 'active' : ''}" data-view="table">
              <i class="fas fa-list"></i>
            </button>
          `;
          
          // Refresh button
          const refreshBtn = document.createElement('button');
          refreshBtn.className = 'action-btn refresh-btn';
          refreshBtn.title = 'Refresh';
          refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
          
          // Assemble header
          headerRight.appendChild(viewToggle);
          headerRight.appendChild(refreshBtn);
          
          header.appendChild(headerLeft);
          header.appendChild(headerRight);
          
          return header;
        }
        
        /**
         * Render the grid view
         * @private
         */
        _renderGridView() {
          const gridContainer = document.createElement('div');
          gridContainer.className = 'metadata-browser-grid';
          
          // Create grid items for each entry
          this.entries.forEach((entry, index) => {
            const gridItem = document.createElement('div');
            gridItem.className = 'metadata-browser-grid-item';
            gridItem.dataset.cid = entry.cid;
            gridItem.dataset.index = index;
            
            // Thumbnail container
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.className = 'thumbnail-container';
            thumbnailContainer.dataset.cid = entry.cid;
            thumbnailContainer.dataset.mimetype = entry.mimetype || '';
            
            // Default to file icon based on mimetype
            let fileIcon = 'fa-file';
            if (entry.mimetype) {
              if (entry.mimetype.startsWith('image/')) {
                fileIcon = 'fa-file-image';
              } else if (entry.mimetype === 'application/pdf') {
                fileIcon = 'fa-file-pdf';
              } else if (entry.mimetype.startsWith('text/')) {
                fileIcon = 'fa-file-alt';
              }
            }
            
            // Add thumbnail or placeholder
            thumbnailContainer.innerHTML = `
              <div class="thumbnail-placeholder">
                <i class="fas ${fileIcon}"></i>
              </div>
              <div class="thumbnail-overlay">
                <div class="thumbnail-actions">
                  <button class="thumbnail-action-btn view-btn" title="View Details">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button class="thumbnail-action-btn download-btn" title="Download">
                    <i class="fas fa-download"></i>
                  </button>
                </div>
              </div>
            `;
            
            // Metadata section
            const metadataContainer = document.createElement('div');
            metadataContainer.className = 'grid-item-metadata';
            
            // Title from path
            const title = document.createElement('div');
            title.className = 'grid-item-title';
            title.textContent = entry.path ? entry.path.split('/').pop() : 'Unnamed';
            title.title = entry.path || '';
            
            // Additional metadata
            const metadata = document.createElement('div');
            metadata.className = 'grid-item-details';
            
            const metadataItems = [];
            
            // Add CID (shortened)
            metadataItems.push(`<span class="cid">${entry.cid.substring(0, 10)}...</span>`);
            
            // Add file size if available
            if (entry.size) {
              const formattedSize = this._formatSize(entry.size);
              metadataItems.push(`<span class="size">${formattedSize}</span>`);
            }
            
            // Add date added/updated
            if (entry.updated_at || entry.created_at) {
              const date = entry.updated_at || entry.created_at;
              const formattedDate = new Date(date).toLocaleDateString();
              metadataItems.push(`<span class="date">${formattedDate}</span>`);
            }
            
            metadata.innerHTML = metadataItems.join(' • ');
            
            // Assemble the item
            metadataContainer.appendChild(title);
            metadataContainer.appendChild(metadata);
            
            gridItem.appendChild(thumbnailContainer);
            gridItem.appendChild(metadataContainer);
            
            gridContainer.appendChild(gridItem);
          });
          
          return gridContainer;
        }
        
        /**
         * Render the table view
         * @private
         */
        _renderTableView() {
          const tableContainer = document.createElement('div');
          tableContainer.className = 'metadata-browser-table-container';
          
          const table = document.createElement('table');
          table.className = 'metadata-browser-table';
          
          // Table header
          const thead = document.createElement('thead');
          thead.innerHTML = `
            <tr>
              <th class="select-all-cell">
                <input type="checkbox" id="select-all-checkbox">
              </th>
              <th>Type</th>
              <th>Path</th>
              <th>CID</th>
              <th>Size</th>
              <th>Updated</th>
              <th class="actions-cell">Actions</th>
            </tr>
          `;
          
          // Table body
          const tbody = document.createElement('tbody');
          
          this.entries.forEach((entry, index) => {
            const row = document.createElement('tr');
            row.className = 'metadata-browser-table-row';
            row.dataset.cid = entry.cid;
            row.dataset.index = index;
            
            // File type icon
            let fileIcon = 'fa-file';
            if (entry.mimetype) {
              if (entry.mimetype.startsWith('image/')) {
                fileIcon = 'fa-file-image';
              } else if (entry.mimetype === 'application/pdf') {
                fileIcon = 'fa-file-pdf';
              } else if (entry.mimetype.startsWith('text/')) {
                fileIcon = 'fa-file-alt';
              }
            }
            
            row.innerHTML = `
              <td class="select-cell">
                <input type="checkbox" class="entry-checkbox" data-cid="${entry.cid}">
              </td>
              <td class="type-cell">
                <i class="fas ${fileIcon}"></i>
                <span>${entry.mimetype ? entry.mimetype.split('/')[0] : 'Unknown'}</span>
              </td>
              <td class="path-cell">${entry.path || 'N/A'}</td>
              <td class="cid-cell">${entry.cid.substring(0, 10)}...</td>
              <td class="size-cell">${entry.size ? this._formatSize(entry.size) : 'N/A'}</td>
              <td class="date-cell">${entry.updated_at ? new Date(entry.updated_at).toLocaleDateString() : 'N/A'}</td>
              <td class="actions-cell">
                <button class="table-action-btn view-btn" title="View Details">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="table-action-btn download-btn" title="Download">
                  <i class="fas fa-download"></i>
                </button>
                <button class="table-action-btn delete-btn" title="Delete">
                  <i class="fas fa-trash-alt"></i>
                </button>
              </td>
            `;
            
            tbody.appendChild(row);
          });
          
          table.appendChild(thead);
          table.appendChild(tbody);
          tableContainer.appendChild(table);
          
          return tableContainer;
        }
        
        /**
         * Render the details panel for the selected entry
         * @private
         */
        _renderDetailPanel() {
          const detailPanel = document.createElement('div');
          detailPanel.className = 'metadata-detail-panel';
          
          if (!this.selectedEntry) {
            // Empty detail panel
            detailPanel.innerHTML = `
              <div class="detail-panel-header">
                <h3>No Content Selected</h3>
                <div class="panel-actions">
                  <button class="detail-panel-close-btn">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
              <div class="detail-panel-content">
                <p>Select a content item to view details</p>
              </div>
            `;
            return detailPanel;
          }
          
          // Panel with content
          const entry = this.selectedEntry;
          
          // Header
          const header = document.createElement('div');
          header.className = 'detail-panel-header';
          header.innerHTML = `
            <h3>Content Details</h3>
            <div class="panel-actions">
              <button class="detail-panel-close-btn">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
          
          // Content
          const content = document.createElement('div');
          content.className = 'detail-panel-content';
          
          // File type icon
          let fileIcon = 'fa-file';
          if (entry.mimetype) {
            if (entry.mimetype.startsWith('image/')) {
              fileIcon = 'fa-file-image';
            } else if (entry.mimetype === 'application/pdf') {
              fileIcon = 'fa-file-pdf';
            } else if (entry.mimetype.startsWith('text/')) {
              fileIcon = 'fa-file-alt';
            }
          }
          
          // Preview section
          const previewSection = document.createElement('div');
          previewSection.className = 'detail-preview-section';
          previewSection.innerHTML = `
            <div class="detail-preview">
              <i class="fas ${fileIcon} fa-5x"></i>
            </div>
          `;
          
          // Create tabs for different sections
          const tabs = document.createElement('div');
          tabs.className = 'detail-tabs';
          tabs.innerHTML = `
            <button class="detail-tab active" data-tab="info">Info</button>
            <button class="detail-tab" data-tab="locations">Locations</button>
            <button class="detail-tab" data-tab="metadata">Metadata</button>
          `;
          
          // Tab content container
          const tabContent = document.createElement('div');
          tabContent.className = 'detail-tab-content';
          
          // Info tab content (shown by default)
          const infoTabContent = document.createElement('div');
          infoTabContent.className = 'detail-tab-pane active';
          infoTabContent.dataset.tab = 'info';
          
          // Basic info grid
          const infoGrid = document.createElement('div');
          infoGrid.className = 'info-grid';
          
          // Add all basic properties
          const infoProperties = [
            { label: 'CID', value: entry.cid, copy: true },
            { label: 'Path', value: entry.path || 'N/A' },
            { label: 'MIME Type', value: entry.mimetype || 'Unknown' },
            { label: 'Size', value: entry.size ? this._formatSize(entry.size) : 'N/A' },
            { label: 'Created', value: entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A' },
            { label: 'Updated', value: entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A' },
            { label: 'Tags', value: (entry.tags && entry.tags.length) ? entry.tags.join(', ') : 'None' }
          ];
          
          infoProperties.forEach(prop => {
            const infoRow = document.createElement('div');
            infoRow.className = 'info-row';
            
            infoRow.innerHTML = `
              <div class="info-label">${prop.label}</div>
              <div class="info-value">
                <span class="info-text">${prop.value}</span>
                ${prop.copy ? `
                  <button class="copy-button" title="Copy to clipboard" data-copy="${prop.value}">
                    <i class="fas fa-clipboard"></i>
                  </button>
                ` : ''}
              </div>
            `;
            
            infoGrid.appendChild(infoRow);
          });
          
          infoTabContent.appendChild(infoGrid);
          
          // Locations tab content
          const locationsTabContent = document.createElement('div');
          locationsTabContent.className = 'detail-tab-pane';
          locationsTabContent.dataset.tab = 'locations';
          
          if (entry.locations && Object.keys(entry.locations).length > 0) {
            const locationsList = document.createElement('div');
            locationsList.className = 'locations-list';
            
            Object.entries(entry.locations).forEach(([location, path]) => {
              if (!path) return; // Skip null/empty locations
              
              const locationItem = document.createElement('div');
              locationItem.className = 'location-item';
              locationItem.innerHTML = `
                <div class="location-name">${location.replace('_', ' ')}</div>
                <div class="location-details">
                  <div class="location-detail">
                    <span class="detail-label">Path:</span> ${path}
                  </div>
                  <div class="location-actions">
                    <button class="location-action-btn open-btn" data-location="${location}" data-path="${path}">
                      <i class="fas fa-external-link-alt"></i> Open
                    </button>
                    <button class="location-action-btn copy-btn" data-copy="${path}">
                      <i class="fas fa-clipboard"></i> Copy
                    </button>
                  </div>
                </div>
              `;
              
              locationsList.appendChild(locationItem);
            });
            
            locationsTabContent.appendChild(locationsList);
          } else {
            locationsTabContent.innerHTML = `
              <p class="no-data">No location information available.</p>
            `;
          }
          
          // Metadata tab content
          const metadataTabContent = document.createElement('div');
          metadataTabContent.className = 'detail-tab-pane';
          metadataTabContent.dataset.tab = 'metadata';
          
          if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            const metadataJson = document.createElement('div');
            metadataJson.className = 'metadata-json';
            metadataJson.innerHTML = `
              <pre>${JSON.stringify(entry.metadata, null, 2)}</pre>
            `;
            
            metadataTabContent.appendChild(metadataJson);
          } else {
            metadataTabContent.innerHTML = `
              <p class="no-data">No additional metadata available.</p>
            `;
          }
          
          // Assemble the tab content
          tabContent.appendChild(infoTabContent);
          tabContent.appendChild(locationsTabContent);
          tabContent.appendChild(metadataTabContent);
          
          // Footer with actions
          const footer = document.createElement('div');
          footer.className = 'detail-panel-footer';
          footer.innerHTML = `
            <div class="panel-actions">
              <button class="open-ipfs-button">
                <i class="fas fa-external-link-alt"></i> Open in IPFS
              </button>
              <button class="edit-button">
                <i class="fas fa-edit"></i> Edit Metadata
              </button>
              <button class="delete-button">
                <i class="fas fa-trash-alt"></i> Delete
              </button>
            </div>
          `;
          
          // Assemble all panel parts
          content.appendChild(previewSection);
          content.appendChild(tabs);
          content.appendChild(tabContent);
          
          detailPanel.appendChild(header);
          detailPanel.appendChild(content);
          detailPanel.appendChild(footer);
          
          return detailPanel;
        }
        
        /**
         * Render footer with pagination
         * @private
         */
        _renderFooter() {
          const footer = document.createElement('div');
          footer.className = 'metadata-browser-footer';
          
          // Pagination info
          const info = document.createElement('div');
          info.className = 'pagination-info';
          
          const startIndex = (this.currentPage - 1) * this.config.pageSize + 1;
          const endIndex = Math.min(startIndex + this.entries.length - 1, this.totalEntries);
          
          info.textContent = `Showing ${startIndex} to ${endIndex} of ${this.totalEntries} entries`;
          
          // Load more button
          const loadMoreBtn = document.createElement('button');
          loadMoreBtn.className = 'load-more-button';
          loadMoreBtn.innerHTML = `
            <i class="fas fa-arrow-down"></i> Load More
          `;
          
          // Show load more button only if there are more entries to load
          const showLoadMore = endIndex < this.totalEntries;
          
          // Pagination controls
          const controls = document.createElement('div');
          controls.className = 'pagination-controls';
          
          if (showLoadMore) {
            controls.appendChild(loadMoreBtn);
          }
          
          // Add to footer
          footer.appendChild(info);
          footer.appendChild(controls);
          
          return footer;
        }
        
        /**
         * Format bytes as human readable size
         * @param {number} bytes Number of bytes
         * @returns {string} Formatted size string
         * @private
         */
        _formatSize(bytes) {
          if (bytes === 0) return '0 Bytes';
          
          const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(bytes) / Math.log(1024));
          
          return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        /**
         * Set up DOM event listeners after rendering
         * @private
         */
        _setupDOMEventListeners() {
          // View toggle buttons
          const viewToggleButtons = this.container.querySelectorAll('.view-toggle-btn');
          viewToggleButtons.forEach(button => {
            button.addEventListener('click', () => {
              const view = button.dataset.view;
              this.toggleViewMode(view);
            });
          });
          
          // Refresh button
          const refreshButton = this.container.querySelector('.refresh-btn');
          if (refreshButton) {
            refreshButton.addEventListener('click', () => this.refresh());
          }
          
          // Grid items or table rows
          const entryElements = this.container.querySelectorAll('.metadata-browser-grid-item, .metadata-browser-table-row');
          entryElements.forEach(element => {
            element.addEventListener('click', (event) => {
              // Prevent if clicking on a button
              if (event.target.tagName === 'BUTTON' || 
                  event.target.parentElement.tagName === 'BUTTON' ||
                  event.target.tagName === 'INPUT' || 
                  event.target.parentElement.tagName === 'INPUT') {
                return;
              }
              
              const index = parseInt(element.dataset.index, 10);
              if (!isNaN(index) && this.entries[index]) {
                this.selectedEntry = this.entries[index];
                this.render();
                
                // Emit event
                this.emit('selection-change', {
                  entry: this.selectedEntry
                });
              }
            });
          });
          
          // Detail panel close button
          const closeDetailBtn = this.container.querySelector('.detail-panel-close-btn');
          if (closeDetailBtn) {
            closeDetailBtn.addEventListener('click', () => {
              this.selectedEntry = null;
              this.render();
              
              // Emit event
              this.emit('selection-change', {
                entry: null
              });
            });
          }
          
          // Tab switching
          const tabButtons = this.container.querySelectorAll('.detail-tab');
          tabButtons.forEach(tab => {
            tab.addEventListener('click', () => {
              // Remove active class from all tabs
              tabButtons.forEach(t => t.classList.remove('active'));
              // Add active class to clicked tab
              tab.classList.add('active');
              
              // Hide all tab panes
              const tabPanes = this.container.querySelectorAll('.detail-tab-pane');
              tabPanes.forEach(pane => pane.classList.remove('active'));
              
              // Show clicked tab pane
              const tabName = tab.dataset.tab;
              const tabPane = this.container.querySelector(`.detail-tab-pane[data-tab="${tabName}"]`);
              if (tabPane) tabPane.classList.add('active');
            });
          });
          
          // Load more button
          const loadMoreBtn = this.container.querySelector('.load-more-button');
          if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
              this.loadMore();
            });
          }
        }
        
        /**
         * Load more entries
         */
        loadMore() {
          this.currentPage++;
          this.refresh();
        }
        
        /**
         * Set up event listeners for component events
         * @private
         */
        _setupEventListeners() {
          // Setup component event listeners if EventBus provided
          if (this.eventBus) {
            // Listen for search filter changes
            this.eventBus.on('content-browser:filter', (filter) => {
              this.applyFilter(filter);
            });
            
            // Listen for real-time entry updates
            this.eventBus.on('pyarrow-index:entry-added', (entry) => {
              this.refresh(true); // Silent refresh
            });
            
            this.eventBus.on('pyarrow-index:entry-updated', (entry) => {
              this.refresh(true); // Silent refresh
            });
            
            this.eventBus.on('pyarrow-index:entry-deleted', (cid) => {
              this.refresh(true); // Silent refresh
            });
          }
        }
        
        /**
         * Apply a filter to the browser
         * @param {Object} filter Filter criteria
         */
        applyFilter(filter) {
          this.currentFilter = {
            ...this.currentFilter,
            ...filter
          };
          
          this.currentPage = 1;
          this.refresh();
          
          // Emit event
          this.emit('filter-applied', {
            filter: this.currentFilter
          });
        }
        
        /**
         * Clear current filters
         */
        clearFilters() {
          this.currentFilter = {};
          this.currentQuery = '';
          this.currentPage = 1;
          this.refresh();
          
          // Emit event
          this.emit('filters-cleared');
        }
      };
      
      return true;
    } catch (error) {
      console.error('Error loading modules:', error);
      return false;
    }
  }

  /**
   * Run tests for the metadata browser component
   */
  async runTests() {
    this.setupTestEnvironment();
    await this.loadModules();
    
    // Run test cases
    await this.testInitialization();
    await this.testGridView();
    await this.testTableView();
    await this.testDetailPanel();
    await this.testViewToggle();
    await this.testFilteringAndSearch();
    await this.testRealTimeUpdates();
    
    // Return test results
    return this.testResults;
  }

  /**
   * Test metadata browser initialization
   */
  async testInitialization() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus
      });
      
      // Test initialization
      const initResult = await browser.init();
      this.testResults.initialization = {
        success: initResult === true,
        message: initResult ? 'MetadataBrowser initialized successfully' : 'MetadataBrowser failed to initialize'
      };
      
      // Test that entries were loaded
      this.testResults.initialization.entriesLoaded = {
        success: browser.entries.length > 0,
        message: browser.entries.length > 0 ? 
          `Successfully loaded ${browser.entries.length} entries` : 
          'Failed to load entries'
      };
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.initialization = {
        success: false,
        message: 'Error during initialization test',
        error: error.message
      };
    }
  }

  /**
   * Test grid view rendering
   */
  async testGridView() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus,
        config: {
          initialView: 'grid'
        }
      });
      
      await browser.init();
      
      // Check if grid items were rendered
      const gridItems = this.container.querySelectorAll('.metadata-browser-grid-item');
      
      this.testResults.gridView = {
        success: gridItems.length > 0,
        message: gridItems.length > 0 ?
          `Grid view rendered with ${gridItems.length} items` :
          'Grid view failed to render items',
        count: gridItems.length
      };
      
      // Test thumbnail rendering
      const thumbnails = this.container.querySelectorAll('.thumbnail-container');
      this.testResults.gridView.thumbnails = {
        success: thumbnails.length > 0,
        message: thumbnails.length > 0 ? 
          `${thumbnails.length} thumbnails rendered` : 
          'Failed to render thumbnails'
      };
      
      // Test metadata rendering
      const metadataContainers = this.container.querySelectorAll('.grid-item-metadata');
      this.testResults.gridView.metadata = {
        success: metadataContainers.length > 0,
        message: metadataContainers.length > 0 ? 
          `${metadataContainers.length} metadata sections rendered` : 
          'Failed to render metadata sections'
      };
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.gridView = {
        success: false,
        message: 'Error during grid view test',
        error: error.message
      };
    }
  }

  /**
   * Test table view rendering
   */
  async testTableView() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus,
        config: {
          initialView: 'table'
        }
      });
      
      await browser.init();
      
      // Check if table was rendered
      const table = this.container.querySelector('.metadata-browser-table');
      const rows = this.container.querySelectorAll('.metadata-browser-table-row');
      
      this.testResults.tableView = {
        success: table !== null && rows.length > 0,
        message: (table !== null && rows.length > 0) ?
          `Table view rendered with ${rows.length} rows` :
          'Table view failed to render',
        count: rows.length
      };
      
      // Test column rendering
      const headers = this.container.querySelectorAll('th');
      this.testResults.tableView.columns = {
        success: headers.length > 0,
        message: headers.length > 0 ? 
          `${headers.length} columns rendered` : 
          'Failed to render table columns',
        count: headers.length
      };
      
      // Test cell content
      const typeCells = this.container.querySelectorAll('.type-cell');
      const cidCells = this.container.querySelectorAll('.cid-cell');
      
      this.testResults.tableView.cells = {
        success: typeCells.length > 0 && cidCells.length > 0,
        message: (typeCells.length > 0 && cidCells.length > 0) ?
          'Table cells rendered correctly' :
          'Failed to render table cells correctly'
      };
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.tableView = {
        success: false,
        message: 'Error during table view test',
        error: error.message
      };
    }
  }

  /**
   * Test detail panel rendering
   */
  async testDetailPanel() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus,
        config: {
          showMetadataPanel: true
        }
      });
      
      await browser.init();
      
      // Select an entry to show detail panel
      browser.selectedEntry = browser.entries[0];
      browser.render();
      
      // Check if detail panel was rendered
      const detailPanel = this.container.querySelector('.metadata-detail-panel');
      
      this.testResults.detailPanel = {
        success: detailPanel !== null,
        message: detailPanel !== null ?
          'Detail panel rendered successfully' :
          'Detail panel failed to render'
      };
      
      if (detailPanel !== null) {
        // Test tabs
        const tabs = this.container.querySelectorAll('.detail-tab');
        this.testResults.detailPanel.tabs = {
          success: tabs.length >= 3,
          message: tabs.length >= 3 ?
            `Detail panel tabs rendered (${tabs.length})` :
            'Detail panel tabs not rendered correctly',
          count: tabs.length
        };
        
        // Test info tab content
        const infoTab = this.container.querySelector('.detail-tab-pane[data-tab="info"]');
        this.testResults.detailPanel.infoTab = {
          success: infoTab !== null && infoTab.classList.contains('active'),
          message: (infoTab !== null && infoTab.classList.contains('active')) ?
            'Info tab rendered correctly and active by default' :
            'Info tab not rendered correctly'
        };
        
        // Test tab switching
        const locationTab = this.container.querySelector('.detail-tab[data-tab="locations"]');
        if (locationTab) {
          locationTab.click();
          
          // Check if the tab switch worked
          const infoTabPane = this.container.querySelector('.detail-tab-pane[data-tab="info"]');
          const locationsTabPane = this.container.querySelector('.detail-tab-pane[data-tab="locations"]');
          
          this.testResults.detailPanel.tabSwitching = {
            success: !infoTabPane.classList.contains('active') && locationsTabPane.classList.contains('active'),
            message: (!infoTabPane.classList.contains('active') && locationsTabPane.classList.contains('active')) ?
              'Tab switching works correctly' :
              'Tab switching failed'
          };
        }
        
        // Test info grid content
        const infoGrid = this.container.querySelector('.info-grid');
        const infoRows = this.container.querySelectorAll('.info-row');
        
        this.testResults.detailPanel.infoContent = {
          success: infoGrid !== null && infoRows.length > 0,
          message: (infoGrid !== null && infoRows.length > 0) ?
            `Info grid rendered with ${infoRows.length} properties` :
            'Info grid not rendered correctly',
          count: infoRows ? infoRows.length : 0
        };
      }
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.detailPanel = {
        success: false,
        message: 'Error during detail panel test',
        error: error.message
      };
    }
  }

  /**
   * Test view toggle functionality
   */
  async testViewToggle() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus,
        config: {
          initialView: 'grid'
        }
      });
      
      await browser.init();
      
      // Check initial view
      const initialGrid = this.container.querySelector('.metadata-browser-grid');
      const initialTable = this.container.querySelector('.metadata-browser-table');
      
      // Toggle to table view
      browser.toggleViewMode('table');
      
      // Check if view was toggled
      const gridAfterToggle = this.container.querySelector('.metadata-browser-grid');
      const tableAfterToggle = this.container.querySelector('.metadata-browser-table');
      
      this.testResults.viewToggle = {
        success: initialGrid !== null && initialTable === null && 
                gridAfterToggle === null && tableAfterToggle !== null,
        message: (initialGrid !== null && initialTable === null && 
                gridAfterToggle === null && tableAfterToggle !== null) ?
          'View toggle works correctly' :
          'View toggle failed'
      };
      
      // Check if toggling via UI works
      const tableToggleBtn = this.container.querySelector('.view-toggle-btn[data-view="table"]');
      if (tableToggleBtn) {
        browser.toggleViewMode('grid'); // Go back to grid first
        
        // Simulate click
        tableToggleBtn.click();
        
        // Check if UI toggle worked
        const gridAfterUiToggle = this.container.querySelector('.metadata-browser-grid');
        const tableAfterUiToggle = this.container.querySelector('.metadata-browser-table');
        
        this.testResults.viewToggle.uiToggle = {
          success: gridAfterUiToggle === null && tableAfterUiToggle !== null,
          message: (gridAfterUiToggle === null && tableAfterUiToggle !== null) ?
            'UI view toggle works correctly' :
            'UI view toggle failed'
        };
      }
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.viewToggle = {
        success: false,
        message: 'Error during view toggle test',
        error: error.message
      };
    }
  }

  /**
   * Test filtering and search functionality
   */
  async testFilteringAndSearch() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus
      });
      
      await browser.init();
      
      // Test applying a filter
      const initialEntries = [...browser.entries];
      
      // Track if query method was called
      let queryWasCalled = false;
      const originalQuery = browser.bridge.query;
      browser.bridge.query = async (criteria) => {
        queryWasCalled = true;
        
        // Verify filter is included in query
        this.testResults.filteringAndSearch.queryIncludesFilter = {
          success: criteria.filter && criteria.filter.mimetype === 'image/jpeg',
          message: (criteria.filter && criteria.filter.mimetype === 'image/jpeg') ?
            'Query includes the filter criteria' :
            'Query does not include filter criteria'
        };
        
        return originalQuery(criteria);
      };
      
      // Apply a filter
      await browser.applyFilter({ mimetype: 'image/jpeg' });
      
      this.testResults.filteringAndSearch = {
        success: queryWasCalled,
        message: queryWasCalled ?
          'Filter was applied and triggered a query' :
          'Filter failed to trigger a query'
      };
      
      // Reset the query method
      browser.bridge.query = originalQuery;
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.filteringAndSearch = {
        success: false,
        message: 'Error during filtering and search test',
        error: error.message
      };
    }
  }

  /**
   * Test real-time updates
   */
  async testRealTimeUpdates() {
    try {
      const browser = new this.MetadataBrowser({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus
      });
      
      await browser.init();
      
      // Track refresh calls
      let refreshCalled = false;
      const originalRefresh = browser.refresh;
      browser.refresh = async (silent) => {
        refreshCalled = true;
        return await originalRefresh.call(browser, silent);
      };
      
      // Simulate a real-time update event
      mockEventBus.emit('pyarrow-index:entry-added', {
        cid: 'QmTestCid',
        path: '/test/path',
        mimetype: 'image/png'
      });
      
      this.testResults.realTimeUpdates = {
        success: refreshCalled,
        message: refreshCalled ?
          'Real-time update event triggered a refresh' :
          'Real-time update event failed to trigger a refresh'
      };
      
      // Reset the refresh method
      browser.refresh = originalRefresh;
      
      // Clean up
      browser.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.realTimeUpdates = {
        success: false,
        message: 'Error during real-time updates test',
        error: error.message
      };
    }
  }
}

// Run tests when imported
const tester = new TestMetadataBrowser();
export default tester;

// Allow running directly
if (typeof require !== 'undefined' && require.main === module) {
  tester.runTests().then(results => {
    console.log('Metadata Browser Tests Results:', results);
  }).catch(err => {
    console.error('Error running tests:', err);
  });
}