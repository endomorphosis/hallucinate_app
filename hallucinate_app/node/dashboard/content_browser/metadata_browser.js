/**
 * Metadata Browser Component for PyArrow Content Index Dashboard
 * 
 * Provides a flexible grid/table view for browsing content index entries
 * with advanced filtering, sorting, and visualization features.
 * 
 * @module dashboard/content_browser/metadata_browser
 */

class MetadataBrowser {
  /**
   * Create a new MetadataBrowser component
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Object} options.bridge - PyArrow index bridge or secure manager
   * @param {Object} options.eventBus - Event bus for component communication
   * @param {Object} options.config - Component configuration
   */
  constructor(options = {}) {
    this.container = options.container;
    this.bridge = options.bridge;
    this.eventBus = options.eventBus;
    
    // Default configuration with overrides from options
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
      previewTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
      lazyLoadImages: true,
      showThumbnails: true,
      metadataPanelWidth: 350, // pixels
      metadataPanelPosition: 'right', // 'right' or 'bottom'
      enableContextMenu: true,
      enableKeyboardNavigation: true,
      enableSearch: true,
      enableBulkOperations: true,
      enableFiltering: true,
      enableSorting: true,
      enableExport: true,
      gridItemWidth: 200, // pixels
      gridItemHeight: 220, // pixels
      gridItemSpacing: 16, // pixels
      gridColumns: 'auto', // 'auto' or a specific number
      showFileSize: true,
      showDateAdded: true,
      showCID: true,
      showMimeType: true,
      showPath: true,
      thumbnailQuality: 'medium', // 'low', 'medium', 'high'
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
    this.lastRefreshTime = null;
    this.refreshTimer = null;
    this.selectedEntry = null;
    this.detailPanelVisible = false;
    this.loadingThumbnails = new Set(); // Keep track of thumbnails being loaded
    this.thumbnailCache = new Map(); // Cache thumbnails
    this.observedElements = new Set(); // Elements with intersection observers
    this.scrollPosition = 0; // Track scroll position for restoring
    this.isLoadingMore = false; // Flag to prevent multiple loadMore calls
    this.hasMoreContent = true; // Flag to indicate if more content is available
    this.intersectionObserver = null; // For lazy loading
    this.resizeObserver = null; // For dynamic column adjustments
    this.downloadQueue = []; // Queue for download operations
    
    // Create event emitter for component events
    this.listeners = {};
    
    // Bind methods
    this._bindMethods();
    
    // Set up intersection observer for lazy loading if supported
    if (typeof IntersectionObserver !== 'undefined' && this.config.lazyLoadImages) {
      this.intersectionObserver = new IntersectionObserver(
        this._handleIntersection.bind(this),
        {
          root: null,
          rootMargin: '100px', // Load images a bit before they're visible
          threshold: 0.1
        }
      );
    }
    
    // Set up resize observer if supported
    if (typeof ResizeObserver !== 'undefined' && this.config.gridColumns === 'auto') {
      this.resizeObserver = new ResizeObserver(this._handleResize.bind(this));
    }
  }
  
  /**
   * Bind class methods to maintain context
   * @private
   */
  _bindMethods() {
    this.init = this.init.bind(this);
    this.render = this.render.bind(this);
    this.refresh = this.refresh.bind(this);
    this.search = this.search.bind(this);
    this.filter = this.filter.bind(this);
    this.sort = this.sort.bind(this);
    this.loadMore = this.loadMore.bind(this);
    this.selectEntry = this.selectEntry.bind(this);
    this.toggleViewMode = this.toggleViewMode.bind(this);
    this.showDetailPanel = this.showDetailPanel.bind(this);
    this.hideDetailPanel = this.hideDetailPanel.bind(this);
    this.exportSelection = this.exportSelection.bind(this);
    this.deleteSelection = this.deleteSelection.bind(this);
    this.downloadSelection = this.downloadSelection.bind(this);
    this.on = this.on.bind(this);
    this.emit = this.emit.bind(this);
    this.dispose = this.dispose.bind(this);
    this.applyFilter = this.applyFilter.bind(this);
    this.clearFilters = this.clearFilters.bind(this);
    this._renderGridView = this._renderGridView.bind(this);
    this._renderTableView = this._renderTableView.bind(this);
    this._renderDetailPanel = this._renderDetailPanel.bind(this);
    this._handleEntryClick = this._handleEntryClick.bind(this);
    this._handleViewModeChange = this._handleViewModeChange.bind(this);
    this._handleScroll = this._handleScroll.bind(this);
    this._handleIntersection = this._handleIntersection.bind(this);
    this._handleResize = this._handleResize.bind(this);
    this._handleKeyboardNavigation = this._handleKeyboardNavigation.bind(this);
    this._handleContextMenu = this._handleContextMenu.bind(this);
    this._loadThumbnail = this._loadThumbnail.bind(this);
    this._getFileIcon = this._getFileIcon.bind(this);
    this._formatSize = this._formatSize.bind(this);
    this._formatDate = this._formatDate.bind(this);
    this._shortenCid = this._shortenCid.bind(this);
    this._getMimeTypeIcon = this._getMimeTypeIcon.bind(this);
  }
  
  /**
   * Initialize the component
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    if (this.initialized) return true;
    
    try {
      this.loading = true;
      this.render();
      
      // Verify bridge is available
      if (!this.bridge) {
        throw new Error('PyArrow index bridge is required');
      }
      
      // Load initial data
      await this.refresh();
      
      // Set up refresh interval if configured
      if (this.config.refreshInterval && this.config.refreshInterval > 0) {
        this.refreshTimer = setInterval(() => {
          this.refresh(true); // silent refresh
        }, this.config.refreshInterval);
      }
      
      // Register with event bus if available
      if (this.eventBus) {
        // Listen for external refresh requests
        this.eventBus.on('content-browser:refresh', () => this.refresh());
        
        // Listen for filter/search changes
        this.eventBus.on('content-browser:filter', (filter) => this.filter(filter));
        this.eventBus.on('content-browser:search', (query) => this.search(query));
        this.eventBus.on('content-browser:sort', (sort) => this.sort(sort));
        
        // Listen for real-time entry updates
        this.eventBus.on('pyarrow-index:entry-added', (entry) => this._handleEntryAdded(entry));
        this.eventBus.on('pyarrow-index:entry-updated', (entry) => this._handleEntryUpdated(entry));
        this.eventBus.on('pyarrow-index:entry-deleted', (cid) => this._handleEntryDeleted(cid));
      }
      
      // Set up event listeners for keyboard navigation
      if (this.config.enableKeyboardNavigation) {
        document.addEventListener('keydown', this._handleKeyboardNavigation);
      }
      
      // Add resize observer to container if available
      if (this.resizeObserver && this.container) {
        this.resizeObserver.observe(this.container);
      }
      
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
  
  /**
   * Refresh content data
   * @param {boolean} silent - Whether to show loading indicator
   * @returns {Promise<boolean>} Success status
   */
  async refresh(silent = false) {
    try {
      if (!silent) {
        this.loading = true;
        this.render();
      }
      
      // Construct query parameters
      const queryParams = {
        page: this.currentPage,
        limit: this.config.pageSize,
        sortField: this.currentSort.field,
        sortDirection: this.currentSort.direction,
        query: this.currentQuery,
        ...this.currentFilter
      };
      
      // Query content index through bridge
      const result = await this.bridge.query(queryParams);
      
      if (!result) {
        throw new Error('Failed to query content index');
      }
      
      // Update state with results
      this.entries = result.entries || [];
      this.totalEntries = result.total || 0;
      this.lastRefreshTime = new Date();
      this.hasMoreContent = this.entries.length < this.totalEntries;
      
      // Emit event if event bus is available
      if (this.eventBus) {
        this.eventBus.emit('content-browser:refreshed', {
          entries: this.entries,
          total: this.totalEntries,
          timestamp: this.lastRefreshTime
        });
      }
      
      // Emit own event
      this.emit('refreshed', {
        entries: this.entries,
        total: this.totalEntries,
        timestamp: this.lastRefreshTime
      });
      
      if (!silent) {
        this.loading = false;
        this.error = null;
        this.render();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to refresh content data:', error);
      
      if (!silent) {
        this.error = error;
        this.loading = false;
        this.render();
      }
      
      return false;
    }
  }
  
  /**
   * Register an event listener
   * 
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  /**
   * Emit an event
   * 
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
  
  /**
   * Render the component to its container
   */
  render() {
    if (!this.container) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create main container
    const browserContainer = document.createElement('div');
    browserContainer.className = 'metadata-browser';
    
    // Create header with actions and view toggles
    const header = this._renderHeader();
    browserContainer.appendChild(header);
    
    // If loading, show loader
    if (this.loading && this.entries.length === 0) {
      const loader = document.createElement('div');
      loader.className = 'metadata-browser-loader';
      loader.innerHTML = `
        <div class="spinner"></div>
        <p>Loading content index data...</p>
      `;
      browserContainer.appendChild(loader);
    } else if (this.error) {
      // If error, show error message
      const errorElem = document.createElement('div');
      errorElem.className = 'metadata-browser-error';
      errorElem.innerHTML = `
        <div class="error-icon">
          <i class="fas fa-exclamation-circle"></i>
        </div>
        <div class="error-content">
          <h3>Failed to load content index data</h3>
          <p>${this.error.message || 'Unknown error'}</p>
          <button class="retry-btn">Retry</button>
        </div>
      `;
      browserContainer.appendChild(errorElem);
      
      // Add retry button event listener
      const retryBtn = errorElem.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.refresh());
      }
    } else if (this.entries.length === 0) {
      // If no entries, show empty state
      const emptyState = document.createElement('div');
      emptyState.className = 'metadata-browser-empty';
      emptyState.innerHTML = `
        <div class="empty-icon">
          <i class="fas fa-inbox"></i>
        </div>
        <h3>No content found</h3>
        <p>There are no entries in the content index matching your criteria.</p>
        ${this.currentQuery || Object.keys(this.currentFilter).length > 0 ? `
          <button class="clear-filters-btn">Clear Filters</button>
        ` : ''}
      `;
      browserContainer.appendChild(emptyState);
      
      // Add clear filters button event listener
      const clearBtn = emptyState.querySelector('.clear-filters-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => this.clearFilters());
      }
    } else {
      // Create content container with proper layout
      if (this.detailPanelVisible && this.selectedEntry) {
        // Split view with detail panel
        const contentContainer = document.createElement('div');
        contentContainer.className = 'metadata-browser-content';
        
        // Main content area (list/grid view)
        const mainContent = document.createElement('div');
        mainContent.className = 'metadata-browser-main-content';
        
        // Render the view based on current view mode
        if (this.viewMode === 'grid') {
          mainContent.appendChild(this._renderGridView());
        } else {
          mainContent.appendChild(this._renderTableView());
        }
        
        // Detail panel
        const detailPanel = this._renderDetailPanel(this.selectedEntry);
        
        // Add to layout based on panel position
        if (this.config.metadataPanelPosition === 'right') {
          contentContainer.className += ' horizontal-split';
          contentContainer.appendChild(mainContent);
          contentContainer.appendChild(detailPanel);
        } else {
          contentContainer.className += ' vertical-split';
          contentContainer.appendChild(mainContent);
          contentContainer.appendChild(detailPanel);
        }
        
        browserContainer.appendChild(contentContainer);
      } else {
        // No detail panel, just show the main content
        if (this.viewMode === 'grid') {
          browserContainer.appendChild(this._renderGridView());
        } else {
          browserContainer.appendChild(this._renderTableView());
        }
      }
      
      // Add "load more" button if we have more content and infinite scroll is disabled
      if (this.hasMoreContent && !this.config.enableInfiniteScroll) {
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = 'load-more-container';
        loadMoreContainer.innerHTML = `
          <button class="load-more-btn">
            ${this.isLoadingMore ? '<span class="spinner-sm"></span>' : ''}
            ${this.isLoadingMore ? 'Loading...' : 'Load More'}
          </button>
        `;
        browserContainer.appendChild(loadMoreContainer);
        
        // Add event listener
        const loadMoreBtn = loadMoreContainer.querySelector('.load-more-btn');
        if (loadMoreBtn) {
          loadMoreBtn.addEventListener('click', () => this.loadMore());
          loadMoreBtn.disabled = this.isLoadingMore;
        }
      }
    }
    
    // Append the final container to the DOM
    this.container.appendChild(browserContainer);
    
    // Set up scroll listener for infinite scroll
    if (this.config.enableInfiniteScroll) {
      const contentElement = browserContainer.querySelector('.metadata-browser-grid') || 
                             browserContainer.querySelector('.metadata-browser-table-container');
      
      if (contentElement) {
        contentElement.addEventListener('scroll', this._handleScroll);
      }
    }
    
    // Set up intersection observers for lazy loading images
    if (this.config.lazyLoadImages && this.intersectionObserver) {
      const thumbnailElements = browserContainer.querySelectorAll('.thumbnail-container');
      thumbnailElements.forEach(elem => {
        this.intersectionObserver.observe(elem);
        this.observedElements.add(elem);
      });
    }
    
    // Set up event listeners for the view
    this._setupEventListeners(browserContainer);
  }
  
  /**
   * Setup event listeners for the component
   * 
   * @param {HTMLElement} container - The component container
   * @private
   */
  _setupEventListeners(container) {
    // View mode toggle buttons
    const viewToggleButtons = container.querySelectorAll('.view-toggle-btn');
    viewToggleButtons.forEach(btn => {
      btn.addEventListener('click', this._handleViewModeChange);
    });
    
    // Entry click handlers
    const entryElements = container.querySelectorAll('.metadata-browser-grid-item, .metadata-browser-table-row');
    entryElements.forEach(elem => {
      elem.addEventListener('click', this._handleEntryClick);
    });
    
    // Sort headers in table view
    const sortHeaders = container.querySelectorAll('.metadata-browser-table th.sortable');
    sortHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const field = header.dataset.field;
        const currentDirection = this.currentSort.direction;
        
        // Toggle direction if same field, otherwise use default
        const newDirection = field === this.currentSort.field ? 
          (currentDirection === 'asc' ? 'desc' : 'asc') : 
          this.config.defaultSortDirection;
        
        this.sort({ field, direction: newDirection });
      });
    });
    
    // Detail panel close button
    const closeDetailBtn = container.querySelector('.detail-panel-close-btn');
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', this.hideDetailPanel);
    }
    
    // Context menu setup
    if (this.config.enableContextMenu) {
      entryElements.forEach(elem => {
        elem.addEventListener('contextmenu', this._handleContextMenu);
      });
    }
  }
  
  /**
   * Render the component header with actions and toggles
   * 
   * @returns {HTMLElement} The header element
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
    
    // Actions for selected entries
    const selectionActions = document.createElement('div');
    selectionActions.className = 'selection-actions';
    
    if (this.selectedEntries.size > 0) {
      selectionActions.innerHTML = `
        ${this.config.enableExport ? `
          <button class="action-btn export-btn" title="Export Selected">
            <i class="fas fa-file-export"></i>
          </button>
        ` : ''}
        <button class="action-btn download-btn" title="Download Selected">
          <i class="fas fa-download"></i>
        </button>
        <button class="action-btn delete-btn" title="Delete Selected">
          <i class="fas fa-trash-alt"></i>
        </button>
      `;
    }
    
    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'action-btn refresh-btn';
    refreshBtn.title = 'Refresh';
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    refreshBtn.addEventListener('click', () => this.refresh());
    
    // Assemble header
    headerRight.appendChild(viewToggle);
    headerRight.appendChild(selectionActions);
    headerRight.appendChild(refreshBtn);
    
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    
    // Add event listeners for actions
    if (this.selectedEntries.size > 0) {
      const exportBtn = selectionActions.querySelector('.export-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', this.exportSelection);
      }
      
      const downloadBtn = selectionActions.querySelector('.download-btn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', this.downloadSelection);
      }
      
      const deleteBtn = selectionActions.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', this.deleteSelection);
      }
    }
    
    return header;
  }
  
  /**
   * Render the content in grid view
   * 
   * @returns {HTMLElement} The grid container element
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
      
      // If selected, add selected class
      if (this.selectedEntries.has(entry.cid)) {
        gridItem.classList.add('selected');
      }
      
      // If detailed, add detailed class for selected entry indication
      if (this.selectedEntry && this.selectedEntry.cid === entry.cid) {
        gridItem.classList.add('detailed');
      }
      
      // Thumbnail container
      const thumbnailContainer = document.createElement('div');
      thumbnailContainer.className = 'thumbnail-container';
      thumbnailContainer.dataset.cid = entry.cid;
      thumbnailContainer.dataset.mimetype = entry.mimetype || '';
      
      // Default to file icon based on mimetype
      const fileIcon = this._getMimeTypeIcon(entry.mimetype);
      
      // Add thumbnail or placeholder
      if (this.config.showThumbnails) {
        thumbnailContainer.innerHTML = `
          <div class="thumbnail-placeholder">
            <i class="${fileIcon}"></i>
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
      } else {
        // Just show the file icon
        thumbnailContainer.innerHTML = `<div class="thumbnail-placeholder">
          <i class="${fileIcon}"></i>
        </div>`;
      }
      
      // Selection indicator
      const selectionIndicator = document.createElement('div');
      selectionIndicator.className = 'selection-indicator';
      selectionIndicator.innerHTML = '<i class="fas fa-check-circle"></i>';
      
      // Metadata section
      const metadataContainer = document.createElement('div');
      metadataContainer.className = 'grid-item-metadata';
      
      // Title/path
      const title = document.createElement('div');
      title.className = 'grid-item-title';
      title.textContent = entry.path ? this._getFilenameFromPath(entry.path) : 'Unnamed';
      title.title = entry.path || '';
      
      // Additional metadata
      const metadata = document.createElement('div');
      metadata.className = 'grid-item-details';
      
      const metadataItems = [];
      
      // Add CID (short version)
      if (this.config.showCID) {
        metadataItems.push(`<span class="cid">${this._shortenCid(entry.cid)}</span>`);
      }
      
      // Add file size
      if (this.config.showFileSize && entry.size) {
        metadataItems.push(`<span class="size">${this._formatSize(entry.size)}</span>`);
      }
      
      // Add MIME type
      if (this.config.showMimeType && entry.mimetype) {
        metadataItems.push(`<span class="mime-type">${entry.mimetype.split('/')[0]}</span>`);
      }
      
      // Add date added/updated
      if (this.config.showDateAdded && (entry.created_at || entry.updated_at)) {
        const date = entry.updated_at || entry.created_at;
        metadataItems.push(`<span class="date">${this._formatDate(date)}</span>`);
      }
      
      metadata.innerHTML = metadataItems.join(' • ');
      
      // Assemble the item
      metadataContainer.appendChild(title);
      metadataContainer.appendChild(metadata);
      
      gridItem.appendChild(thumbnailContainer);
      gridItem.appendChild(selectionIndicator);
      gridItem.appendChild(metadataContainer);
      
      gridContainer.appendChild(gridItem);
    });
    
    return gridContainer;
  }
  
  /**
   * Render the content in table view
   * 
   * @returns {HTMLElement} The table container element
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
          <input type="checkbox" id="select-all-checkbox" ${this.selectedEntries.size === this.entries.length ? 'checked' : ''}>
        </th>
        ${this.config.showThumbnails ? '<th class="thumbnail-cell"></th>' : ''}
        <th class="sortable ${this.currentSort.field === 'mimetype' ? `sorted-${this.currentSort.direction}` : ''}" data-field="mimetype">Type</th>
        ${this.config.showPath ? `<th class="sortable ${this.currentSort.field === 'path' ? `sorted-${this.currentSort.direction}` : ''}" data-field="path">Path</th>` : ''}
        <th class="sortable ${this.currentSort.field === 'cid' ? `sorted-${this.currentSort.direction}` : ''}" data-field="cid">CID</th>
        ${this.config.showFileSize ? `<th class="sortable ${this.currentSort.field === 'size' ? `sorted-${this.currentSort.direction}` : ''}" data-field="size">Size</th>` : ''}
        ${this.config.showDateAdded ? `<th class="sortable ${this.currentSort.field === 'updated_at' ? `sorted-${this.currentSort.direction}` : ''}" data-field="updated_at">Updated</th>` : ''}
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
      
      // If selected, add selected class
      if (this.selectedEntries.has(entry.cid)) {
        row.classList.add('selected');
      }
      
      // If detailed, add detailed class for selected entry indication
      if (this.selectedEntry && this.selectedEntry.cid === entry.cid) {
        row.classList.add('detailed');
      }
      
      // Selection cell
      const selectCell = document.createElement('td');
      selectCell.className = 'select-cell';
      selectCell.innerHTML = `
        <input type="checkbox" class="entry-checkbox" 
          data-cid="${entry.cid}" 
          ${this.selectedEntries.has(entry.cid) ? 'checked' : ''}>
      `;
      
      // Table rows
      let rowHTML = '';
      
      // Thumbnail
      if (this.config.showThumbnails) {
        const mimeIcon = this._getMimeTypeIcon(entry.mimetype);
        rowHTML += `
          <td class="thumbnail-cell">
            <div class="thumbnail-container" data-cid="${entry.cid}" data-mimetype="${entry.mimetype || ''}">
              <div class="thumbnail-placeholder">
                <i class="${mimeIcon}"></i>
              </div>
            </div>
          </td>
        `;
      }
      
      // Type
      rowHTML += `<td>${entry.mimetype ? entry.mimetype.split('/')[0] : 'Unknown'}</td>`;
      
      // Path
      if (this.config.showPath) {
        rowHTML += `<td title="${entry.path || ''}">${entry.path || 'N/A'}</td>`;
      }
      
      // CID
      rowHTML += `<td><span class="cid-display" title="${entry.cid}">${this._shortenCid(entry.cid)}</span></td>`;
      
      // Size
      if (this.config.showFileSize) {
        rowHTML += `<td>${entry.size ? this._formatSize(entry.size) : 'N/A'}</td>`;
      }
      
      // Updated date
      if (this.config.showDateAdded) {
        const date = entry.updated_at || entry.created_at;
        rowHTML += `<td>${date ? this._formatDate(date) : 'N/A'}</td>`;
      }
      
      // Actions
      rowHTML += `
        <td class="actions-cell">
          <button class="table-action-btn view-btn" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
          <button class="table-action-btn download-btn" title="Download">
            <i class="fas fa-download"></i>
          </button>
          <button class="table-action-btn copy-btn" title="Copy CID">
            <i class="fas fa-copy"></i>
          </button>
        </td>
      `;
      
      row.appendChild(selectCell);
      row.innerHTML += rowHTML;
      
      tbody.appendChild(row);
    });
    
    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    
    // Event listeners
    setTimeout(() => {
      // Select all checkbox
      const selectAllCheckbox = tableContainer.querySelector('#select-all-checkbox');
      if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            // Select all entries
            this.entries.forEach(entry => {
              this.selectedEntries.add(entry.cid);
            });
          } else {
            // Deselect all entries
            this.selectedEntries.clear();
          }
          this.render();
        });
      }
      
      // Individual checkboxes
      const checkboxes = tableContainer.querySelectorAll('.entry-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const cid = e.target.dataset.cid;
          if (e.target.checked) {
            this.selectedEntries.add(cid);
          } else {
            this.selectedEntries.delete(cid);
          }
          // Only update the header without full re-render
          this._updateSelectionUI();
        });
        
        // Stop event propagation to prevent row selection when clicking checkbox
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      });
      
      // Action buttons
      tableContainer.querySelectorAll('.table-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent row selection
          
          const row = e.target.closest('tr');
          const cid = row.dataset.cid;
          const index = parseInt(row.dataset.index, 10);
          const entry = this.entries[index];
          
          if (btn.classList.contains('view-btn')) {
            this.showDetailPanel(entry);
          } else if (btn.classList.contains('download-btn')) {
            this._handleDownload(cid);
          } else if (btn.classList.contains('copy-btn')) {
            this._handleCopyCid(cid);
          }
        });
      });
    }, 0);
    
    return tableContainer;
  }
  
  /**
   * Render the detail panel for an entry
   * 
   * @param {Object} entry - The entry to display in the detail panel
   * @returns {HTMLElement} The detail panel element
   * @private
   */
  _renderDetailPanel(entry) {
    if (!entry) return null;
    
    const detailPanel = document.createElement('div');
    detailPanel.className = 'metadata-browser-detail-panel';
    detailPanel.style.width = `${this.config.metadataPanelWidth}px`;
    
    // Header with title and close button
    const panelHeader = document.createElement('div');
    panelHeader.className = 'detail-panel-header';
    
    const headerTitle = document.createElement('h3');
    headerTitle.className = 'detail-panel-title';
    headerTitle.textContent = entry.path ? this._getFilenameFromPath(entry.path) : 'Content Details';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'detail-panel-close-btn';
    closeButton.innerHTML = '<i class="fas fa-times"></i>';
    
    panelHeader.appendChild(headerTitle);
    panelHeader.appendChild(closeButton);
    
    // Preview section (for images, videos, PDFs)
    const previewSection = document.createElement('div');
    previewSection.className = 'detail-panel-preview';
    
    const canPreview = this._canPreviewContent(entry.mimetype);
    
    if (canPreview) {
      if (entry.mimetype && entry.mimetype.startsWith('image/')) {
        // Image preview
        previewSection.innerHTML = `
          <div class="preview-container">
            <div class="preview-loading">
              <div class="spinner"></div>
              <p>Loading preview...</p>
            </div>
            <img class="preview-image" data-cid="${entry.cid}" style="display: none;" />
          </div>
        `;
        
        // Load the image after rendering
        setTimeout(() => this._loadPreviewImage(entry.cid, previewSection), 0);
      } else if (entry.mimetype && entry.mimetype.startsWith('video/')) {
        // Video preview
        previewSection.innerHTML = `
          <div class="preview-container">
            <div class="video-placeholder">
              <i class="fas fa-video"></i>
              <p>Video content</p>
            </div>
          </div>
        `;
      } else if (entry.mimetype && entry.mimetype.startsWith('audio/')) {
        // Audio preview
        previewSection.innerHTML = `
          <div class="preview-container">
            <div class="audio-placeholder">
              <i class="fas fa-music"></i>
              <p>Audio content</p>
            </div>
          </div>
        `;
      } else if (entry.mimetype === 'application/pdf') {
        // PDF preview
        previewSection.innerHTML = `
          <div class="preview-container">
            <div class="pdf-placeholder">
              <i class="fas fa-file-pdf"></i>
              <p>PDF document</p>
            </div>
          </div>
        `;
      }
    } else {
      // Generic file icon based on mimetype
      const fileIcon = this._getMimeTypeIcon(entry.mimetype);
      
      previewSection.innerHTML = `
        <div class="preview-container">
          <div class="file-placeholder">
            <i class="${fileIcon}"></i>
            <p>${entry.mimetype ? entry.mimetype.split('/')[0] : 'Unknown'} content</p>
          </div>
        </div>
      `;
    }
    
    // Content metadata sections
    const metadataSection = document.createElement('div');
    metadataSection.className = 'detail-panel-metadata';
    
    // Basic metadata table
    const basicMetadata = document.createElement('div');
    basicMetadata.className = 'metadata-section';
    
    basicMetadata.innerHTML = `
      <h4 class="section-title">Basic Information</h4>
      <table class="metadata-table">
        <tr>
          <th>CID</th>
          <td><code>${entry.cid}</code> <button class="copy-btn" data-cid="${entry.cid}"><i class="fas fa-copy"></i></button></td>
        </tr>
        ${entry.path ? `
          <tr>
            <th>Path</th>
            <td>${entry.path}</td>
          </tr>
        ` : ''}
        ${entry.mimetype ? `
          <tr>
            <th>MIME Type</th>
            <td>${entry.mimetype}</td>
          </tr>
        ` : ''}
        ${entry.size ? `
          <tr>
            <th>Size</th>
            <td>${this._formatSize(entry.size)}</td>
          </tr>
        ` : ''}
        ${entry.created_at ? `
          <tr>
            <th>Created</th>
            <td>${this._formatDate(entry.created_at, true)}</td>
          </tr>
        ` : ''}
        ${entry.updated_at ? `
          <tr>
            <th>Updated</th>
            <td>${this._formatDate(entry.updated_at, true)}</td>
          </tr>
        ` : ''}
      </table>
    `;
    
    // Additional metadata if available
    let hasAdditionalMetadata = false;
    const additionalMetadataHTML = [];
    
    // Check for various metadata
    if (entry.locations) {
      hasAdditionalMetadata = true;
      additionalMetadataHTML.push(`
        <tr>
          <th>Locations</th>
          <td>
            <ul class="metadata-list">
              ${Object.entries(entry.locations).map(([name, location]) => `
                <li><strong>${name}:</strong> ${typeof location === 'object' ? JSON.stringify(location) : location}</li>
              `).join('')}
            </ul>
          </td>
        </tr>
      `);
    }
    
    if (entry.pin_status) {
      hasAdditionalMetadata = true;
      additionalMetadataHTML.push(`
        <tr>
          <th>Pin Status</th>
          <td>${entry.pin_status}</td>
        </tr>
      `);
    }
    
    if (entry.tags && entry.tags.length > 0) {
      hasAdditionalMetadata = true;
      additionalMetadataHTML.push(`
        <tr>
          <th>Tags</th>
          <td>
            <div class="tag-list">
              ${entry.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          </td>
        </tr>
      `);
    }
    
    // Advanced metadata section if additional data is available
    if (hasAdditionalMetadata) {
      const advancedMetadata = document.createElement('div');
      advancedMetadata.className = 'metadata-section';
      
      advancedMetadata.innerHTML = `
        <h4 class="section-title">Additional Information</h4>
        <table class="metadata-table">
          ${additionalMetadataHTML.join('')}
        </table>
      `;
      metadataSection.appendChild(advancedMetadata);
    }
    
    // Technical metadata if available
    let hasTechnicalMetadata = false;
    const technicalMetadataHTML = [];
    
    if (entry.multihash) {
      hasTechnicalMetadata = true;
      technicalMetadataHTML.push(`
        <tr>
          <th>Multihash</th>
          <td><code>${entry.multihash}</code></td>
        </tr>
      `);
    }
    
    if (entry.format) {
      hasTechnicalMetadata = true;
      technicalMetadataHTML.push(`
        <tr>
          <th>Format</th>
          <td>${entry.format}</td>
        </tr>
      `);
    }
    
    if (entry.blocks) {
      hasTechnicalMetadata = true;
      technicalMetadataHTML.push(`
        <tr>
          <th>Blocks</th>
          <td>${entry.blocks}</td>
        </tr>
      `);
    }
    
    // Any other properties that aren't already displayed
    const handledProps = [
      'cid', 'path', 'mimetype', 'size', 'created_at', 'updated_at',
      'locations', 'pin_status', 'tags', 'multihash', 'format', 'blocks'
    ];
    
    Object.entries(entry).forEach(([key, value]) => {
      if (!handledProps.includes(key) && value !== null && value !== undefined) {
        hasTechnicalMetadata = true;
        technicalMetadataHTML.push(`
          <tr>
            <th>${key}</th>
            <td>${typeof value === 'object' ? JSON.stringify(value) : value}</td>
          </tr>
        `);
      }
    });
    
    // Technical metadata section if technical data is available
    if (hasTechnicalMetadata) {
      const technicalMetadata = document.createElement('div');
      technicalMetadata.className = 'metadata-section';
      
      technicalMetadata.innerHTML = `
        <h4 class="section-title">Technical Details</h4>
        <table class="metadata-table">
          ${technicalMetadataHTML.join('')}
        </table>
      `;
      metadataSection.appendChild(technicalMetadata);
    }
    
    // Actions for this entry
    const actionsSection = document.createElement('div');
    actionsSection.className = 'detail-panel-actions';
    
    actionsSection.innerHTML = `
      <button class="action-btn primary download-btn" data-cid="${entry.cid}">
        <i class="fas fa-download"></i> Download
      </button>
      <button class="action-btn view-ipfs-btn" data-cid="${entry.cid}">
        <i class="fas fa-external-link-alt"></i> View in IPFS
      </button>
      <button class="action-btn delete-btn" data-cid="${entry.cid}">
        <i class="fas fa-trash-alt"></i> Delete
      </button>
    `;
    
    // Assemble the panel
    detailPanel.appendChild(panelHeader);
    detailPanel.appendChild(previewSection);
    
    // Add the basic metadata first
    metadataSection.insertBefore(basicMetadata, metadataSection.firstChild);
    
    detailPanel.appendChild(metadataSection);
    detailPanel.appendChild(actionsSection);
    
    // Add event listeners for action buttons
    setTimeout(() => {
      const downloadBtn = actionsSection.querySelector('.download-btn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => this._handleDownload(entry.cid));
      }
      
      const viewIpfsBtn = actionsSection.querySelector('.view-ipfs-btn');
      if (viewIpfsBtn) {
        viewIpfsBtn.addEventListener('click', () => this._handleViewInIpfs(entry.cid));
      }
      
      const deleteBtn = actionsSection.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this._handleDelete(entry.cid));
      }
      
      // Copy CID button in metadata
      const copyButtons = detailPanel.querySelectorAll('.copy-btn');
      copyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.target.closest('button').dataset.cid;
          this._handleCopyCid(cid);
        });
      });
    }, 0);
    
    return detailPanel;
  }
  
  /**
   * Load more entries (pagination/infinite scroll)
   * @returns {Promise<boolean>} Success status
   */
  async loadMore() {
    try {
      // Skip if already loading or we've loaded all items
      if (this.isLoadingMore || !this.hasMoreContent) {
        return false;
      }
      
      this.isLoadingMore = true;
      
      // If using a load more button, update it
      const loadMoreBtn = this.container.querySelector('.load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<span class="spinner-sm"></span> Loading...';
        loadMoreBtn.disabled = true;
      }
      
      // Increment page number
      this.currentPage++;
      
      // Construct query parameters
      const queryParams = {
        page: this.currentPage,
        limit: this.config.pageSize,
        sortField: this.currentSort.field,
        sortDirection: this.currentSort.direction,
        query: this.currentQuery,
        ...this.currentFilter
      };
      
      // Query content index through bridge
      const result = await this.bridge.query(queryParams);
      
      if (!result) {
        throw new Error('Failed to query content index');
      }
      
      // Add the new entries to our current list
      const newEntries = result.entries || [];
      this.entries = [...this.entries, ...newEntries];
      
      // Update totalEntries if available
      if (result.total !== undefined) {
        this.totalEntries = result.total;
      }
      
      // Check if we have more content to load
      this.hasMoreContent = this.entries.length < this.totalEntries;
      
      // Update UI
      this.render();
      
      // Emit event
      this.emit('more-loaded', {
        page: this.currentPage,
        newEntries: newEntries.length,
        totalLoaded: this.entries.length,
        totalEntries: this.totalEntries
      });
      
      return true;
    } catch (error) {
      console.error('Failed to load more entries:', error);
      
      // Reset loading state
      this.isLoadingMore = false;
      
      // Show error in UI
      const loadMoreBtn = this.container.querySelector('.load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = 'Load More';
        loadMoreBtn.disabled = false;
        
        // Add error message
        const errorElem = document.createElement('div');
        errorElem.className = 'load-more-error';
        errorElem.textContent = 'Failed to load more entries. Click to try again.';
        loadMoreBtn.parentNode.appendChild(errorElem);
        
        // Add retry functionality
        errorElem.addEventListener('click', () => {
          // Remove error message
          errorElem.remove();
          
          // Try loading again
          this.loadMore();
        });
      }
      
      return false;
    } finally {
      this.isLoadingMore = false;
    }
  }
  
  /**
   * Apply filter to content browser
   * 
   * @param {Object} filter - Filter criteria
   * @returns {Promise<boolean>} Success status
   */
  async applyFilter(filter) {
    this.currentFilter = filter || {};
    this.currentPage = 1; // Reset to first page
    return this.refresh();
  }
  
  /**
   * Clear all filters and reset view
   * 
   * @returns {Promise<boolean>} Success status
   */
  async clearFilters() {
    this.currentFilter = {};
    this.currentQuery = '';
    this.currentPage = 1;
    return this.refresh();
  }
  
  /**
   * Show the detail panel for an entry
   * 
   * @param {Object} entry - Entry to show details for
   */
  showDetailPanel(entry) {
    if (!entry) return;
    
    this.selectedEntry = entry;
    this.detailPanelVisible = true;
    
    // Render the updated UI
    this.render();
    
    // Emit event
    this.emit('selection-change', entry);
  }
  
  /**
   * Hide the detail panel
   */
  hideDetailPanel() {
    this.detailPanelVisible = false;
    this.render();
  }
  
  /**
   * Toggle view mode between grid and table
   * 
   * @param {string} mode - View mode ('grid' or 'table')
   */
  toggleViewMode(mode) {
    if (mode !== 'grid' && mode !== 'table') return;
    
    this.viewMode = mode;
    this.render();
  }
  
  /**
   * Handle scroll event for infinite scrolling
   * 
   * @param {Event} e - Scroll event
   * @private
   */
  _handleScroll(e) {
    const target = e.target;
    
    // Save scroll position
    this.scrollPosition = target.scrollTop;
    
    // Check if we're near the bottom
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 200;
    
    if (nearBottom && !this.isLoadingMore && this.hasMoreContent) {
      this.loadMore();
    }
  }
  
  /**
   * Handle click on an entry
   * 
   * @param {Event} e - Click event
   * @private
   */
  _handleEntryClick(e) {
    const element = e.currentTarget;
    const index = parseInt(element.dataset.index, 10);
    const entry = this.entries[index];
    
    if (!entry) return;
    
    // Toggle selection with command/ctrl key
    if (e.ctrlKey || e.metaKey) {
      if (this.selectedEntries.has(entry.cid)) {
        this.selectedEntries.delete(entry.cid);
      } else {
        this.selectedEntries.add(entry.cid);
      }
      
      // Update selection UI without full re-render
      this._updateSelectionUI();
      return;
    }
    
    // Range selection with shift key
    if (e.shiftKey && this.lastSelectedIndex !== undefined) {
      const start = Math.min(this.lastSelectedIndex, index);
      const end = Math.max(this.lastSelectedIndex, index);
      
      for (let i = start; i <= end; i++) {
        if (i >= 0 && i < this.entries.length) {
          this.selectedEntries.add(this.entries[i].cid);
        }
      }
      
      // Update selection UI without full re-render
      this._updateSelectionUI();
      return;
    }
    
    // Regular click - select and show details
    this.lastSelectedIndex = index;
    this.showDetailPanel(entry);
  }
  
  /**
   * Handle view mode change from toggle buttons
   * 
   * @param {Event} e - Click event
   * @private
   */
  _handleViewModeChange(e) {
    const button = e.currentTarget;
    const mode = button.dataset.view;
    
    this.toggleViewMode(mode);
  }
  
  /**
   * Handle context menu on entry
   * 
   * @param {Event} e - Context menu event
   * @private
   */
  _handleContextMenu(e) {
    e.preventDefault();
    
    const element = e.currentTarget;
    const index = parseInt(element.dataset.index, 10);
    const entry = this.entries[index];
    
    if (!entry) return;
    
    // Select the entry if not already selected
    if (!this.selectedEntries.has(entry.cid)) {
      // Clear selection if not using multi-select key
      if (!e.ctrlKey && !e.metaKey) {
        this.selectedEntries.clear();
      }
      
      this.selectedEntries.add(entry.cid);
      this._updateSelectionUI();
    }
    
    // Emit context menu event for external handler
    this.emit('context-menu', {
      entry,
      event: e
    });
  }
  
  /**
   * Load a preview image for the detail panel
   * 
   * @param {string} cid - CID of the content
   * @param {HTMLElement} container - Container element for the preview
   * @private
   */
  async _loadPreviewImage(cid, container) {
    try {
      // Already cached?
      if (this.thumbnailCache.has(cid)) {
        const imageContainer = container.querySelector('.preview-container');
        const loadingElement = container.querySelector('.preview-loading');
        const imageElement = container.querySelector('.preview-image');
        
        if (imageElement) {
          const imageData = this.thumbnailCache.get(cid);
          imageElement.src = imageData;
          imageElement.style.display = 'block';
          
          if (loadingElement) {
            loadingElement.style.display = 'none';
          }
        }
        return;
      }
      
      // Check if bridge has getThumbnail method
      if (this.bridge.getThumbnail) {
        const imageData = await this.bridge.getThumbnail(cid, 'large');
        
        // Cache the thumbnail
        this.thumbnailCache.set(cid, imageData);
        
        // Update UI
        const imageContainer = container.querySelector('.preview-container');
        const loadingElement = container.querySelector('.preview-loading');
        const imageElement = container.querySelector('.preview-image');
        
        if (imageElement) {
          imageElement.src = imageData;
          imageElement.style.display = 'block';
          
          if (loadingElement) {
            loadingElement.style.display = 'none';
          }
        }
      } else {
        // Fallback to generic placeholder
        const imageContainer = container.querySelector('.preview-container');
        const loadingElement = container.querySelector('.preview-loading');
        
        if (imageContainer && loadingElement) {
          loadingElement.innerHTML = `
            <div class="file-placeholder">
              <i class="fas fa-file-image"></i>
              <p>Image preview not available</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Failed to load preview image:', error);
      
      // Show error in the UI
      const loadingElement = container.querySelector('.preview-loading');
      if (loadingElement) {
        loadingElement.innerHTML = `
          <div class="file-placeholder">
            <i class="fas fa-exclamation-circle"></i>
            <p>Failed to load preview</p>
          </div>
        `;
      }
    }
  }
  
  /**
   * Handle intersection observer events for lazy loading
   * 
   * @param {IntersectionObserverEntry[]} entries - Intersection observer entries
   * @private
   */
  _handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const cid = element.dataset.cid;
        const mimetype = element.dataset.mimetype || '';
        
        // Only load images (for now)
        if (mimetype.startsWith('image/')) {
          this._loadThumbnail(cid, element);
        }
      }
    });
  }
  
  /**
   * Load thumbnail for an element
   * 
   * @param {string} cid - Content ID
   * @param {HTMLElement} element - Container element
   * @private
   */
  async _loadThumbnail(cid, element) {
    // Skip if already loading or loaded
    if (this.loadingThumbnails.has(cid) || element.querySelector('.thumbnail-img')) {
      return;
    }
    
    try {
      this.loadingThumbnails.add(cid);
      
      // Already cached?
      if (this.thumbnailCache.has(cid)) {
        const placeholderElement = element.querySelector('.thumbnail-placeholder');
        
        // Create image element
        const img = document.createElement('img');
        img.className = 'thumbnail-img';
        img.alt = 'Thumbnail';
        img.src = this.thumbnailCache.get(cid);
        
        // Replace placeholder with image
        if (placeholderElement) {
          element.insertBefore(img, placeholderElement);
          placeholderElement.style.display = 'none';
        } else {
          element.appendChild(img);
        }
        
        this.loadingThumbnails.delete(cid);
        return;
      }
      
      // Check if bridge has getThumbnail method
      if (this.bridge.getThumbnail) {
        const thumbnailSize = this.config.thumbnailSize || 'medium';
        const imageData = await this.bridge.getThumbnail(cid, thumbnailSize);
        
        // Cache the thumbnail
        this.thumbnailCache.set(cid, imageData);
        
        // Create image element
        const img = document.createElement('img');
        img.className = 'thumbnail-img';
        img.alt = 'Thumbnail';
        img.src = imageData;
        
        // Replace placeholder
        const placeholderElement = element.querySelector('.thumbnail-placeholder');
        if (placeholderElement) {
          element.insertBefore(img, placeholderElement);
          placeholderElement.style.display = 'none';
        } else {
          element.appendChild(img);
        }
      }
    } catch (error) {
      console.error(`Failed to load thumbnail for ${cid}:`, error);
    } finally {
      this.loadingThumbnails.delete(cid);
    }
  }
  
  /**
   * Handle download of content
   * 
   * @param {string} cid - Content ID to download
   * @private
   */
  _handleDownload(cid) {
    // Emit download event for external handler
    this.emit('download', { cid });
  }
  
  /**
   * Handle "View in IPFS" action
   * 
   * @param {string} cid - Content ID to view
   * @private
   */
  _handleViewInIpfs(cid) {
    // Emit view event for external handler
    this.emit('view-in-ipfs', { cid });
  }
  
  /**
   * Handle delete action
   * 
   * @param {string} cid - Content ID to delete
   * @private
   */
  _handleDelete(cid) {
    // Emit delete event for external handler
    this.emit('delete', { cid });
  }
  
  /**
   * Handle copy CID action
   * 
   * @param {string} cid - Content ID to copy
   * @private
   */
  _handleCopyCid(cid) {
    // Try to copy to clipboard
    try {
      navigator.clipboard.writeText(cid).then(() => {
        // Show success notification
        this._showNotification('CID copied to clipboard', 'success');
      }).catch(err => {
        console.error('Failed to copy CID:', err);
        this._showNotification('Failed to copy CID', 'error');
      });
    } catch (error) {
      console.error('Failed to copy CID:', error);
      this._showNotification('Failed to copy CID', 'error');
      
      // Fallback for browsers that don't support clipboard API
      this._showFallbackCopyDialog(cid);
    }
  }
  
  /**
   * Update selection UI without full re-render
   * 
   * @private
   */
  _updateSelectionUI() {
    // Update header count
    const selectedCountElem = this.container.querySelector('.selected-count');
    if (selectedCountElem) {
      if (this.selectedEntries.size > 0) {
        selectedCountElem.textContent = `(${this.selectedEntries.size} selected)`;
        selectedCountElem.style.display = '';
      } else {
        selectedCountElem.style.display = 'none';
      }
    }
    
    // Update selection in grid view
    const gridItems = this.container.querySelectorAll('.metadata-browser-grid-item');
    gridItems.forEach(item => {
      const cid = item.dataset.cid;
      if (this.selectedEntries.has(cid)) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    
    // Update selection in table view
    const tableRows = this.container.querySelectorAll('.metadata-browser-table-row');
    tableRows.forEach(row => {
      const cid = row.dataset.cid;
      const checkbox = row.querySelector('.entry-checkbox');
      
      if (this.selectedEntries.has(cid)) {
        row.classList.add('selected');
        if (checkbox) checkbox.checked = true;
      } else {
        row.classList.remove('selected');
        if (checkbox) checkbox.checked = false;
      }
    });
    
    // Update "select all" checkbox
    const selectAllCheckbox = this.container.querySelector('#select-all-checkbox');
    if (selectAllCheckbox) {
      if (this.entries.length > 0 && this.selectedEntries.size === this.entries.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else if (this.selectedEntries.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
    }
    
    // Update header actions
    const selectionActions = this.container.querySelector('.selection-actions');
    if (selectionActions) {
      if (this.selectedEntries.size > 0) {
        selectionActions.innerHTML = `
          ${this.config.enableExport ? `
            <button class="action-btn export-btn" title="Export Selected">
              <i class="fas fa-file-export"></i>
            </button>
          ` : ''}
          <button class="action-btn download-btn" title="Download Selected">
            <i class="fas fa-download"></i>
          </button>
          <button class="action-btn delete-btn" title="Delete Selected">
            <i class="fas fa-trash-alt"></i>
          </button>
        `;
        
        // Add event listeners
        const exportBtn = selectionActions.querySelector('.export-btn');
        if (exportBtn) {
          exportBtn.addEventListener('click', this.exportSelection);
        }
        
        const downloadBtn = selectionActions.querySelector('.download-btn');
        if (downloadBtn) {
          downloadBtn.addEventListener('click', this.downloadSelection);
        }
        
        const deleteBtn = selectionActions.querySelector('.delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', this.deleteSelection);
        }
      } else {
        selectionActions.innerHTML = '';
      }
    }
  }
  
  /**
   * Handle keyboard navigation
   * 
   * @param {KeyboardEvent} e - Keyboard event
   * @private
   */
  _handleKeyboardNavigation(e) {
    // Only handle if the component is focused
    const activeElement = document.activeElement;
    const isChildElement = this.container && this.container.contains(activeElement);
    
    if (!isChildElement && activeElement !== this.container) {
      return;
    }
    
    // Prevent default behavior for navigation keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) {
      e.preventDefault();
    }
    
    // Handle escape key to close detail panel
    if (e.key === 'Escape' && this.detailPanelVisible) {
      this.hideDetailPanel();
      return;
    }
    
    // Handle navigation within grid or table
    if (this.entries.length === 0) return;
    
    // Get current selection and current index
    let currentIndex = -1;
    
    if (this.selectedEntry) {
      currentIndex = this.entries.findIndex(entry => entry.cid === this.selectedEntry.cid);
    }
    
    // Handle arrow keys for navigation
    let newIndex = currentIndex;
    
    if (this.viewMode === 'grid') {
      // Estimate the number of columns in the grid
      let columnsPerRow = Math.floor(
        this.container.querySelector('.metadata-browser-grid')?.clientWidth / (this.config.gridItemWidth + this.config.gridItemSpacing)
      ) || 4; // Default to 4 columns if we can't calculate
      
      // Handle grid navigation
      if (e.key === 'ArrowUp') {
        newIndex = Math.max(0, currentIndex - columnsPerRow);
      } else if (e.key === 'ArrowDown') {
        newIndex = Math.min(this.entries.length - 1, currentIndex + columnsPerRow);
      } else if (e.key === 'ArrowLeft') {
        newIndex = Math.max(0, currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        newIndex = Math.min(this.entries.length - 1, currentIndex + 1);
      } else if (e.key === 'Home') {
        newIndex = 0;
      } else if (e.key === 'End') {
        newIndex = this.entries.length - 1;
      }
    } else {
      // Table view navigation is simpler
      if (e.key === 'ArrowUp') {
        newIndex = Math.max(0, currentIndex - 1);
      } else if (e.key === 'ArrowDown') {
        newIndex = Math.min(this.entries.length - 1, currentIndex + 1);
      } else if (e.key === 'Home') {
        newIndex = 0;
      } else if (e.key === 'End') {
        newIndex = this.entries.length - 1;
      }
    }
    
    // If index changed, select the new entry
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < this.entries.length) {
      const newEntry = this.entries[newIndex];
      this.showDetailPanel(newEntry);
      
      // Scroll into view
      this._scrollEntryIntoView(newIndex);
    }
  }
  
  /**
   * Scroll an entry into view
   * 
   * @param {number} index - Entry index
   * @private
   */
  _scrollEntryIntoView(index) {
    if (this.viewMode === 'grid') {
      const gridItem = this.container.querySelector(`.metadata-browser-grid-item[data-index="${index}"]`);
      if (gridItem) {
        gridItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      const tableRow = this.container.querySelector(`.metadata-browser-table-row[data-index="${index}"]`);
      if (tableRow) {
        tableRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
  
  /**
   * Show a notification message
   * 
   * @param {string} message - Notification message
   * @param {string} type - Notification type ('success', 'error', 'info', 'warning')
   * @private
   */
  _showNotification(message, type = 'info') {
    // Emit notification event for external handler
    this.emit('notification', { message, type });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-icon">
        <i class="fas ${this._getNotificationIcon(type)}"></i>
      </div>
      <div class="notification-content">
        ${message}
      </div>
      <button class="notification-close">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Add close button event
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        notification.remove();
      });
    }
    
    // Auto remove after a delay
    setTimeout(() => {
      notification.classList.add('notification-hiding');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }
  
  /**
   * Get icon for notification type
   * 
   * @param {string} type - Notification type
   * @returns {string} Icon class
   * @private
   */
  _getNotificationIcon(type) {
    switch (type) {
      case 'success':
        return 'fa-check-circle';
      case 'error':
        return 'fa-exclamation-circle';
      case 'warning':
        return 'fa-exclamation-triangle';
      case 'info':
      default:
        return 'fa-info-circle';
    }
  }
  
  /**
   * Show fallback dialog for copying CID
   * 
   * @param {string} cid - Content ID to copy
   * @private
   */
  _showFallbackCopyDialog(cid) {
    // Create a modal dialog for copying
    const dialog = document.createElement('div');
    dialog.className = 'copy-dialog';
    dialog.innerHTML = `
      <div class="copy-dialog-content">
        <h3>Copy CID</h3>
        <p>Select and copy this CID:</p>
        <div class="copy-input-wrapper">
          <input type="text" class="copy-input" value="${cid}" readonly>
        </div>
        <div class="copy-dialog-actions">
          <button class="copy-dialog-btn">Close</button>
        </div>
      </div>
    `;
    
    // Add to document
    document.body.appendChild(dialog);
    
    // Focus and select the input
    const input = dialog.querySelector('.copy-input');
    if (input) {
      input.focus();
      input.select();
    }
    
    // Add close button event
    const closeBtn = dialog.querySelector('.copy-dialog-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        dialog.remove();
      });
    }
    
    // Close on click outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  /**
   * Handle resize events for grid layout
   * 
   * @param {ResizeObserverEntry[]} entries - Resize observer entries
   * @private
   */
  _handleResize(entries) {
    // Skip if using a fixed number of columns
    if (typeof this.config.gridColumns === 'number') return;
    
    for (const entry of entries) {
      // Calculate new number of columns
      const containerWidth = entry.contentRect.width;
      const itemWidth = this.config.gridItemWidth;
      const itemSpacing = this.config.gridItemSpacing;
      
      const columnsPerRow = Math.floor((containerWidth + itemSpacing) / (itemWidth + itemSpacing));
      
      // Only re-render if columns changed
      if (columnsPerRow !== this.lastColumnsPerRow) {
        this.lastColumnsPerRow = columnsPerRow;
        
        // Update grid layout
        const gridContainer = this.container.querySelector('.metadata-browser-grid');
        if (gridContainer) {
          gridContainer.style.gridTemplateColumns = `repeat(${columnsPerRow}, 1fr)`;
        }
      }
    }
  }
  
  /**
   * Determine if content can be previewed
   * 
   * @param {string} mimetype - MIME type of the content
   * @returns {boolean} Whether the content can be previewed
   * @private
   */
  _canPreviewContent(mimetype) {
    if (!mimetype) return false;
    
    for (const pattern of this.config.previewTypes) {
      if (pattern.endsWith('/*')) {
        // Check type category (e.g., "image/*")
        const category = pattern.split('/')[0];
        if (mimetype.startsWith(`${category}/`)) {
          return true;
        }
      } else if (pattern === mimetype) {
        // Exact match
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get icon class for a MIME type
   * 
   * @param {string} mimetype - MIME type
   * @returns {string} FontAwesome icon class
   * @private
   */
  _getMimeTypeIcon(mimetype) {
    if (!mimetype) return 'fas fa-file';
    
    const type = mimetype.split('/')[0];
    const subtype = mimetype.split('/')[1];
    
    switch (type) {
      case 'image':
        return 'fas fa-file-image';
      case 'video':
        return 'fas fa-file-video';
      case 'audio':
        return 'fas fa-file-audio';
      case 'text':
        return 'fas fa-file-alt';
      case 'application':
        switch (subtype) {
          case 'pdf':
            return 'fas fa-file-pdf';
          case 'json':
            return 'fas fa-file-code';
          case 'xml':
            return 'fas fa-file-code';
          case 'zip':
          case 'x-zip-compressed':
          case 'x-rar-compressed':
          case 'x-tar':
          case 'x-gzip':
            return 'fas fa-file-archive';
          case 'javascript':
          case 'typescript':
            return 'fas fa-file-code';
          case 'msword':
          case 'vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'fas fa-file-word';
          case 'vnd.ms-excel':
          case 'vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            return 'fas fa-file-excel';
          case 'vnd.ms-powerpoint':
          case 'vnd.openxmlformats-officedocument.presentationml.presentation':
            return 'fas fa-file-powerpoint';
          default:
            return 'fas fa-file';
        }
      default:
        return 'fas fa-file';
    }
  }
  
  /**
   * Format file size in human-readable format
   * 
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size string
   * @private
   */
  _formatSize(bytes) {
    if (bytes === undefined || bytes === null) return 'Unknown';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i === 0) return `${bytes} ${sizes[i]}`;
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
  
  /**
   * Format date in human-readable format
   * 
   * @param {string} dateStr - ISO date string
   * @param {boolean} includeTime - Whether to include time
   * @returns {string} Formatted date string
   * @private
   */
  _formatDate(dateStr, includeTime = false) {
    if (!dateStr) return 'Unknown';
    
    try {
      const date = new Date(dateStr);
      
      if (includeTime) {
        return date.toLocaleString();
      } else {
        // Check if it's today
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
          return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // Check if it's yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
          return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        return date.toLocaleDateString();
      }
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateStr;
    }
  }
  
  /**
   * Extract filename from path
   * 
   * @param {string} path - File path
   * @returns {string} Filename
   * @private
   */
  _getFilenameFromPath(path) {
    if (!path) return 'Unknown';
    
    // Handle both UNIX and Windows paths
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  }
  
  /**
   * Shorten CID for display
   * 
   * @param {string} cid - Content ID
   * @returns {string} Shortened CID
   * @private
   */
  _shortenCid(cid) {
    if (!cid) return 'Unknown';
    
    if (cid.length <= 12) return cid;
    
    return `${cid.substring(0, 6)}...${cid.substring(cid.length - 6)}`;
  }
  
  /**
   * Export selected entries
   */
  exportSelection() {
    const entries = this.entries.filter(entry => this.selectedEntries.has(entry.cid));
    
    // Emit export event for external handler
    this.emit('export', { entries });
  }
  
  /**
   * Download selected entries
   */
  downloadSelection() {
    const entries = this.entries.filter(entry => this.selectedEntries.has(entry.cid));
    
    // Emit download event for external handler
    this.emit('download-multiple', { entries });
  }
  
  /**
   * Delete selected entries
   */
  deleteSelection() {
    const entries = this.entries.filter(entry => this.selectedEntries.has(entry.cid));
    
    // Emit delete event for external handler
    this.emit('delete-multiple', { entries });
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Clear event listeners
    this.listeners = {};
    
    // Clear interval
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    // Remove observers
    if (this.intersectionObserver) {
      this.observedElements.forEach(element => {
        this.intersectionObserver.unobserve(element);
      });
      
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
      this.observedElements.clear();
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Remove keyboard event listener
    if (this.config.enableKeyboardNavigation) {
      document.removeEventListener('keydown', this._handleKeyboardNavigation);
    }
    
    // Clear cache
    this.thumbnailCache.clear();
    
    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
      this.currentPage++;
      
      // Construct query parameters for next page
      const queryParams = {
        page: this.currentPage,
        limit: this.config.pageSize,
        sortField: this.currentSort.field,
        sortDirection: this.currentSort.direction,
        query: this.currentQuery,
        ...this.currentFilter
      };
      
      // Show loading indicator in footer
      const footerElement = this.container.querySelector('.metadata-browser-footer');
      if (footerElement) {
        footerElement.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading more...</div>';
      }
      
      // Query content index through bridge
      const result = await this.bridge.query(queryParams);
      
      if (!result || !result.entries) {
        throw new Error('Failed to load more entries');
      }
      
      // Append new entries to existing list
      this.entries = [...this.entries, ...result.entries];
      this.totalEntries = result.total || this.totalEntries;
      
      // Update UI
      this.render();
      
      return true;
    } catch (error) {
      console.error('Failed to load more entries:', error);
      
      // Reset page number on error
      this.currentPage--;
      
      // Show error in footer
      const footerElement = this.container.querySelector('.metadata-browser-footer');
      if (footerElement) {
        footerElement.innerHTML = `<div class="error-message">Failed to load more entries: ${error.message}</div>`;
      }
      
      return false;
    }
  }
  
  /**
   * Search content by query string
   * @param {string} query - Search query
   * @returns {Promise<boolean>} Success status
   */
  async search(query) {
    // Update query and reset page
    this.currentQuery = query;
    this.currentPage = 1;
    
    // Refresh with new query
    return await this.refresh();
  }
  
  /**
   * Filter content by criteria
   * @param {Object} filter - Filter criteria
   * @returns {Promise<boolean>} Success status
   */
  async filter(filter) {
    // Update filter and reset page
    this.currentFilter = filter;
    this.currentPage = 1;
    
    // Refresh with new filter
    return await this.refresh();
  }
  
  /**
   * Sort content by field and direction
   * @param {Object} sort - Sort configuration {field, direction}
   * @returns {Promise<boolean>} Success status
   */
  async sort(sort) {
    // Update sort configuration and reset page
    this.currentSort = {
      field: sort.field || this.currentSort.field,
      direction: sort.direction || this.currentSort.direction
    };
    this.currentPage = 1;
    
    // Refresh with new sort configuration
    return await this.refresh();
  }
  
  /**
   * Select an entry and show details
   * @param {string} cid - Content ID to select
   */
  async selectEntry(cid) {
    try {
      if (!cid) {
        this.selectedEntry = null;
        this.render();
        return;
      }
      
      // Show loading in detail panel if it exists
      const detailPanel = this.container.querySelector('.metadata-detail-panel');
      if (detailPanel) {
        detailPanel.innerHTML = '<div class="loading-indicator"><div class="spinner"></div> Loading details...</div>';
      }
      
      // Fetch entry details by CID
      const entry = await this.bridge.lookupByCid(cid);
      
      if (!entry) {
        throw new Error(`Entry with CID ${cid} not found`);
      }
      
      // Update selected entry
      this.selectedEntry = entry;
      
      // Update UI
      this.render();
      
      // Emit event if event bus is available
      if (this.eventBus) {
        this.eventBus.emit('content-browser:entry-selected', entry);
      }
    } catch (error) {
      console.error(`Failed to select entry ${cid}:`, error);
      
      // Show error in detail panel
      const detailPanel = this.container.querySelector('.metadata-detail-panel');
      if (detailPanel) {
        detailPanel.innerHTML = `<div class="error-message">Failed to load entry details: ${error.message}</div>`;
      }
    }
  }
  
  /**
   * Toggle between grid and table view modes
   * @param {string} mode - View mode ('grid' or 'table')
   */
  toggleViewMode(mode) {
    if (mode && (mode === 'grid' || mode === 'table')) {
      this.viewMode = mode;
    } else {
      // Toggle between grid and table
      this.viewMode = this.viewMode === 'grid' ? 'table' : 'grid';
    }
    
    // Update UI
    this.render();
    
    // Emit event if event bus is available
    if (this.eventBus) {
      this.eventBus.emit('content-browser:view-mode-changed', this.viewMode);
    }
  }
  
  /**
   * Render the component
   */
  render() {
    if (!this.container) return;
    
    // Clear the container
    this.container.innerHTML = '';
    
    // Create layout container
    const layoutContainer = document.createElement('div');
    layoutContainer.className = 'metadata-browser-container';
    
    // Add header with controls
    layoutContainer.appendChild(this._renderHeader());
    
    // Add content area
    const contentContainer = document.createElement('div');
    contentContainer.className = 'metadata-browser-content';
    
    if (this.loading && this.entries.length === 0) {
      // Show loading indicator for initial load
      contentContainer.innerHTML = '<div class="loading-indicator full-page"><div class="spinner"></div> Loading content...</div>';
    } else if (this.error && this.entries.length === 0) {
      // Show error message for initial load
      contentContainer.innerHTML = `
        <div class="error-message full-page">
          <i class="fas fa-exclamation-circle"></i>
          <h3>Failed to load content</h3>
          <p>${this.error.message}</p>
          <button class="retry-button">Retry</button>
        </div>
      `;
      
      // Add retry button event listener
      setTimeout(() => {
        const retryButton = contentContainer.querySelector('.retry-button');
        if (retryButton) {
          retryButton.addEventListener('click', () => this.refresh());
        }
      }, 0);
    } else if (this.entries.length === 0) {
      // Show empty state
      contentContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <h3>No content found</h3>
          <p>Try adjusting your search or filter criteria</p>
          <button class="clear-filters-button">Clear Filters</button>
        </div>
      `;
      
      // Add clear filters button event listener
      setTimeout(() => {
        const clearButton = contentContainer.querySelector('.clear-filters-button');
        if (clearButton) {
          clearButton.addEventListener('click', () => {
            this.currentFilter = {};
            this.currentQuery = '';
            this.refresh();
          });
        }
      }, 0);
    } else {
      // Create content layout based on view mode
      const contentLayout = document.createElement('div');
      contentLayout.className = `metadata-browser-layout ${this.viewMode}-view`;
      
      // Render content based on view mode
      if (this.viewMode === 'grid') {
        contentLayout.appendChild(this._renderGridView());
      } else {
        contentLayout.appendChild(this._renderTableView());
      }
      
      // Add detail panel if an entry is selected and panel is enabled
      if (this.selectedEntry && this.config.showMetadataPanel) {
        contentLayout.appendChild(this._renderDetailPanel());
      }
      
      contentContainer.appendChild(contentLayout);
    }
    
    layoutContainer.appendChild(contentContainer);
    
    // Add footer with pagination
    layoutContainer.appendChild(this._renderFooter());
    
    // Append to container
    this.container.appendChild(layoutContainer);
    
    // Add event listeners
    this._addEventListeners();
  }
  
  /**
   * Render the header with controls
   * @returns {HTMLElement} Header element
   * @private
   */
  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'metadata-browser-header';
    
    // Create the header content
    header.innerHTML = `
      <div class="browser-stats">
        <span class="entry-count">
          ${this.totalEntries} ${this.totalEntries === 1 ? 'entry' : 'entries'}
        </span>
        ${this.lastRefreshTime ? 
          `<span class="last-refresh">
            Last updated: ${this.lastRefreshTime.toLocaleTimeString()}
          </span>` : ''}
      </div>
      
      <div class="browser-controls">
        <div class="view-toggle">
          <button class="view-button ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">
            <i class="fas fa-th"></i> Grid
          </button>
          <button class="view-button ${this.viewMode === 'table' ? 'active' : ''}" data-view="table">
            <i class="fas fa-list"></i> Table
          </button>
        </div>
        
        <div class="sort-control">
          <label for="sort-select">Sort by:</label>
          <select id="sort-select" class="sort-select">
            <option value="updated_at-desc" ${this.currentSort.field === 'updated_at' && this.currentSort.direction === 'desc' ? 'selected' : ''}>
              Latest Updates
            </option>
            <option value="created_at-desc" ${this.currentSort.field === 'created_at' && this.currentSort.direction === 'desc' ? 'selected' : ''}>
              Newest First
            </option>
            <option value="created_at-asc" ${this.currentSort.field === 'created_at' && this.currentSort.direction === 'asc' ? 'selected' : ''}>
              Oldest First
            </option>
            <option value="size-desc" ${this.currentSort.field === 'size' && this.currentSort.direction === 'desc' ? 'selected' : ''}>
              Largest Size
            </option>
            <option value="size-asc" ${this.currentSort.field === 'size' && this.currentSort.direction === 'asc' ? 'selected' : ''}>
              Smallest Size
            </option>
            <option value="path-asc" ${this.currentSort.field === 'path' && this.currentSort.direction === 'asc' ? 'selected' : ''}>
              Path (A-Z)
            </option>
            <option value="path-desc" ${this.currentSort.field === 'path' && this.currentSort.direction === 'desc' ? 'selected' : ''}>
              Path (Z-A)
            </option>
          </select>
        </div>
        
        <button class="refresh-button" title="Refresh content">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
    `;
    
    return header;
  }
  
  /**
   * Render the grid view of content entries
   * @returns {HTMLElement} Grid container
   * @private
   */
  _renderGridView() {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'metadata-grid-container';
    
    // Create the grid of content entries
    const grid = document.createElement('div');
    grid.className = `metadata-grid size-${this.config.thumbnailSize}`;
    
    // Add entries to grid
    this.entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'metadata-card';
      card.dataset.cid = entry.cid;
      
      // Add selected class if this entry is selected
      if (this.selectedEntry && this.selectedEntry.cid === entry.cid) {
        card.classList.add('selected');
      }
      
      // Check if this entry has a preview
      const hasPreview = this._canPreview(entry);
      
      // Get file type and icon
      const { typeIcon, typeLabel } = this._getFileTypeInfo(entry);
      
      // Create card content
      card.innerHTML = `
        <div class="card-preview ${hasPreview ? 'has-preview' : ''}">
          ${hasPreview ? this._renderPreview(entry) : 
            `<div class="file-icon">
              <i class="${typeIcon}"></i>
              <span class="file-type">${typeLabel}</span>
            </div>`
          }
        </div>
        <div class="card-info">
          <div class="card-title" title="${this._getDisplayName(entry)}">${this._getDisplayName(entry)}</div>
          <div class="card-meta">
            <span class="card-size">${this._formatSize(entry.size)}</span>
            <span class="card-date" title="Added: ${new Date(entry.created_at).toLocaleString()}">
              ${this._formatDate(entry.created_at)}
            </span>
          </div>
          <div class="card-path" title="${entry.path}">${entry.path}</div>
        </div>
        <div class="card-actions">
          <button class="view-button" title="View Details"><i class="fas fa-info-circle"></i></button>
          <button class="open-button" title="Open Content"><i class="fas fa-external-link-alt"></i></button>
          <button class="more-button" title="More Actions"><i class="fas fa-ellipsis-v"></i></button>
        </div>
      `;
      
      grid.appendChild(card);
    });
    
    gridContainer.appendChild(grid);
    return gridContainer;
  }
  
  /**
   * Render the table view of content entries
   * @returns {HTMLElement} Table container
   * @private
   */
  _renderTableView() {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'metadata-table-container';
    
    // Create the table
    const table = document.createElement('table');
    table.className = 'metadata-table';
    
    // Create table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th class="column-icon"></th>
        <th class="column-cid">CID</th>
        <th class="column-path">Path</th>
        <th class="column-type">Type</th>
        <th class="column-size">Size</th>
        <th class="column-created">Created</th>
        <th class="column-updated">Updated</th>
        <th class="column-actions">Actions</th>
      </tr>
    `;
    table.appendChild(thead);
    
    // Create table body
    const tbody = document.createElement('tbody');
    
    // Add entries to table
    this.entries.forEach(entry => {
      const row = document.createElement('tr');
      row.dataset.cid = entry.cid;
      
      // Add selected class if this entry is selected
      if (this.selectedEntry && this.selectedEntry.cid === entry.cid) {
        row.classList.add('selected');
      }
      
      // Get file type and icon
      const { typeIcon, typeLabel } = this._getFileTypeInfo(entry);
      
      // Create row content
      row.innerHTML = `
        <td class="column-icon"><i class="${typeIcon}"></i></td>
        <td class="column-cid" title="${entry.cid}">${this._truncateText(entry.cid, 10)}</td>
        <td class="column-path" title="${entry.path}">${entry.path}</td>
        <td class="column-type">${typeLabel}</td>
        <td class="column-size">${this._formatSize(entry.size)}</td>
        <td class="column-created" title="${new Date(entry.created_at).toLocaleString()}">
          ${this._formatDate(entry.created_at)}
        </td>
        <td class="column-updated" title="${new Date(entry.updated_at).toLocaleString()}">
          ${this._formatDate(entry.updated_at)}
        </td>
        <td class="column-actions">
          <button class="view-button" title="View Details"><i class="fas fa-info-circle"></i></button>
          <button class="open-button" title="Open Content"><i class="fas fa-external-link-alt"></i></button>
          <button class="more-button" title="More Actions"><i class="fas fa-ellipsis-v"></i></button>
        </td>
      `;
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    
    return tableContainer;
  }
  
  /**
   * Render the detail panel for the selected entry
   * @returns {HTMLElement} Detail panel
   * @private
   */
  _renderDetailPanel() {
    const entry = this.selectedEntry;
    
    if (!entry) return null;
    
    const detailPanel = document.createElement('div');
    detailPanel.className = 'metadata-detail-panel';
    
    // Panel header with actions
    const panelHeader = document.createElement('div');
    panelHeader.className = 'detail-panel-header';
    panelHeader.innerHTML = `
      <h3>Content Details</h3>
      <div class="panel-actions">
        <button class="close-panel-button" title="Close Panel"><i class="fas fa-times"></i></button>
      </div>
    `;
    detailPanel.appendChild(panelHeader);
    
    // Panel content
    const panelContent = document.createElement('div');
    panelContent.className = 'detail-panel-content';
    
    // Preview section if available
    if (this._canPreview(entry)) {
      const previewSection = document.createElement('div');
      previewSection.className = 'detail-preview-section';
      previewSection.innerHTML = `
        <div class="detail-preview">
          ${this._renderPreview(entry, 'large')}
        </div>
      `;
      panelContent.appendChild(previewSection);
    }
    
    // Basic info section
    const basicInfo = document.createElement('div');
    basicInfo.className = 'detail-info-section';
    basicInfo.innerHTML = `
      <h4>Basic Information</h4>
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">CID</div>
          <div class="info-value">
            <span class="code">${entry.cid}</span>
            <button class="copy-button" data-value="${entry.cid}" title="Copy CID">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
        <div class="info-row">
          <div class="info-label">Path</div>
          <div class="info-value">
            <span>${entry.path}</span>
            <button class="copy-button" data-value="${entry.path}" title="Copy Path">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
        <div class="info-row">
          <div class="info-label">MIME Type</div>
          <div class="info-value">${entry.mimetype || 'Unknown'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Size</div>
          <div class="info-value">${this._formatSize(entry.size)}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Created</div>
          <div class="info-value">${new Date(entry.created_at).toLocaleString()}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Updated</div>
          <div class="info-value">${new Date(entry.updated_at).toLocaleString()}</div>
        </div>
      </div>
    `;
    panelContent.appendChild(basicInfo);
    
    // Storage locations section if available
    if (entry.locations && Object.keys(entry.locations).length > 0) {
      const locationsSection = document.createElement('div');
      locationsSection.className = 'detail-locations-section';
      
      let locationsHtml = '<h4>Storage Locations</h4><div class="locations-list">';
      
      Object.entries(entry.locations).forEach(([location, details]) => {
        locationsHtml += `
          <div class="location-item">
            <div class="location-name">${location}</div>
            <div class="location-details">
        `;
        
        if (typeof details === 'object') {
          Object.entries(details).forEach(([key, value]) => {
            locationsHtml += `
              <div class="location-detail">
                <span class="detail-label">${key}:</span>
                <span class="detail-value">${value}</span>
              </div>
            `;
          });
        } else {
          locationsHtml += `<div class="location-detail">${details}</div>`;
        }
        
        locationsHtml += `
            </div>
          </div>
        `;
      });
      
      locationsHtml += '</div>';
      locationsSection.innerHTML = locationsHtml;
      panelContent.appendChild(locationsSection);
    }
    
    // Tags section if available
    if (entry.tags && entry.tags.length > 0) {
      const tagsSection = document.createElement('div');
      tagsSection.className = 'detail-tags-section';
      
      let tagsHtml = '<h4>Tags</h4><div class="tags-list">';
      
      entry.tags.forEach(tag => {
        tagsHtml += `<span class="tag">${tag}</span>`;
      });
      
      tagsHtml += '</div>';
      tagsSection.innerHTML = tagsHtml;
      panelContent.appendChild(tagsSection);
    }
    
    // Additional metadata section if available
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metadataSection = document.createElement('div');
      metadataSection.className = 'detail-metadata-section';
      metadataSection.innerHTML = `
        <h4>Additional Metadata</h4>
        <div class="metadata-json">
          <pre>${JSON.stringify(entry.metadata, null, 2)}</pre>
        </div>
      `;
      panelContent.appendChild(metadataSection);
    }
    
    detailPanel.appendChild(panelContent);
    
    // Panel footer with actions
    const panelFooter = document.createElement('div');
    panelFooter.className = 'detail-panel-footer';
    panelFooter.innerHTML = `
      <div class="panel-actions">
        <button class="open-ipfs-button">
          <i class="fas fa-globe"></i> Open in IPFS Gateway
        </button>
        <button class="edit-button">
          <i class="fas fa-edit"></i> Edit Metadata
        </button>
        <button class="delete-button">
          <i class="fas fa-trash"></i> Delete Entry
        </button>
      </div>
    `;
    detailPanel.appendChild(panelFooter);
    
    return detailPanel;
  }
  
  /**
   * Render the footer with pagination controls
   * @returns {HTMLElement} Footer element
   * @private
   */
  _renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'metadata-browser-footer';
    
    // Calculate pagination information
    const start = (this.currentPage - 1) * this.config.pageSize + 1;
    const end = Math.min(start + this.entries.length - 1, this.totalEntries);
    const hasMore = end < this.totalEntries;
    
    // Create footer content
    footer.innerHTML = `
      <div class="pagination-info">
        ${this.totalEntries > 0 ? 
          `Showing ${start} to ${end} of ${this.totalEntries} entries` : 
          'No entries to display'}
      </div>
      
      <div class="pagination-controls">
        ${this.config.enableInfiniteScroll && hasMore ? 
          `<button class="load-more-button">
            Load More <i class="fas fa-chevron-down"></i>
          </button>` : ''}
        
        ${!this.config.enableInfiniteScroll ? 
          `<div class="pagination-buttons">
            <button class="page-button prev-page" ${this.currentPage <= 1 ? 'disabled' : ''}>
              <i class="fas fa-chevron-left"></i> Previous
            </button>
            <span class="page-indicator">Page ${this.currentPage}</span>
            <button class="page-button next-page" ${!hasMore ? 'disabled' : ''}>
              Next <i class="fas fa-chevron-right"></i>
            </button>
          </div>` : ''}
      </div>
    `;
    
    return footer;
  }
  
  /**
   * Render a preview for the given entry
   * @param {Object} entry - Content entry
   * @param {string} size - Preview size ('small', 'medium', 'large')
   * @returns {string} Preview HTML
   * @private
   */
  _renderPreview(entry, size = 'medium') {
    // Handle different preview types based on MIME type
    const mimetype = entry.mimetype || '';
    
    if (mimetype.startsWith('image/')) {
      // Image preview
      return `
        <div class="preview-image size-${size}">
          <img src="https://ipfs.io/ipfs/${entry.cid}" alt="${this._getDisplayName(entry)}" 
               loading="lazy" onerror="this.onerror=null; this.src=''; this.classList.add('error');">
        </div>
      `;
    } else if (mimetype.startsWith('video/')) {
      // Video preview (thumbnail)
      return `
        <div class="preview-video size-${size}">
          <div class="video-thumbnail">
            <i class="fas fa-play-circle"></i>
          </div>
        </div>
      `;
    } else if (mimetype.startsWith('audio/')) {
      // Audio preview
      return `
        <div class="preview-audio size-${size}">
          <i class="fas fa-volume-up"></i>
          <span class="audio-label">${this._getFileExtension(entry.path)}</span>
        </div>
      `;
    } else if (mimetype === 'application/pdf') {
      // PDF preview
      return `
        <div class="preview-pdf size-${size}">
          <i class="fas fa-file-pdf"></i>
          <span class="pdf-label">PDF</span>
        </div>
      `;
    } else {
      // Default preview (file icon)
      const { typeIcon, typeLabel } = this._getFileTypeInfo(entry);
      return `
        <div class="preview-file size-${size}">
          <i class="${typeIcon}"></i>
          <span class="file-type">${typeLabel}</span>
        </div>
      `;
    }
  }
  
  /**
   * Add event listeners to the UI elements
   * @private
   */
  _addEventListeners() {
    // View toggle buttons
    const viewButtons = this.container.querySelectorAll('.view-button[data-view]');
    viewButtons.forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        this.toggleViewMode(view);
      });
    });
    
    // Sort select
    const sortSelect = this.container.querySelector('.sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const [field, direction] = sortSelect.value.split('-');
        this.sort({ field, direction });
      });
    }
    
    // Refresh button
    const refreshButton = this.container.querySelector('.refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refresh());
    }
    
    // Entry selection (in grid view)
    const gridCards = this.container.querySelectorAll('.metadata-card');
    gridCards.forEach(card => {
      card.addEventListener('click', (event) => {
        // Ignore clicks on buttons
        if (event.target.closest('button')) return;
        
        const cid = card.dataset.cid;
        this._handleEntryClick(cid);
      });
    });
    
    // Entry selection (in table view)
    const tableRows = this.container.querySelectorAll('.metadata-table tbody tr');
    tableRows.forEach(row => {
      row.addEventListener('click', (event) => {
        // Ignore clicks on buttons
        if (event.target.closest('button')) return;
        
        const cid = row.dataset.cid;
        this._handleEntryClick(cid);
      });
    });
    
    // View buttons in grid and table
    const viewDetailButtons = this.container.querySelectorAll('.view-button:not([data-view])');
    viewDetailButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const entryElement = button.closest('[data-cid]');
        if (entryElement) {
          const cid = entryElement.dataset.cid;
          this.selectEntry(cid);
        }
      });
    });
    
    // Open buttons
    const openButtons = this.container.querySelectorAll('.open-button');
    openButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const entryElement = button.closest('[data-cid]');
        if (entryElement) {
          const cid = entryElement.dataset.cid;
          this._handleOpenEntry(cid);
        }
      });
    });
    
    // Close detail panel button
    const closeDetailButton = this.container.querySelector('.close-panel-button');
    if (closeDetailButton) {
      closeDetailButton.addEventListener('click', () => {
        this.selectedEntry = null;
        this.render();
      });
    }
    
    // Load more button
    const loadMoreButton = this.container.querySelector('.load-more-button');
    if (loadMoreButton) {
      loadMoreButton.addEventListener('click', () => this.loadMore());
    }
    
    // Pagination buttons
    const prevPageButton = this.container.querySelector('.prev-page');
    if (prevPageButton) {
      prevPageButton.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.refresh();
        }
      });
    }
    
    const nextPageButton = this.container.querySelector('.next-page');
    if (nextPageButton) {
      nextPageButton.addEventListener('click', () => {
        this.currentPage++;
        this.refresh();
      });
    }
    
    // Copy buttons in detail panel
    const copyButtons = this.container.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
      button.addEventListener('click', () => {
        const value = button.dataset.value;
        if (value) {
          this._copyToClipboard(value);
          
          // Show copied indicator
          button.innerHTML = '<i class="fas fa-check"></i>';
          button.classList.add('copied');
          
          setTimeout(() => {
            button.innerHTML = '<i class="fas fa-copy"></i>';
            button.classList.remove('copied');
          }, 2000);
        }
      });
    });
    
    // Open in IPFS Gateway button
    const openIpfsButton = this.container.querySelector('.open-ipfs-button');
    if (openIpfsButton && this.selectedEntry) {
      openIpfsButton.addEventListener('click', () => {
        window.open(`https://ipfs.io/ipfs/${this.selectedEntry.cid}`, '_blank');
      });
    }
    
    // Edit metadata button
    const editButton = this.container.querySelector('.edit-button');
    if (editButton && this.selectedEntry) {
      editButton.addEventListener('click', () => {
        this._handleEditEntry(this.selectedEntry.cid);
      });
    }
    
    // Delete entry button
    const deleteButton = this.container.querySelector('.delete-button');
    if (deleteButton && this.selectedEntry) {
      deleteButton.addEventListener('click', () => {
        this._handleDeleteEntry(this.selectedEntry.cid);
      });
    }
  }
  
  /**
   * Handle entry click event
   * @param {string} cid - Content ID
   * @private
   */
  _handleEntryClick(cid) {
    // Toggle selection if the entry is already selected
    if (this.selectedEntry && this.selectedEntry.cid === cid) {
      this.selectedEntry = null;
    } else {
      this.selectEntry(cid);
    }
  }
  
  /**
   * Handle open entry action
   * @param {string} cid - Content ID
   * @private
   */
  _handleOpenEntry(cid) {
    // Open the content in IPFS gateway
    window.open(`https://ipfs.io/ipfs/${cid}`, '_blank');
  }
  
  /**
   * Handle edit entry action
   * @param {string} cid - Content ID
   * @private
   */
  _handleEditEntry(cid) {
    // Show edit modal or navigate to edit page
    console.log(`Edit entry ${cid}`);
    
    // Emit event if event bus is available
    if (this.eventBus) {
      this.eventBus.emit('content-browser:edit-entry', cid);
    }
  }
  
  /**
   * Handle delete entry action
   * @param {string} cid - Content ID
   * @private
   */
  _handleDeleteEntry(cid) {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to delete this entry? This action cannot be undone.');
    
    if (confirmed) {
      // Call bridge to delete entry
      this.bridge.deleteEntry(cid)
        .then(result => {
          if (result && result.success) {
            // Remove entry from list
            this.entries = this.entries.filter(entry => entry.cid !== cid);
            this.totalEntries--;
            
            // Clear selection if deleted entry was selected
            if (this.selectedEntry && this.selectedEntry.cid === cid) {
              this.selectedEntry = null;
            }
            
            // Update UI
            this.render();
            
            // Show success message
            this._showNotification('Entry deleted successfully', 'success');
            
            // Emit event if event bus is available
            if (this.eventBus) {
              this.eventBus.emit('content-browser:entry-deleted', cid);
            }
          } else {
            throw new Error(result?.message || 'Failed to delete entry');
          }
        })
        .catch(error => {
          console.error(`Failed to delete entry ${cid}:`, error);
          this._showNotification(`Failed to delete entry: ${error.message}`, 'error');
        });
    }
  }
  
  /**
   * Handle real-time entry added notification
   * @param {Object} entry - Added entry
   * @private
   */
  _handleEntryAdded(entry) {
    // Check if entry should be included in current view (based on filter/sort)
    const shouldInclude = this._matchesCurrentCriteria(entry);
    
    if (shouldInclude) {
      // Add entry to list
      this.entries.push(entry);
      this.totalEntries++;
      
      // Sort entries based on current sort
      this._sortEntries();
      
      // Update UI
      this.render();
      
      // Show notification
      this._showNotification('New content added', 'info');
    }
  }
  
  /**
   * Handle real-time entry updated notification
   * @param {Object} entry - Updated entry
   * @private
   */
  _handleEntryUpdated(entry) {
    // Find existing entry
    const existingIndex = this.entries.findIndex(e => e.cid === entry.cid);
    
    if (existingIndex >= 0) {
      // Check if updated entry still matches criteria
      const shouldInclude = this._matchesCurrentCriteria(entry);
      
      if (shouldInclude) {
        // Update entry in list
        this.entries[existingIndex] = entry;
        
        // Sort entries based on current sort
        this._sortEntries();
        
        // Update UI
        this.render();
        
        // Show notification
        this._showNotification('Content updated', 'info');
      } else {
        // Remove entry from list if it no longer matches criteria
        this.entries.splice(existingIndex, 1);
        
        // Update UI
        this.render();
      }
    } else {
      // Check if entry should be included in current view
      const shouldInclude = this._matchesCurrentCriteria(entry);
      
      if (shouldInclude) {
        // Add entry to list
        this.entries.push(entry);
        
        // Sort entries based on current sort
        this._sortEntries();
        
        // Update UI
        this.render();
        
        // Show notification
        this._showNotification('New content added', 'info');
      }
    }
    
    // Update selected entry if it was updated
    if (this.selectedEntry && this.selectedEntry.cid === entry.cid) {
      this.selectedEntry = entry;
    }
  }
  
  /**
   * Handle real-time entry deleted notification
   * @param {string} cid - Deleted content ID
   * @private
   */
  _handleEntryDeleted(cid) {
    // Find existing entry
    const existingIndex = this.entries.findIndex(e => e.cid === cid);
    
    if (existingIndex >= 0) {
      // Remove entry from list
      this.entries.splice(existingIndex, 1);
      this.totalEntries--;
      
      // Clear selection if deleted entry was selected
      if (this.selectedEntry && this.selectedEntry.cid === cid) {
        this.selectedEntry = null;
      }
      
      // Update UI
      this.render();
      
      // Show notification
      this._showNotification('Content removed', 'warning');
    }
  }
  
  /**
   * Check if an entry matches the current filter/search criteria
   * @param {Object} entry - Content entry to check
   * @returns {boolean} Whether the entry matches
   * @private
   */
  _matchesCurrentCriteria(entry) {
    // Check query string
    if (this.currentQuery && this.currentQuery.trim() !== '') {
      const query = this.currentQuery.toLowerCase();
      const matchesCid = entry.cid.toLowerCase().includes(query);
      const matchesPath = entry.path.toLowerCase().includes(query);
      const matchesMime = (entry.mimetype || '').toLowerCase().includes(query);
      
      if (!matchesCid && !matchesPath && !matchesMime) {
        return false;
      }
    }
    
    // Check filters
    if (this.currentFilter) {
      // Type filter
      if (this.currentFilter.type && entry.mimetype) {
        if (!entry.mimetype.startsWith(this.currentFilter.type)) {
          return false;
        }
      }
      
      // Size range filter
      if (this.currentFilter.sizeMin && entry.size < this.currentFilter.sizeMin) {
        return false;
      }
      
      if (this.currentFilter.sizeMax && entry.size > this.currentFilter.sizeMax) {
        return false;
      }
      
      // Date range filter
      if (this.currentFilter.createdAfter) {
        const afterDate = new Date(this.currentFilter.createdAfter);
        const entryDate = new Date(entry.created_at);
        if (entryDate < afterDate) {
          return false;
        }
      }
      
      if (this.currentFilter.createdBefore) {
        const beforeDate = new Date(this.currentFilter.createdBefore);
        const entryDate = new Date(entry.created_at);
        if (entryDate > beforeDate) {
          return false;
        }
      }
      
      // Tags filter
      if (this.currentFilter.tags && this.currentFilter.tags.length > 0) {
        if (!entry.tags || !Array.isArray(entry.tags)) {
          return false;
        }
        
        const hasAllTags = this.currentFilter.tags.every(tag => 
          entry.tags.includes(tag)
        );
        
        if (!hasAllTags) {
          return false;
        }
      }
      
      // Storage location filter
      if (this.currentFilter.location) {
        if (!entry.locations || !entry.locations[this.currentFilter.location]) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Sort entries based on current sort configuration
   * @private
   */
  _sortEntries() {
    const { field, direction } = this.currentSort;
    
    this.entries.sort((a, b) => {
      let valueA = a[field];
      let valueB = b[field];
      
      // Handle special cases
      if (field === 'created_at' || field === 'updated_at') {
        valueA = new Date(valueA).getTime();
        valueB = new Date(valueB).getTime();
      } else if (field === 'size') {
        valueA = valueA || 0;
        valueB = valueB || 0;
      } else if (field === 'path') {
        valueA = valueA || '';
        valueB = valueB || '';
      }
      
      // Compare based on direction
      if (direction === 'asc') {
        return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      } else {
        return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
      }
    });
  }
  
  /**
   * Get file type information based on entry
   * @param {Object} entry - Content entry
   * @returns {Object} Type icon and label information
   * @private
   */
  _getFileTypeInfo(entry) {
    const mimetype = entry.mimetype || '';
    const extension = this._getFileExtension(entry.path);
    
    if (mimetype.startsWith('image/')) {
      return { typeIcon: 'fas fa-image', typeLabel: 'Image' };
    } else if (mimetype.startsWith('video/')) {
      return { typeIcon: 'fas fa-video', typeLabel: 'Video' };
    } else if (mimetype.startsWith('audio/')) {
      return { typeIcon: 'fas fa-volume-up', typeLabel: 'Audio' };
    } else if (mimetype === 'application/pdf') {
      return { typeIcon: 'fas fa-file-pdf', typeLabel: 'PDF' };
    } else if (mimetype.includes('text/')) {
      return { typeIcon: 'fas fa-file-alt', typeLabel: 'Text' };
    } else if (extension === 'json') {
      return { typeIcon: 'fas fa-file-code', typeLabel: 'JSON' };
    } else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(extension)) {
      return { typeIcon: 'fas fa-file-archive', typeLabel: 'Archive' };
    } else if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'php', 'rb'].includes(extension)) {
      return { typeIcon: 'fas fa-file-code', typeLabel: 'Code' };
    } else {
      return { typeIcon: 'fas fa-file', typeLabel: 'File' };
    }
  }
  
  /**
   * Check if an entry has a previewable content type
   * @param {Object} entry - Content entry
   * @returns {boolean} Whether the entry can be previewed
   * @private
   */
  _canPreview(entry) {
    const mimetype = entry.mimetype || '';
    
    // Check if MIME type matches any of the configured preview types
    return this.config.previewTypes.some(pattern => {
      if (pattern.endsWith('/*')) {
        // Check type category (e.g., 'image/*')
        const category = pattern.substr(0, pattern.length - 2);
        return mimetype.startsWith(`${category}/`);
      } else {
        // Exact match
        return mimetype === pattern;
      }
    });
  }
  
  /**
   * Format size in human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  _formatSize(bytes) {
    if (bytes === undefined || bytes === null) return 'Unknown';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Format date in readable format
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date
   * @private
   */
  _formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    
    // Check if date is today
    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Check if date is yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Check if date is within last 7 days
    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 7);
    if (date > lastWeek) {
      return date.toLocaleDateString([], { weekday: 'long' });
    }
    
    // For older dates, show full date without time
    return date.toLocaleDateString();
  }
  
  /**
   * Extract file extension from path
   * @param {string} path - File path
   * @returns {string} File extension
   * @private
   */
  _getFileExtension(path) {
    if (!path) return '';
    
    const parts = path.split('.');
    if (parts.length < 2) return '';
    
    return parts[parts.length - 1].toLowerCase();
  }
  
  /**
   * Get display name for an entry
   * @param {Object} entry - Content entry
   * @returns {string} Display name
   * @private
   */
  _getDisplayName(entry) {
    if (!entry) return '';
    
    // Extract filename from path
    const path = entry.path || '';
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    
    if (filename) return filename;
    
    // Use shortened CID if no filename
    return this._truncateText(entry.cid, 8);
  }
  
  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} length - Maximum length
   * @returns {string} Truncated text
   * @private
   */
  _truncateText(text, length) {
    if (!text) return '';
    
    if (text.length <= length) return text;
    
    // For CIDs, show beginning and end
    if (text.startsWith('Qm') || text.startsWith('bafy')) {
      const start = text.substring(0, length / 2);
      const end = text.substring(text.length - length / 2);
      return `${start}...${end}`;
    }
    
    // For normal text, just truncate with ellipsis at the end
    return text.substring(0, length) + '...';
  }
  
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @private
   */
  _copyToClipboard(text) {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    
    // Select and copy
    textarea.select();
    document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textarea);
  }
  
  /**
   * Show notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type ('success', 'error', 'info', 'warning')
   * @private
   */
  _showNotification(message, type = 'info') {
    // Emit notification event if event bus is available
    if (this.eventBus) {
      this.eventBus.emit('notification', {
        message,
        type,
        source: 'metadata-browser'
      });
    } else {
      // Fallback to console
      console.log(`Notification (${type}): ${message}`);
    }
  }
}

export default MetadataBrowser;