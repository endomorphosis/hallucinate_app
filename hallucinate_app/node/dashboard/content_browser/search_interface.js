/**
 * Search Interface Component for PyArrow Content Index Dashboard
 * 
 * Provides an advanced search interface with filtering, saved searches, 
 * and comprehensive query capabilities for content metadata.
 * 
 * @module dashboard/content_browser/search_interface
 */

/**
 * Interop contract advertised for HAO-740 / VAIOS-G707: proves that the
 * Hallucinate App desktop search surface can hand off a search request to
 * the mobile ORB bridge (`mobile/src/orb/metaGlassesOrbDescriptors.js`)
 * through the shared control-surface contract.
 */
export const HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT = {
  contract_id: 'interface contract hallucinate_app mobile',
  name: 'hallucinate_app_mobile_search_handoff',
  namespace: 'handsfree.hallucinate_app.mobile',
  version: '0.1.0',
  source_surface: 'hallucinate_app',
  target_surface: 'mobile',
  control_surface_contract_ref: 'control_surface_contract:hallucinate-app:remote-client',
  route: '/v1/mobile/orb/invoke_service',
  operation: 'invoke_service',
  descriptor_path:
    'hallucinate_app/hallucinate_app/node/dashboard/content_browser/search_interface.js',
  required_artifacts: ['interaction_envelope', 'policy_decision', 'mediation_receipt'],
};

/**
 * Build the normalized mobile ORB handoff payload for a desktop search.
 *
 * @param {string} query - The search query submitted on the desktop surface.
 * @param {Object} [options] - Optional overrides.
 * @param {Object} [options.filter] - Current search filter criteria.
 * @param {string} [options.result_target] - Where mobile should render results.
 * @param {string} [options.correlation_id] - Correlation id for the handoff.
 * @param {string} [options.issued_at] - ISO timestamp override (testing).
 * @returns {Object} Normalized handoff envelope for the mobile ORB bridge.
 */
export function buildHallucinateAppMobileSearchHandoff(query, options = {}) {
  const text = typeof query === 'string' ? query : '';
  const filter =
    options.filter && typeof options.filter === 'object' && !Array.isArray(options.filter)
      ? options.filter
      : {};
  const issuedAt = options.issued_at || new Date().toISOString();
  const correlationId =
    options.correlation_id || `hallucinate-app-mobile-search-${Date.now()}`;

  return {
    contract_id: HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT.contract_id,
    source_surface: HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT.source_surface,
    target_surface: HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT.target_surface,
    route: HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT.route,
    operation: HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT.operation,
    control_surface_contract_ref:
      HALLUCINATE_APP_MOBILE_SEARCH_INTEROP_CONTRACT.control_surface_contract_ref,
    correlation_id: correlationId,
    issued_at: issuedAt,
    payload: {
      intent: 'hallucinate_app.content_browser.search',
      query: text,
      filter,
      result_target: options.result_target || 'mobile_card',
    },
    normalized_intent: {
      intent: 'hallucinate_app.content_browser.search',
      method: 'invoke_service',
      target_ref:
        'handsfree.meta_glasses.mobile.mobile_orb_bridge.invoke_service',
      arguments: {
        query: text,
        filter,
        result_target: options.result_target || 'mobile_card',
      },
      confidence: 1.0,
    },
  };
}

export class SearchInterface {
  /**
   * Create a new SearchInterface component
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Object} options.bridge - PyArrow index bridge or secure manager
   * @param {Object} options.eventBus - Event bus for component communication
   * @param {Function} options.onSearch - Callback when search is performed
   * @param {Function} options.onFilterChange - Callback when filters change
   * @param {Object} options.config - Component configuration
   */
  constructor(options = {}) {
    this.container = options.container;
    this.bridge = options.bridge;
    this.eventBus = options.eventBus;
    this.onSearch = options.onSearch;
    this.onFilterChange = options.onFilterChange;
    
    // Default configuration with overrides from options
    this.config = {
      enableSavedSearches: true,
      enableSearchHistory: true,
      maxHistoryItems: 10,
      maxSavedSearches: 20,
      defaultExpandedState: false,
      localStoragePrefix: 'pyarrow_index_search_',
      availableFilters: [
        'mimetype', 'size', 'date', 'tags', 'location', 'metadata'
      ],
      suggestedTags: [],
      suggestedMetadataKeys: [],
      ...options.config
    };
    
    // State
    this.initialized = false;
    this.expanded = this.config.defaultExpandedState;
    this.currentQuery = '';
    this.currentFilter = {};
    this.savedSearches = [];
    this.searchHistory = [];
    this.availableMimeTypes = [];
    this.availableLocations = [];
    this.loading = false;
    this.error = null;
    this.eventListeners = {};
    
    // Bind methods
    this._bindMethods();
  }
  
  /**
   * Bind class methods to maintain context
   * @private
   */
  _bindMethods() {
    this.init = this.init.bind(this);
    this.render = this.render.bind(this);
    this.search = this.search.bind(this);
    this.applyFilter = this.applyFilter.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.saveSearch = this.saveSearch.bind(this);
    this.toggleExpanded = this.toggleExpanded.bind(this);
    this.on = this.on.bind(this);
    this.emit = this.emit.bind(this);
    this.refreshSuggestions = this.refreshSuggestions.bind(this);
    this.dispose = this.dispose.bind(this);
    this._handleSearchSubmit = this._handleSearchSubmit.bind(this);
    this._handleAdvancedSearch = this._handleAdvancedSearch.bind(this);
    this._handleSavedSearchSelect = this._handleSavedSearchSelect.bind(this);
    this._handleSearchHistorySelect = this._handleSearchHistorySelect.bind(this);
    this._initSavedSearches = this._initSavedSearches.bind(this);
    this._initSearchHistory = this._initSearchHistory.bind(this);
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
      
      // Load metadata for search suggestions
      await this._loadMetadata();
      
      // Load saved searches
      this._initSavedSearches();
      
      // Load search history
      this._initSearchHistory();
      
      // Register with event bus if available
      if (this.eventBus) {
        // Listen for external search requests
        this.eventBus.on('search-interface:perform-search', (query) => this.search(query));
        this.eventBus.on('search-interface:apply-filter', (filter) => this.applyFilter(filter));
        this.eventBus.on('search-interface:clear-search', () => this.clearSearch());
      }
      
      this.initialized = true;
      this.loading = false;
      this.render();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize SearchInterface:', error);
      this.error = error;
      this.loading = false;
      this.render();
      return false;
    }
  }
  
  /**
   * Load metadata for search suggestions
   * @private
   */
  async _loadMetadata() {
    try {
      // Get index stats to extract metadata for search suggestions
      const stats = await this.bridge.getStats();
      
      if (stats) {
        // Extract available MIME types
        if (stats.mimeTypes && Array.isArray(stats.mimeTypes)) {
          this.availableMimeTypes = stats.mimeTypes;
        }
        
        // Extract available storage locations
        if (stats.locations && Array.isArray(stats.locations)) {
          this.availableLocations = stats.locations;
        }
        
        // Extract common tags
        if (stats.tags && Array.isArray(stats.tags)) {
          this.config.suggestedTags = stats.tags.slice(0, 20); // Top 20 tags
        }
        
        // Extract common metadata keys
        if (stats.metadataKeys && Array.isArray(stats.metadataKeys)) {
          this.config.suggestedMetadataKeys = stats.metadataKeys.slice(0, 20); // Top 20 keys
        }
      }
    } catch (error) {
      console.error('Failed to load search metadata:', error);
      // Continue without suggestions - not critical
    }
  }
  
  /**
   * Initialize saved searches from local storage
   * @private
   */
  _initSavedSearches() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const savedSearchesKey = `${this.config.localStoragePrefix}saved_searches`;
      const savedSearchesJson = localStorage.getItem(savedSearchesKey);
      
      if (savedSearchesJson) {
        this.savedSearches = JSON.parse(savedSearchesJson);
      }
    } catch (error) {
      console.error('Failed to load saved searches:', error);
      this.savedSearches = [];
    }
  }
  
  /**
   * Initialize search history from local storage
   * @private
   */
  _initSearchHistory() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const searchHistoryKey = `${this.config.localStoragePrefix}search_history`;
      const searchHistoryJson = localStorage.getItem(searchHistoryKey);
      
      if (searchHistoryJson) {
        this.searchHistory = JSON.parse(searchHistoryJson);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
      this.searchHistory = [];
    }
  }
  
  /**
   * Save searches to local storage
   * @private
   */
  _saveToLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      // Save search history
      const searchHistoryKey = `${this.config.localStoragePrefix}search_history`;
      localStorage.setItem(searchHistoryKey, JSON.stringify(this.searchHistory));
      
      // Save saved searches
      const savedSearchesKey = `${this.config.localStoragePrefix}saved_searches`;
      localStorage.setItem(savedSearchesKey, JSON.stringify(this.savedSearches));
    } catch (error) {
      console.error('Failed to save to local storage:', error);
    }
  }
  
  /**
   * Toggle expanded state of advanced search
   */
  toggleExpanded() {
    this.expanded = !this.expanded;
    this.render();
  }
  
  /**
   * Perform a search
   * @param {string} query - Search query
   */
  search(query) {
    this.currentQuery = query || '';
    const mobileHandoff = buildHallucinateAppMobileSearchHandoff(this.currentQuery, {
      filter: this.currentFilter,
    });
    
    // Add to search history
    this._addToSearchHistory(this.currentQuery, this.currentFilter);
    
    // Call search callback
    if (typeof this.onSearch === 'function') {
      this.onSearch(this.currentQuery);
    }
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('content-browser:search', this.currentQuery);
      this.eventBus.emit('hallucinate_app-mobile:handoff', mobileHandoff);
    }
    
    // Emit event for direct listeners
    this.emit('search', this.currentQuery);
    this.emit('mobile-handoff', mobileHandoff);
  }
  
  /**
   * Apply filter criteria
   * @param {Object} filter - Filter criteria
   */
  applyFilter(filter) {
    this.currentFilter = filter || {};
    
    // Call filter callback
    if (typeof this.onFilterChange === 'function') {
      this.onFilterChange(this.currentFilter);
    }
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('content-browser:filter', this.currentFilter);
    }
    
    // Emit event for direct listeners
    this.emit('filter-change', this.currentFilter);
  }
  
  /**
   * Clear current search and filters
   */
  clearSearch() {
    this.currentQuery = '';
    this.currentFilter = {};
    
    // Render with cleared search state
    this.render();
    
    // Call callbacks
    if (typeof this.onSearch === 'function') {
      this.onSearch('');
    }
    
    if (typeof this.onFilterChange === 'function') {
      this.onFilterChange({});
    }
    
    // Emit events
    if (this.eventBus) {
      this.eventBus.emit('content-browser:search', '');
      this.eventBus.emit('content-browser:filter', {});
    }
  }
  
  /**
   * Save current search to saved searches
   * @param {string} name - Name for saved search
   */
  saveSearch(name) {
    if (!name) {
      name = `Search ${this.savedSearches.length + 1}`;
    }
    
    // Create saved search object
    const savedSearch = {
      id: Date.now().toString(),
      name,
      query: this.currentQuery,
      filter: this.currentFilter,
      timestamp: new Date().toISOString()
    };
    
    // Add to saved searches
    this.savedSearches.unshift(savedSearch);
    
    // Limit number of saved searches
    if (this.savedSearches.length > this.config.maxSavedSearches) {
      this.savedSearches = this.savedSearches.slice(0, this.config.maxSavedSearches);
    }
    
    // Save to local storage
    this._saveToLocalStorage();
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('search-interface:saved-search-added', savedSearch);
    }
    
    // Re-render
    this.render();
  }
  
  /**
   * Delete a saved search
   * @param {string} id - ID of saved search to delete
   */
  deleteSavedSearch(id) {
    // Find and remove saved search
    this.savedSearches = this.savedSearches.filter(search => search.id !== id);
    
    // Save to local storage
    this._saveToLocalStorage();
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('search-interface:saved-search-deleted', id);
    }
    
    // Re-render
    this.render();
  }
  
  /**
   * Add current search to history
   * @param {string} query - Search query
   * @param {Object} filter - Filter criteria
   * @private
   */
  _addToSearchHistory(query, filter) {
    if (!query && Object.keys(filter).length === 0) {
      return; // Don't add empty searches to history
    }
    
    // Create history entry
    const historyEntry = {
      id: Date.now().toString(),
      query,
      filter,
      timestamp: new Date().toISOString()
    };
    
    // Check if this search is already in history (to avoid duplicates)
    const existingIndex = this.searchHistory.findIndex(item => 
      item.query === query && 
      JSON.stringify(item.filter) === JSON.stringify(filter)
    );
    
    if (existingIndex >= 0) {
      // Remove existing entry
      this.searchHistory.splice(existingIndex, 1);
    }
    
    // Add to history at the beginning
    this.searchHistory.unshift(historyEntry);
    
    // Limit number of history items
    if (this.searchHistory.length > this.config.maxHistoryItems) {
      this.searchHistory = this.searchHistory.slice(0, this.config.maxHistoryItems);
    }
    
    // Save to local storage
    this._saveToLocalStorage();
  }
  
  /**
   * Load a saved search or history item
   * @param {Object} searchItem - Saved search or history item
   */
  loadSearch(searchItem) {
    if (!searchItem) return;
    
    // Set current search and filter
    this.currentQuery = searchItem.query || '';
    this.currentFilter = searchItem.filter || {};
    
    // Update UI components
    const searchInput = this.container.querySelector('.search-input');
    if (searchInput) {
      searchInput.value = this.currentQuery;
    }
    
    // Update advanced search form if available
    this._updateAdvancedSearchForm(this.currentFilter);
    
    // Call callbacks
    if (typeof this.onSearch === 'function') {
      this.onSearch(this.currentQuery);
    }
    
    if (typeof this.onFilterChange === 'function') {
      this.onFilterChange(this.currentFilter);
    }
    
    // Emit events
    if (this.eventBus) {
      this.eventBus.emit('content-browser:search', this.currentQuery);
      this.eventBus.emit('content-browser:filter', this.currentFilter);
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
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-interface-container';
    
    // Add basic search bar
    searchContainer.appendChild(this._renderBasicSearch());
    
    // Add advanced search panel (visible when expanded)
    const advancedPanel = this._renderAdvancedSearch();
    if (this.expanded) {
      advancedPanel.style.display = 'block';
    } else {
      advancedPanel.style.display = 'none';
    }
    searchContainer.appendChild(advancedPanel);
    
    // Add active filters display
    if (Object.keys(this.currentFilter).length > 0) {
      searchContainer.appendChild(this._renderActiveFilters());
    }
    
    // Append to container
    this.container.appendChild(searchContainer);
    
    // Add event listeners
    this._addEventListeners();
  }
  
  /**
   * Render the basic search bar
   * @returns {HTMLElement} Basic search element
   * @private
   */
  _renderBasicSearch() {
    const basicSearch = document.createElement('div');
    basicSearch.className = 'basic-search';
    
    // Create the search form
    basicSearch.innerHTML = `
      <form class="search-form">
        <div class="search-input-container">
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search by CID, path, or content type..." 
            value="${this.currentQuery}"
          >
          <button type="submit" class="search-button">
            <i class="fas fa-search"></i>
          </button>
          ${Object.keys(this.currentFilter).length > 0 || this.currentQuery ? 
            `<button type="button" class="clear-search-button" title="Clear search">
              <i class="fas fa-times"></i>
            </button>` : ''}
        </div>
        
        <div class="search-actions">
          <button type="button" class="toggle-advanced-button" title="${this.expanded ? 'Hide' : 'Show'} advanced search">
            <i class="fas fa-sliders-h"></i> Advanced
          </button>
          
          ${this.config.enableSavedSearches ? 
            `<button type="button" class="saved-searches-button" title="Saved searches">
              <i class="fas fa-bookmark"></i>
            </button>` : ''}
          
          ${this.config.enableSearchHistory ? 
            `<button type="button" class="search-history-button" title="Search history">
              <i class="fas fa-history"></i>
            </button>` : ''}
        </div>
      </form>
    `;
    
    return basicSearch;
  }
  
  /**
   * Render the advanced search panel
   * @returns {HTMLElement} Advanced search element
   * @private
   */
  _renderAdvancedSearch() {
    const advancedSearch = document.createElement('div');
    advancedSearch.className = 'advanced-search';
    advancedSearch.id = 'advanced-search-panel';
    
    // Create the advanced search form
    advancedSearch.innerHTML = `
      <h3>Advanced Search</h3>
      
      <form class="advanced-search-form">
        <!-- File Type (MIME Type) Section -->
        <div class="filter-section">
          <h4>Content Type</h4>
          <div class="filter-content">
            <select class="mimetype-select" id="mimetype-filter">
              <option value="">All types</option>
              ${this.availableMimeTypes.map(type => `
                <option value="${type}" ${this.currentFilter.mimetype === type ? 'selected' : ''}>
                  ${this._formatMimeType(type)}
                </option>
              `).join('')}
              <option value="image/" ${this.currentFilter.mimetype === 'image/' ? 'selected' : ''}>Images</option>
              <option value="video/" ${this.currentFilter.mimetype === 'video/' ? 'selected' : ''}>Videos</option>
              <option value="audio/" ${this.currentFilter.mimetype === 'audio/' ? 'selected' : ''}>Audio</option>
              <option value="text/" ${this.currentFilter.mimetype === 'text/' ? 'selected' : ''}>Text</option>
              <option value="application/pdf" ${this.currentFilter.mimetype === 'application/pdf' ? 'selected' : ''}>PDF Documents</option>
            </select>
            
            <div class="custom-mimetype">
              <label for="custom-mimetype-input">Or enter custom MIME type:</label>
              <input type="text" id="custom-mimetype-input" placeholder="e.g. image/png, text/csv">
            </div>
          </div>
        </div>
        
        <!-- Size Filter Section -->
        <div class="filter-section">
          <h4>Size</h4>
          <div class="filter-content">
            <div class="size-range">
              <div class="size-min">
                <label for="size-min-input">Minimum size:</label>
                <div class="size-input-group">
                  <input 
                    type="number" 
                    id="size-min-input" 
                    min="0" 
                    value="${this.currentFilter.sizeMin || ''}" 
                    placeholder="0"
                  >
                  <select id="size-min-unit">
                    <option value="1">Bytes</option>
                    <option value="1024">KB</option>
                    <option value="1048576" selected>MB</option>
                    <option value="1073741824">GB</option>
                  </select>
                </div>
              </div>
              
              <div class="size-max">
                <label for="size-max-input">Maximum size:</label>
                <div class="size-input-group">
                  <input 
                    type="number" 
                    id="size-max-input" 
                    min="0" 
                    value="${this.currentFilter.sizeMax ? this._formatSizeValue(this.currentFilter.sizeMax).value : ''}" 
                    placeholder="No limit"
                  >
                  <select id="size-max-unit">
                    <option value="1">Bytes</option>
                    <option value="1024">KB</option>
                    <option value="1048576" selected>MB</option>
                    <option value="1073741824">GB</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Date Filter Section -->
        <div class="filter-section">
          <h4>Dates</h4>
          <div class="filter-content">
            <div class="date-range">
              <div class="date-range-item">
                <label for="created-after-input">Created after:</label>
                <input 
                  type="date" 
                  id="created-after-input" 
                  value="${this.currentFilter.createdAfter ? new Date(this.currentFilter.createdAfter).toISOString().split('T')[0] : ''}"
                >
              </div>
              
              <div class="date-range-item">
                <label for="created-before-input">Created before:</label>
                <input 
                  type="date" 
                  id="created-before-input"
                  value="${this.currentFilter.createdBefore ? new Date(this.currentFilter.createdBefore).toISOString().split('T')[0] : ''}"
                >
              </div>
              
              <div class="date-range-item">
                <label for="updated-after-input">Updated after:</label>
                <input 
                  type="date" 
                  id="updated-after-input"
                  value="${this.currentFilter.updatedAfter ? new Date(this.currentFilter.updatedAfter).toISOString().split('T')[0] : ''}"
                >
              </div>
              
              <div class="date-range-item">
                <label for="updated-before-input">Updated before:</label>
                <input 
                  type="date" 
                  id="updated-before-input"
                  value="${this.currentFilter.updatedBefore ? new Date(this.currentFilter.updatedBefore).toISOString().split('T')[0] : ''}"
                >
              </div>
            </div>
          </div>
        </div>
        
        <!-- Tags Filter Section -->
        <div class="filter-section">
          <h4>Tags</h4>
          <div class="filter-content">
            <div class="tags-input-container">
              <input type="text" id="tags-input" placeholder="Enter tags (comma separated)">
              <button type="button" id="add-tag-button" class="add-tag-button">
                <i class="fas fa-plus"></i> Add
              </button>
            </div>
            
            <!-- Selected tags -->
            <div class="selected-tags">
              ${this.currentFilter.tags ? this.currentFilter.tags.map(tag => `
                <span class="tag-item">
                  ${tag}
                  <button type="button" class="remove-tag-button" data-tag="${tag}">
                    <i class="fas fa-times"></i>
                  </button>
                </span>
              `).join('') : ''}
            </div>
            
            <!-- Suggested tags -->
            ${this.config.suggestedTags.length > 0 ? `
              <div class="suggested-tags">
                <label>Suggested tags:</label>
                <div class="tag-suggestions">
                  ${this.config.suggestedTags.map(tag => `
                    <button type="button" class="tag-suggestion" data-tag="${tag}">
                      ${tag}
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
        
        <!-- Storage Location Filter Section -->
        <div class="filter-section">
          <h4>Storage Location</h4>
          <div class="filter-content">
            <select id="location-filter" class="location-select">
              <option value="">All locations</option>
              ${this.availableLocations.map(location => `
                <option value="${location}" ${this.currentFilter.location === location ? 'selected' : ''}>
                  ${location}
                </option>
              `).join('')}
            </select>
          </div>
        </div>
        
        <!-- Metadata Filter Section -->
        <div class="filter-section">
          <h4>Additional Metadata</h4>
          <div class="filter-content">
            <div class="metadata-row">
              <div class="metadata-key">
                <label for="metadata-key-input">Metadata Field:</label>
                <input type="text" id="metadata-key-input" placeholder="Field name" list="metadata-key-suggestions">
                <datalist id="metadata-key-suggestions">
                  ${this.config.suggestedMetadataKeys.map(key => `
                    <option value="${key}">
                  `).join('')}
                </datalist>
              </div>
              
              <div class="metadata-value">
                <label for="metadata-value-input">Value:</label>
                <input type="text" id="metadata-value-input" placeholder="Field value">
              </div>
              
              <button type="button" id="add-metadata-button" class="add-metadata-button">
                <i class="fas fa-plus"></i> Add
              </button>
            </div>
            
            <!-- Selected metadata filters -->
            <div class="selected-metadata">
              ${this.currentFilter.metadata ? Object.entries(this.currentFilter.metadata).map(([key, value]) => `
                <div class="metadata-item">
                  <span class="metadata-key-label">${key}:</span>
                  <span class="metadata-value-label">${value}</span>
                  <button type="button" class="remove-metadata-button" data-key="${key}">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              `).join('') : ''}
            </div>
          </div>
        </div>
        
        <div class="advanced-search-actions">
          <button type="button" class="reset-button">
            <i class="fas fa-undo"></i> Reset
          </button>
          <button type="button" class="save-search-button">
            <i class="fas fa-bookmark"></i> Save Search
          </button>
          <button type="submit" class="apply-button">
            <i class="fas fa-check"></i> Apply Filters
          </button>
        </div>
      </form>
    `;
    
    return advancedSearch;
  }
  
  /**
   * Render active filters display
   * @returns {HTMLElement} Active filters element
   * @private
   */
  _renderActiveFilters() {
    const activeFilters = document.createElement('div');
    activeFilters.className = 'active-filters';
    
    // Create filter summary text
    let filterSummary = '';
    const filterCount = Object.keys(this.currentFilter).length;
    
    if (filterCount > 0) {
      filterSummary = `${filterCount} active filter${filterCount !== 1 ? 's' : ''}`;
      
      // Add some filter details
      if (this.currentFilter.mimetype) {
        filterSummary += ` • Type: ${this._formatMimeType(this.currentFilter.mimetype)}`;
      }
      
      if (this.currentFilter.location) {
        filterSummary += ` • Location: ${this.currentFilter.location}`;
      }
      
      if (this.currentFilter.tags && this.currentFilter.tags.length > 0) {
        filterSummary += ` • Tags: ${this.currentFilter.tags.length}`;
      }
    }
    
    // Create the active filters content
    activeFilters.innerHTML = `
      <div class="filter-summary">
        <span class="filter-count">${filterSummary}</span>
        <button type="button" class="clear-filters-button">
          <i class="fas fa-times"></i> Clear Filters
        </button>
      </div>
    `;
    
    return activeFilters;
  }
  
  /**
   * Add event listeners to the UI elements
   * @private
   */
  _addEventListeners() {
    // Search form submit
    const searchForm = this.container.querySelector('.search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this._handleSearchSubmit();
      });
    }
    
    // Toggle advanced search button
    const toggleAdvancedButton = this.container.querySelector('.toggle-advanced-button');
    if (toggleAdvancedButton) {
      toggleAdvancedButton.addEventListener('click', () => this.toggleExpanded());
    }
    
    // Clear search button
    const clearSearchButton = this.container.querySelector('.clear-search-button');
    if (clearSearchButton) {
      clearSearchButton.addEventListener('click', () => this.clearSearch());
    }
    
    // Clear filters button
    const clearFiltersButton = this.container.querySelector('.clear-filters-button');
    if (clearFiltersButton) {
      clearFiltersButton.addEventListener('click', () => this.clearSearch());
    }
    
    // Saved searches button
    const savedSearchesButton = this.container.querySelector('.saved-searches-button');
    if (savedSearchesButton) {
      savedSearchesButton.addEventListener('click', () => this._showSavedSearches());
    }
    
    // Search history button
    const searchHistoryButton = this.container.querySelector('.search-history-button');
    if (searchHistoryButton) {
      searchHistoryButton.addEventListener('click', () => this._showSearchHistory());
    }
    
    // Advanced search form submit
    const advancedSearchForm = this.container.querySelector('.advanced-search-form');
    if (advancedSearchForm) {
      advancedSearchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this._handleAdvancedSearch();
      });
    }
    
    // Reset button
    const resetButton = this.container.querySelector('.reset-button');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        this._resetAdvancedSearchForm();
      });
    }
    
    // Save search button
    const saveSearchButton = this.container.querySelector('.save-search-button');
    if (saveSearchButton) {
      saveSearchButton.addEventListener('click', () => {
        const name = prompt('Enter a name for this search:');
        if (name) {
          this.saveSearch(name);
        }
      });
    }
    
    // Tag related buttons
    this._addTagEventListeners();
    
    // Metadata related buttons
    this._addMetadataEventListeners();
  }
  
  /**
   * Add event listeners for tag-related UI elements
   * @private
   */
  _addTagEventListeners() {
    // Add tag button
    const addTagButton = this.container.querySelector('#add-tag-button');
    const tagsInput = this.container.querySelector('#tags-input');
    
    if (addTagButton && tagsInput) {
      addTagButton.addEventListener('click', () => {
        const tagValue = tagsInput.value.trim();
        if (tagValue) {
          this._addTag(tagValue);
          tagsInput.value = '';
        }
      });
    }
    
    // Remove tag buttons
    const removeTagButtons = this.container.querySelectorAll('.remove-tag-button');
    removeTagButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tag = button.dataset.tag;
        this._removeTag(tag);
      });
    });
    
    // Tag suggestion buttons
    const tagSuggestions = this.container.querySelectorAll('.tag-suggestion');
    tagSuggestions.forEach(button => {
      button.addEventListener('click', () => {
        const tag = button.dataset.tag;
        this._addTag(tag);
      });
    });
  }
  
  /**
   * Add event listeners for metadata-related UI elements
   * @private
   */
  _addMetadataEventListeners() {
    // Add metadata button
    const addMetadataButton = this.container.querySelector('#add-metadata-button');
    const metadataKeyInput = this.container.querySelector('#metadata-key-input');
    const metadataValueInput = this.container.querySelector('#metadata-value-input');
    
    if (addMetadataButton && metadataKeyInput && metadataValueInput) {
      addMetadataButton.addEventListener('click', () => {
        const key = metadataKeyInput.value.trim();
        const value = metadataValueInput.value.trim();
        
        if (key) {
          this._addMetadataFilter(key, value);
          metadataKeyInput.value = '';
          metadataValueInput.value = '';
        }
      });
    }
    
    // Remove metadata buttons
    const removeMetadataButtons = this.container.querySelectorAll('.remove-metadata-button');
    removeMetadataButtons.forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.key;
        this._removeMetadataFilter(key);
      });
    });
  }
  
  /**
   * Handle basic search form submission
   * @private
   */
  _handleSearchSubmit() {
    const searchInput = this.container.querySelector('.search-input');
    if (searchInput) {
      const query = searchInput.value.trim();
      this.search(query);
    }
  }
  
  /**
   * Handle advanced search form submission
   * @private
   */
  _handleAdvancedSearch() {
    // Collect all filter criteria from the form
    const filter = {};
    
    // MIME type filter
    const mimetypeSelect = this.container.querySelector('#mimetype-filter');
    const customMimetypeInput = this.container.querySelector('#custom-mimetype-input');
    
    if (mimetypeSelect && mimetypeSelect.value) {
      filter.mimetype = mimetypeSelect.value;
    } else if (customMimetypeInput && customMimetypeInput.value.trim()) {
      filter.mimetype = customMimetypeInput.value.trim();
    }
    
    // Size filter
    const sizeMinInput = this.container.querySelector('#size-min-input');
    const sizeMinUnit = this.container.querySelector('#size-min-unit');
    const sizeMaxInput = this.container.querySelector('#size-max-input');
    const sizeMaxUnit = this.container.querySelector('#size-max-unit');
    
    if (sizeMinInput && sizeMinInput.value.trim() && !isNaN(parseInt(sizeMinInput.value))) {
      const unitValue = parseInt(sizeMinUnit?.value || '1');
      filter.sizeMin = parseInt(sizeMinInput.value) * unitValue;
    }
    
    if (sizeMaxInput && sizeMaxInput.value.trim() && !isNaN(parseInt(sizeMaxInput.value))) {
      const unitValue = parseInt(sizeMaxUnit?.value || '1');
      filter.sizeMax = parseInt(sizeMaxInput.value) * unitValue;
    }
    
    // Date filters
    const createdAfterInput = this.container.querySelector('#created-after-input');
    const createdBeforeInput = this.container.querySelector('#created-before-input');
    const updatedAfterInput = this.container.querySelector('#updated-after-input');
    const updatedBeforeInput = this.container.querySelector('#updated-before-input');
    
    if (createdAfterInput && createdAfterInput.value) {
      filter.createdAfter = new Date(createdAfterInput.value).toISOString();
    }
    
    if (createdBeforeInput && createdBeforeInput.value) {
      // Set to end of day for "before" dates
      const date = new Date(createdBeforeInput.value);
      date.setHours(23, 59, 59, 999);
      filter.createdBefore = date.toISOString();
    }
    
    if (updatedAfterInput && updatedAfterInput.value) {
      filter.updatedAfter = new Date(updatedAfterInput.value).toISOString();
    }
    
    if (updatedBeforeInput && updatedBeforeInput.value) {
      // Set to end of day for "before" dates
      const date = new Date(updatedBeforeInput.value);
      date.setHours(23, 59, 59, 999);
      filter.updatedBefore = date.toISOString();
    }
    
    // Tags filter (collected from selected tags in DOM)
    const selectedTags = Array.from(this.container.querySelectorAll('.tag-item')).map(
      tag => tag.textContent.trim()
    );
    
    if (selectedTags.length > 0) {
      filter.tags = selectedTags;
    }
    
    // Location filter
    const locationSelect = this.container.querySelector('#location-filter');
    if (locationSelect && locationSelect.value) {
      filter.location = locationSelect.value;
    }
    
    // Metadata filters (collected from selected metadata in DOM)
    const selectedMetadata = Array.from(this.container.querySelectorAll('.metadata-item'));
    
    if (selectedMetadata.length > 0) {
      filter.metadata = {};
      
      selectedMetadata.forEach(item => {
        const keyElement = item.querySelector('.metadata-key-label');
        const valueElement = item.querySelector('.metadata-value-label');
        
        if (keyElement && valueElement) {
          const key = keyElement.textContent.replace(':', '').trim();
          const value = valueElement.textContent.trim();
          
          filter.metadata[key] = value;
        }
      });
    }
    
    // Apply the filter
    this.applyFilter(filter);
    
    // Close advanced search panel (optional)
    if (!this.config.keepAdvancedSearchOpen) {
      this.expanded = false;
      this.render();
    }
  }
  
  /**
   * Reset the advanced search form to default values
   * @private
   */
  _resetAdvancedSearchForm() {
    // Reset MIME type
    const mimetypeSelect = this.container.querySelector('#mimetype-filter');
    const customMimetypeInput = this.container.querySelector('#custom-mimetype-input');
    
    if (mimetypeSelect) mimetypeSelect.value = '';
    if (customMimetypeInput) customMimetypeInput.value = '';
    
    // Reset size
    const sizeMinInput = this.container.querySelector('#size-min-input');
    const sizeMaxInput = this.container.querySelector('#size-max-input');
    
    if (sizeMinInput) sizeMinInput.value = '';
    if (sizeMaxInput) sizeMaxInput.value = '';
    
    // Reset dates
    const dateInputs = this.container.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
      input.value = '';
    });
    
    // Reset tags
    const tagsInput = this.container.querySelector('#tags-input');
    const selectedTags = this.container.querySelector('.selected-tags');
    
    if (tagsInput) tagsInput.value = '';
    if (selectedTags) selectedTags.innerHTML = '';
    
    // Reset location
    const locationSelect = this.container.querySelector('#location-filter');
    if (locationSelect) locationSelect.value = '';
    
    // Reset metadata
    const metadataKeyInput = this.container.querySelector('#metadata-key-input');
    const metadataValueInput = this.container.querySelector('#metadata-value-input');
    const selectedMetadata = this.container.querySelector('.selected-metadata');
    
    if (metadataKeyInput) metadataKeyInput.value = '';
    if (metadataValueInput) metadataValueInput.value = '';
    if (selectedMetadata) selectedMetadata.innerHTML = '';
  }
  
  /**
   * Update the advanced search form with current filter values
   * @param {Object} filter - Filter criteria
   * @private
   */
  _updateAdvancedSearchForm(filter) {
    // Only update if we have a valid filter and the form exists
    if (!filter || !this.container) return;
    
    // First reset the form
    this._resetAdvancedSearchForm();
    
    // Update MIME type
    if (filter.mimetype) {
      const mimetypeSelect = this.container.querySelector('#mimetype-filter');
      const customMimetypeInput = this.container.querySelector('#custom-mimetype-input');
      
      // Try to find the mimetype in the select options
      let found = false;
      if (mimetypeSelect) {
        Array.from(mimetypeSelect.options).forEach(option => {
          if (option.value === filter.mimetype) {
            mimetypeSelect.value = filter.mimetype;
            found = true;
          }
        });
      }
      
      // If not found in select options, set as custom mimetype
      if (!found && customMimetypeInput) {
        customMimetypeInput.value = filter.mimetype;
      }
    }
    
    // Update size range
    if (filter.sizeMin) {
      const sizeMinInput = this.container.querySelector('#size-min-input');
      const sizeMinUnit = this.container.querySelector('#size-min-unit');
      
      if (sizeMinInput && sizeMinUnit) {
        const { value, unit } = this._formatSizeValue(filter.sizeMin);
        sizeMinInput.value = value;
        sizeMinUnit.value = unit;
      }
    }
    
    if (filter.sizeMax) {
      const sizeMaxInput = this.container.querySelector('#size-max-input');
      const sizeMaxUnit = this.container.querySelector('#size-max-unit');
      
      if (sizeMaxInput && sizeMaxUnit) {
        const { value, unit } = this._formatSizeValue(filter.sizeMax);
        sizeMaxInput.value = value;
        sizeMaxUnit.value = unit;
      }
    }
    
    // Update dates
    if (filter.createdAfter) {
      const createdAfterInput = this.container.querySelector('#created-after-input');
      if (createdAfterInput) {
        createdAfterInput.value = new Date(filter.createdAfter).toISOString().split('T')[0];
      }
    }
    
    if (filter.createdBefore) {
      const createdBeforeInput = this.container.querySelector('#created-before-input');
      if (createdBeforeInput) {
        createdBeforeInput.value = new Date(filter.createdBefore).toISOString().split('T')[0];
      }
    }
    
    if (filter.updatedAfter) {
      const updatedAfterInput = this.container.querySelector('#updated-after-input');
      if (updatedAfterInput) {
        updatedAfterInput.value = new Date(filter.updatedAfter).toISOString().split('T')[0];
      }
    }
    
    if (filter.updatedBefore) {
      const updatedBeforeInput = this.container.querySelector('#updated-before-input');
      if (updatedBeforeInput) {
        updatedBeforeInput.value = new Date(filter.updatedBefore).toISOString().split('T')[0];
      }
    }
    
    // Update tags
    if (filter.tags && Array.isArray(filter.tags)) {
      const selectedTags = this.container.querySelector('.selected-tags');
      
      if (selectedTags) {
        selectedTags.innerHTML = filter.tags.map(tag => `
          <span class="tag-item">
            ${tag}
            <button type="button" class="remove-tag-button" data-tag="${tag}">
              <i class="fas fa-times"></i>
            </button>
          </span>
        `).join('');
        
        // Re-add event listeners
        this._addTagEventListeners();
      }
    }
    
    // Update location
    if (filter.location) {
      const locationSelect = this.container.querySelector('#location-filter');
      if (locationSelect) {
        locationSelect.value = filter.location;
      }
    }
    
    // Update metadata
    if (filter.metadata && typeof filter.metadata === 'object') {
      const selectedMetadata = this.container.querySelector('.selected-metadata');
      
      if (selectedMetadata) {
        selectedMetadata.innerHTML = Object.entries(filter.metadata).map(([key, value]) => `
          <div class="metadata-item">
            <span class="metadata-key-label">${key}:</span>
            <span class="metadata-value-label">${value}</span>
            <button type="button" class="remove-metadata-button" data-key="${key}">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join('');
        
        // Re-add event listeners
        this._addMetadataEventListeners();
      }
    }
  }
  
  /**
   * Show saved searches popup
   * @private
   */
  _showSavedSearches() {
    if (!this.savedSearches || this.savedSearches.length === 0) {
      alert('No saved searches found');
      return;
    }
    
    // Create the saved searches modal
    const modalHtml = `
      <div class="search-modal saved-searches-modal">
        <div class="modal-header">
          <h3>Saved Searches</h3>
          <button type="button" class="close-modal-button">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="saved-searches-list">
            ${this.savedSearches.map(search => `
              <div class="saved-search-item" data-id="${search.id}">
                <div class="saved-search-info">
                  <div class="saved-search-name">${search.name}</div>
                  <div class="saved-search-details">
                    ${search.query ? `<span class="search-query">${search.query}</span>` : ''}
                    ${Object.keys(search.filter || {}).length > 0 ? 
                      `<span class="search-filter-count">${Object.keys(search.filter).length} filters</span>` : ''}
                    <span class="search-date">${this._formatTimestamp(search.timestamp)}</span>
                  </div>
                </div>
                <div class="saved-search-actions">
                  <button type="button" class="load-search-button" data-id="${search.id}">
                    <i class="fas fa-search"></i>
                  </button>
                  <button type="button" class="delete-search-button" data-id="${search.id}">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    // Create modal container
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-overlay';
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Add event listeners for modal
    const closeButton = modalContainer.querySelector('.close-modal-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        document.body.removeChild(modalContainer);
      });
    }
    
    // Click outside to close
    modalContainer.addEventListener('click', (event) => {
      if (event.target === modalContainer) {
        document.body.removeChild(modalContainer);
      }
    });
    
    // Load search buttons
    const loadButtons = modalContainer.querySelectorAll('.load-search-button');
    loadButtons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const search = this.savedSearches.find(s => s.id === id);
        
        if (search) {
          this.loadSearch(search);
          document.body.removeChild(modalContainer);
        }
      });
    });
    
    // Delete search buttons
    const deleteButtons = modalContainer.querySelectorAll('.delete-search-button');
    deleteButtons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const confirmed = confirm('Are you sure you want to delete this saved search?');
        
        if (confirmed) {
          this.deleteSavedSearch(id);
          
          // Remove from DOM
          const searchItem = modalContainer.querySelector(`.saved-search-item[data-id="${id}"]`);
          if (searchItem && searchItem.parentNode) {
            searchItem.parentNode.removeChild(searchItem);
          }
          
          // If no more saved searches, close the modal
          const remainingItems = modalContainer.querySelectorAll('.saved-search-item');
          if (remainingItems.length === 0) {
            document.body.removeChild(modalContainer);
          }
        }
      });
    });
  }
  
  /**
   * Show search history popup with enhanced analytics
   * @private
   */
  _showSearchHistory() {
    if (!this.searchHistory || this.searchHistory.length === 0) {
      alert('No search history found');
      return;
    }
    
    // Generate analytics data for visualization
    const searchAnalytics = this._generateSearchAnalytics();
    
    // Create the search history modal with enhanced UI
    const modalHtml = `
      <div class="search-modal history-modal">
        <div class="modal-header">
          <h3>Search History & Analytics</h3>
          <div class="modal-header-actions">
            <div class="search-modal-tabs">
              <button type="button" class="search-modal-tab active" data-tab="history">
                <i class="fas fa-history"></i> History
              </button>
              <button type="button" class="search-modal-tab" data-tab="analytics">
                <i class="fas fa-chart-bar"></i> Analytics
              </button>
            </div>
            <button type="button" class="close-modal-button">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="modal-body">
          <!-- History Tab -->
          <div class="search-history-content active" id="history-tab-content">
            <div class="search-history-actions">
              <div class="search-history-filter">
                <label for="history-filter-input">Filter:</label>
                <input type="text" id="history-filter-input" class="filter-input" placeholder="Filter history...">
                <select class="history-sort-select">
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="query-asc">Query (A-Z)</option>
                  <option value="query-desc">Query (Z-A)</option>
                </select>
              </div>
              <div class="search-history-export-buttons">
                <button type="button" class="export-history-button">
                  <i class="fas fa-file-export"></i> Export
                </button>
                <button type="button" class="clear-history-button">
                  <i class="fas fa-trash"></i> Clear
                </button>
              </div>
            </div>
            
            ${this.searchHistory.length > 0 ? `
              <div class="search-history-list">
                ${this.searchHistory.map(historyItem => `
                  <div class="history-item" data-id="${historyItem.id}">
                    <div class="history-item-info">
                      <div class="history-item-query">
                        ${historyItem.query || '<em>No query</em>'}
                      </div>
                      <div class="history-item-details">
                        ${Object.keys(historyItem.filter || {}).length > 0 ? 
                          `<span class="history-filter-count tooltip" data-tooltip="${this._formatFilterTooltip(historyItem.filter)}">
                            ${Object.keys(historyItem.filter).length} filters
                           </span>` : ''}
                        <span class="history-date">${this._formatTimestamp(historyItem.timestamp)}</span>
                      </div>
                    </div>
                    <div class="history-item-actions">
                      <button type="button" class="load-history-button" data-id="${historyItem.id}" title="Use this search">
                        <i class="fas fa-search"></i>
                      </button>
                      <button type="button" class="save-history-button" data-id="${historyItem.id}" title="Save to favorites">
                        <i class="fas fa-bookmark"></i>
                      </button>
                      <button type="button" class="share-history-button" data-id="${historyItem.id}" title="Share search">
                        <i class="fas fa-share-alt"></i>
                      </button>
                      <button type="button" class="history-item-export" data-id="${historyItem.id}" title="Export this search">
                        <i class="fas fa-file-export"></i>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="no-history-message">
                <i class="fas fa-search"></i>
                <h4>No search history</h4>
                <p>Your search history will appear here after you perform searches.</p>
              </div>
            `}
          </div>
          
          <!-- Analytics Tab -->
          <div class="search-analytics-content" id="analytics-tab-content">
            ${this.searchHistory.length > 0 ? `
              <div class="search-analytics-dashboard">
                <div class="analytics-section">
                  <div class="analytics-grid">
                    <div class="analytics-card">
                      <div class="analytics-card-header">
                        <h4 class="analytics-card-title">Search Term Frequency</h4>
                      </div>
                      <div class="analytics-card-body">
                        <div class="chart-container" id="search-terms-chart">
                          <canvas></canvas>
                        </div>
                      </div>
                    </div>
                    
                    <div class="analytics-card">
                      <div class="analytics-card-header">
                        <h4 class="analytics-card-title">Filter Category Usage</h4>
                      </div>
                      <div class="analytics-card-body">
                        <div class="chart-container" id="filter-categories-chart">
                          <canvas></canvas>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="analytics-section">
                  <div class="analytics-card full-width">
                    <div class="analytics-card-header">
                      <h4 class="analytics-card-title">Search Activity Timeline</h4>
                    </div>
                    <div class="analytics-card-body">
                      <div class="chart-container" id="search-activity-chart">
                        <canvas></canvas>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="search-insights">
                  <h4 class="insights-heading">
                    <i class="fas fa-lightbulb"></i> 
                    Search Pattern Insights
                  </h4>
                  <div class="insight-list">
                    ${searchAnalytics.patterns.map((pattern, index) => `
                      <div class="insight-item ${index % 3 === 0 ? '' : index % 3 === 1 ? 'pattern' : 'suggestion'}">
                        <div class="insight-label">${pattern.title}</div>
                        <div>${pattern.description}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
                
                <div class="search-history-actions">
                  <button type="button" class="share-history-button">
                    <i class="fas fa-share-alt"></i> Share Analytics
                  </button>
                  <button type="button" class="export-history-button">
                    <i class="fas fa-file-export"></i> Export Data
                  </button>
                </div>
              </div>
            ` : `
              <div class="no-analytics-message">
                <i class="fas fa-chart-line"></i>
                <h4>No analytics available</h4>
                <p>Search analytics will be generated once you have search history.</p>
              </div>
            `}
          </div>
        </div>
        <div class="modal-footer">
          <div class="modal-footer-info">
            ${this.searchHistory.length} search${this.searchHistory.length !== 1 ? 'es' : ''} in history
          </div>
          <div class="modal-footer-actions">
            <button type="button" class="btn-secondary modal-close-btn">Close</button>
          </div>
        </div>
      </div>
    `;
    
    // Create modal container
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-overlay';
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Add event listeners for modal
    const closeButtons = modalContainer.querySelectorAll('.close-modal-button, .modal-close-btn');
    closeButtons.forEach(button => {
      button.addEventListener('click', () => {
        document.body.removeChild(modalContainer);
      });
    });
    
    // Click outside to close
    modalContainer.addEventListener('click', (event) => {
      if (event.target === modalContainer) {
        document.body.removeChild(modalContainer);
      }
    });
    
    // Tab switching functionality
    const tabButtons = modalContainer.querySelectorAll('.search-modal-tab');
    const tabContents = modalContainer.querySelectorAll('.search-history-content, .search-analytics-content');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Deactivate all tabs
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Activate selected tab
        button.classList.add('active');
        const tabId = button.dataset.tab;
        modalContainer.querySelector(`#${tabId}-tab-content`).classList.add('active');
        
        // Initialize charts if analytics tab is selected
        if (tabId === 'analytics' && this.searchHistory.length > 0) {
          this._initSearchAnalyticsCharts(searchAnalytics);
        }
      });
    });
    
    // Filter history functionality
    const filterInput = modalContainer.querySelector('.filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        const filterText = e.target.value.toLowerCase();
        const historyItems = modalContainer.querySelectorAll('.history-item');
        
        historyItems.forEach(item => {
          const query = item.querySelector('.history-item-query').textContent.toLowerCase();
          if (query.includes(filterText) || filterText === '') {
            item.style.display = '';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }
    
    // Sort history functionality
    const sortSelect = modalContainer.querySelector('.history-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        const sortValue = e.target.value;
        const historyList = modalContainer.querySelector('.search-history-list');
        const historyItems = Array.from(historyList.querySelectorAll('.history-item'));
        
        // Sort items based on selection
        historyItems.sort((a, b) => {
          const aId = a.dataset.id;
          const bId = b.dataset.id;
          const aItem = this.searchHistory.find(h => h.id === aId);
          const bItem = this.searchHistory.find(h => h.id === bId);
          
          if (!aItem || !bItem) return 0;
          
          switch (sortValue) {
            case 'date-asc':
              return new Date(aItem.timestamp) - new Date(bItem.timestamp);
            case 'date-desc':
              return new Date(bItem.timestamp) - new Date(aItem.timestamp);
            case 'query-asc':
              return (aItem.query || '').localeCompare(bItem.query || '');
            case 'query-desc':
              return (bItem.query || '').localeCompare(aItem.query || '');
            default:
              return 0;
          }
        });
        
        // Reorder DOM elements
        historyItems.forEach(item => historyList.appendChild(item));
      });
    }
    
    // Export history functionality
    const exportButtons = modalContainer.querySelectorAll('.export-history-button');
    exportButtons.forEach(button => {
      button.addEventListener('click', () => {
        this._exportSearchHistory();
      });
    });
    
    // Export single history item functionality
    const itemExportButtons = modalContainer.querySelectorAll('.history-item-export');
    itemExportButtons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const historyItem = this.searchHistory.find(h => h.id === id);
        
        if (historyItem) {
          this._exportSingleSearchItem(historyItem);
        }
      });
    });
    
    // Load history buttons
    const loadButtons = modalContainer.querySelectorAll('.load-history-button');
    loadButtons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const historyItem = this.searchHistory.find(h => h.id === id);
        
        if (historyItem) {
          this.loadSearch(historyItem);
          document.body.removeChild(modalContainer);
        }
      });
    });
    
    // Save history buttons
    const saveButtons = modalContainer.querySelectorAll('.save-history-button');
    saveButtons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const historyItem = this.searchHistory.find(h => h.id === id);
        
        if (historyItem) {
          const name = prompt('Enter a name for this saved search:');
          if (name) {
            // Create a saved search from history item
            const savedSearch = {
              id: Date.now().toString(),
              name,
              query: historyItem.query,
              filter: historyItem.filter,
              timestamp: new Date().toISOString()
            };
            
            // Add to saved searches
            this.savedSearches.unshift(savedSearch);
            
            // Limit saved searches
            if (this.savedSearches.length > this.config.maxSavedSearches) {
              this.savedSearches = this.savedSearches.slice(0, this.config.maxSavedSearches);
            }
            
            // Save to local storage
            this._saveToLocalStorage();
            
            // Show confirmation
            alert('Search saved successfully');
          }
        }
      });
    });
    
    // Share history buttons
    const shareButtons = modalContainer.querySelectorAll('.share-history-button');
    shareButtons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        // If button has an ID, share specific search, otherwise share all analytics
        if (id) {
          const historyItem = this.searchHistory.find(h => h.id === id);
          if (historyItem) {
            this._shareSearch(historyItem);
          }
        } else {
          // Share all analytics as a report URL
          this._shareAnalytics(searchAnalytics);
        }
      });
    });
    
    // Clear history button
    const clearButton = modalContainer.querySelector('.clear-history-button');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        const confirmed = confirm('Are you sure you want to clear all search history?');
        
        if (confirmed) {
          this.searchHistory = [];
          this._saveToLocalStorage();
          document.body.removeChild(modalContainer);
        }
      });
    }
    
    // Initialize analytics tab if search history exists
    if (this.searchHistory.length > 0) {
      // Initialize the charts for the analytics tab if it's selected
      const analyticsTab = modalContainer.querySelector('.search-modal-tab[data-tab="analytics"]');
      if (analyticsTab.classList.contains('active')) {
        this._initSearchAnalyticsCharts(searchAnalytics);
      }
    }
  }
  
  /**
   * Generate analytics data from search history
   * @returns {Object} Analytics data for charts
   * @private
   */
  _generateSearchAnalytics() {
    // Extract search terms and count frequencies
    const searchTerms = {};
    const filterCategories = {};
    const activityTimeline = {};
    
    this.searchHistory.forEach(item => {
      // Process search terms
      if (item.query) {
        // Split query into terms
        const terms = item.query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
        terms.forEach(term => {
          searchTerms[term] = (searchTerms[term] || 0) + 1;
        });
      }
      
      // Process filter categories
      if (item.filter) {
        Object.keys(item.filter).forEach(filterKey => {
          filterCategories[filterKey] = (filterCategories[filterKey] || 0) + 1;
        });
      }
      
      // Process activity timeline
      if (item.timestamp) {
        const date = new Date(item.timestamp);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        activityTimeline[dateStr] = (activityTimeline[dateStr] || 0) + 1;
      }
    });
    
    // Sort and slice for top search terms
    const topSearchTerms = Object.entries(searchTerms)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    // Sort and prepare filter categories
    const topFilterCategories = Object.entries(filterCategories)
      .sort((a, b) => b[1] - a[1]);
    
    // Sort and prepare activity timeline
    const sortedTimeline = Object.entries(activityTimeline)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
    
    // Generate insights
    const patterns = this._generateSearchPatterns(
      topSearchTerms, 
      topFilterCategories, 
      sortedTimeline
    );
    
    return {
      searchTerms: {
        labels: topSearchTerms.map(([term]) => term),
        values: topSearchTerms.map(([, count]) => count)
      },
      filterCategories: {
        labels: topFilterCategories.map(([category]) => this._formatFilterCategory(category)),
        values: topFilterCategories.map(([, count]) => count)
      },
      activityTimeline: {
        labels: sortedTimeline.map(([date]) => date),
        values: sortedTimeline.map(([, count]) => count)
      },
      patterns
    };
  }
  
  /**
   * Format filter category for display
   * @param {string} category - Filter category name
   * @returns {string} Formatted category name
   * @private
   */
  _formatFilterCategory(category) {
    const categoryMap = {
      'mimetype': 'Content Type',
      'sizeMin': 'Min Size',
      'sizeMax': 'Max Size',
      'createdAfter': 'Created After',
      'createdBefore': 'Created Before',
      'updatedAfter': 'Updated After',
      'updatedBefore': 'Updated Before',
      'tags': 'Tags',
      'location': 'Location',
      'metadata': 'Metadata'
    };
    
    return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }
  
  /**
   * Format filter object for tooltip display
   * @param {Object} filter - Filter object
   * @returns {string} Formatted filter string
   * @private
   */
  _formatFilterTooltip(filter) {
    if (!filter || Object.keys(filter).length === 0) {
      return 'No filters applied';
    }
    
    return Object.entries(filter).map(([key, value]) => {
      const formattedKey = this._formatFilterCategory(key);
      
      if (key === 'tags' && Array.isArray(value)) {
        return `${formattedKey}: ${value.join(', ')}`;
      } else if (key === 'metadata' && typeof value === 'object') {
        const metadataStr = Object.entries(value)
          .map(([mKey, mValue]) => `${mKey}: ${mValue}`)
          .join(', ');
        return `${formattedKey}: {${metadataStr}}`;
      } else if (key.includes('size') && typeof value === 'number') {
        return `${formattedKey}: ${this._formatSizeDisplay(value)}`;
      } else if (key.includes('date') || key.includes('After') || key.includes('Before')) {
        return `${formattedKey}: ${new Date(value).toLocaleDateString()}`;
      }
      
      return `${formattedKey}: ${value}`;
    }).join(' • ');
  }
  
  /**
   * Format file size for display
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   * @private
   */
  _formatSizeDisplay(bytes) {
    if (bytes >= 1073741824) {
      return `${(bytes / 1073741824).toFixed(2)} GB`;
    } else if (bytes >= 1048576) {
      return `${(bytes / 1048576).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    } else {
      return `${bytes} bytes`;
    }
  }
  
  /**
   * Generate insights based on search patterns
   * @param {Array} topTerms - Top search terms
   * @param {Array} topFilters - Top filter categories
   * @param {Array} timeline - Activity timeline
   * @returns {Array} Search pattern insights
   * @private
   */
  _generateSearchPatterns(topTerms, topFilters, timeline) {
    const patterns = [];
    
    // Check for recurring search terms
    if (topTerms.length > 0 && topTerms[0][1] > 2) {
      patterns.push({
        title: `Frequent search: "${topTerms[0][0]}"`,
        description: `You've searched for "${topTerms[0][0]}" ${topTerms[0][1]} times. Consider saving this as a favorite.`
      });
    }
    
    // Check for filter usage patterns
    if (topFilters.length > 0) {
      const mostUsedFilter = topFilters[0];
      patterns.push({
        title: `Common filter: ${this._formatFilterCategory(mostUsedFilter[0])}`,
        description: `You frequently filter by ${this._formatFilterCategory(mostUsedFilter[0])}. Consider making this your default filter.`
      });
    }
    
    // Check for usage frequency
    if (timeline.length > 3) {
      const recentDays = timeline.slice(-3);
      const recentSearchCount = recentDays.reduce((sum, [, count]) => sum + count, 0);
      
      if (recentSearchCount > 5) {
        patterns.push({
          title: 'Increased recent activity',
          description: `You've performed ${recentSearchCount} searches in the last ${recentDays.length} days.`
        });
      }
    }
    
    // Check for diverse vs. focused search patterns
    const termDiversity = topTerms.length;
    const totalTermUses = topTerms.reduce((sum, [, count]) => sum + count, 0);
    
    if (termDiversity > 5 && totalTermUses > 10) {
      patterns.push({
        title: 'Diverse search patterns',
        description: 'Your searches cover a wide range of terms. Consider using more specific filters to narrow results.'
      });
    } else if (termDiversity <= 3 && totalTermUses > 5) {
      patterns.push({
        title: 'Focused search pattern',
        description: 'Your searches are focused on a few key terms. You might benefit from saved search templates.'
      });
    }
    
    // If no patterns detected, add a default insight
    if (patterns.length === 0) {
      patterns.push({
        title: 'Search history analysis',
        description: 'Not enough search history to identify clear patterns yet. Continue using search to see insights.'
      });
    }
    
    return patterns;
  }
  
  /**
   * Initialize charts for search analytics
   * @param {Object} analytics - Search analytics data
   * @private
   */
  _initSearchAnalyticsCharts(analytics) {
    // Only proceed if Chart.js is available
    if (!window.Chart) {
      console.warn('Chart.js not available for search analytics visualization');
      return;
    }
    
    // Term frequency chart
    this._createBarChart(
      'search-terms-chart', 
      'Search Term Frequency', 
      analytics.searchTerms.labels, 
      analytics.searchTerms.values,
      {
        backgroundColor: 'rgba(66, 153, 225, 0.6)',
        borderColor: 'rgba(66, 153, 225, 1)'
      }
    );
    
    // Filter categories donut chart
    this._createDoughnutChart(
      'filter-categories-chart',
      'Filter Category Usage',
      analytics.filterCategories.labels,
      analytics.filterCategories.values
    );
    
    // Activity timeline line chart
    this._createLineChart(
      'search-activity-chart',
      'Search Activity Over Time',
      analytics.activityTimeline.labels,
      analytics.activityTimeline.values,
      {
        borderColor: 'rgba(72, 187, 120, 1)',
        backgroundColor: 'rgba(72, 187, 120, 0.1)'
      }
    );
  }
  
  /**
   * Create a bar chart
   * @param {string} elementId - Chart container ID
   * @param {string} label - Dataset label
   * @param {Array} labels - X-axis labels
   * @param {Array} data - Data values
   * @param {Object} style - Chart style options
   * @private
   */
  _createBarChart(elementId, label, labels, data, style) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    
    // Destroy existing chart if there is one
    if (this._tempCharts && this._tempCharts[elementId]) {
      this._tempCharts[elementId].destroy();
    }
    
    // Initialize temporary chart storage
    if (!this._tempCharts) this._tempCharts = {};
    
    // Create chart
    this._tempCharts[elementId] = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: style.backgroundColor || 'rgba(66, 153, 225, 0.6)',
          borderColor: style.borderColor || 'rgba(66, 153, 225, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }
  
  /**
   * Create a doughnut chart
   * @param {string} elementId - Chart container ID
   * @param {string} label - Dataset label
   * @param {Array} labels - Labels
   * @param {Array} data - Data values
   * @private
   */
  _createDoughnutChart(elementId, label, labels, data) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    
    // Destroy existing chart if there is one
    if (this._tempCharts && this._tempCharts[elementId]) {
      this._tempCharts[elementId].destroy();
    }
    
    // Initialize temporary chart storage
    if (!this._tempCharts) this._tempCharts = {};
    
    // Generate colors
    const backgroundColors = this._generateChartColors(data.length);
    
    // Create chart
    this._tempCharts[elementId] = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: backgroundColors.backgroundColor,
          borderColor: backgroundColors.borderColor,
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
          }
        }
      }
    });
  }
  
  /**
   * Create a line chart
   * @param {string} elementId - Chart container ID
   * @param {string} label - Dataset label
   * @param {Array} labels - X-axis labels
   * @param {Array} data - Data values
   * @param {Object} style - Chart style options
   * @private
   */
  _createLineChart(elementId, label, labels, data, style) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    
    // Destroy existing chart if there is one
    if (this._tempCharts && this._tempCharts[elementId]) {
      this._tempCharts[elementId].destroy();
    }
    
    // Initialize temporary chart storage
    if (!this._tempCharts) this._tempCharts = {};
    
    // Create chart
    this._tempCharts[elementId] = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: style.borderColor || 'rgba(66, 153, 225, 1)',
          backgroundColor: style.backgroundColor || 'rgba(66, 153, 225, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }
  
  /**
   * Generate chart colors
   * @param {number} count - Number of colors to generate
   * @returns {Object} Background and border colors
   * @private
   */
  _generateChartColors(count) {
    const baseColors = [
      { r: 66, g: 153, b: 225 },   // Blue
      { r: 72, g: 187, b: 120 },   // Green
      { r: 237, g: 100, b: 166 },  // Pink
      { r: 246, g: 173, b: 85 },   // Orange
      { r: 113, g: 128, b: 150 },  // Gray
      { r: 49, g: 130, b: 206 },   // Dark Blue
      { r: 56, g: 161, b: 105 },   // Dark Green
      { r: 214, g: 188, b: 0 },    // Yellow
      { r: 183, g: 121, b: 31 },   // Brown
      { r: 128, g: 90, b: 213 }    // Purple
    ];
    
    const backgroundColor = [];
    const borderColor = [];
    
    for (let i = 0; i < count; i++) {
      const color = baseColors[i % baseColors.length];
      backgroundColor.push(`rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`);
      borderColor.push(`rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
    }
    
    return { backgroundColor, borderColor };
  }
  
  /**
   * Export search history to JSON file
   * @private
   */
  _exportSearchHistory() {
    // Prepare export data
    const exportData = {
      exportDate: new Date().toISOString(),
      exportType: 'search-history',
      data: this.searchHistory
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create download link
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `search-history-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
  /**
   * Export a single search item to JSON file
   * @param {Object} searchItem - The search item to export
   * @private
   */
  _exportSingleSearchItem(searchItem) {
    if (!searchItem) return;
    
    // Prepare export data
    const exportData = {
      exportDate: new Date().toISOString(),
      exportType: 'single-search',
      data: searchItem
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create download link
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    
    // Use search query in filename if available, otherwise use ID
    const filenameBase = searchItem.query ? 
      searchItem.query.slice(0, 20).replace(/[^a-z0-9]/gi, '_') : 
      `search-${searchItem.id}`;
    
    a.download = `${filenameBase}-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
  /**
   * Share a search via URL parameters
   * @param {Object} searchItem - Search item to share
   * @private
   */
  _shareSearch(searchItem) {
    try {
      // Create base URL
      const baseUrl = window.location.href.split('?')[0];
      
      // Encode search parameters
      const params = new URLSearchParams();
      
      if (searchItem.query) {
        params.set('q', searchItem.query);
      }
      
      if (searchItem.filter && Object.keys(searchItem.filter).length > 0) {
        // Handle special cases for filter serialization
        Object.entries(searchItem.filter).forEach(([key, value]) => {
          if (key === 'tags' && Array.isArray(value)) {
            params.set('tags', value.join(','));
          } else if (key === 'metadata' && typeof value === 'object') {
            Object.entries(value).forEach(([metaKey, metaValue]) => {
              params.set(`meta_${metaKey}`, metaValue);
            });
          } else {
            params.set(key, JSON.stringify(value));
          }
        });
      }
      
      // Create shareable URL
      const shareUrl = `${baseUrl}?${params.toString()}`;
      
      // Create a textarea to copy the URL
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      // Show success message
      alert('Search URL copied to clipboard');
      
    } catch (error) {
      console.error('Error sharing search:', error);
      alert('Failed to create shareable search URL');
    }
  }
  
  /**
   * Share search analytics via a custom URL with encoded data
   * @param {Object} analytics - Analytics data to share
   * @private
   */
  _shareAnalytics(analytics) {
    try {
      // Create base URL
      const baseUrl = window.location.href.split('?')[0];
      
      // Create analytics summary for sharing
      const analyticsSummary = {
        topTerms: analytics.searchTerms.labels.slice(0, 5).map((term, i) => ({
          term,
          count: analytics.searchTerms.values[i]
        })),
        topFilters: analytics.filterCategories.labels.slice(0, 5).map((filter, i) => ({
          filter,
          count: analytics.filterCategories.values[i]
        })),
        activityDates: analytics.activityTimeline.labels.slice(-7).map((date, i) => ({
          date,
          count: analytics.activityTimeline.values[i + (analytics.activityTimeline.labels.length - 7)]
        })),
        totalSearches: this.searchHistory.length,
        dateRange: {
          start: analytics.activityTimeline.labels[0],
          end: analytics.activityTimeline.labels[analytics.activityTimeline.labels.length - 1]
        },
        insights: analytics.patterns.slice(0, 3).map(p => p.title)
      };
      
      // Encode data for URL
      const params = new URLSearchParams();
      params.set('view', 'analytics');
      params.set('data', btoa(JSON.stringify(analyticsSummary)));
      
      // Create shareable URL
      const shareUrl = `${baseUrl}?${params.toString()}`;
      
      // Create a textarea to copy the URL
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      // Show success message
      alert('Analytics report URL copied to clipboard');
      
    } catch (error) {
      console.error('Error sharing analytics:', error);
      alert('Failed to create shareable analytics URL');
    }
  }
  
  /**
   * Add a tag to the filter
   * @param {string} tag - Tag to add
   * @private
   */
  _addTag(tag) {
    // Create tag item in UI
    const selectedTags = this.container.querySelector('.selected-tags');
    if (!selectedTags) return;
    
    // Check if tag already exists
    const existingTags = Array.from(selectedTags.querySelectorAll('.tag-item')).map(
      item => item.textContent.trim()
    );
    
    if (existingTags.includes(tag)) return;
    
    // Create new tag element
    const tagElement = document.createElement('span');
    tagElement.className = 'tag-item';
    tagElement.innerHTML = `
      ${tag}
      <button type="button" class="remove-tag-button" data-tag="${tag}">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // Add to container
    selectedTags.appendChild(tagElement);
    
    // Add event listener for remove button
    const removeButton = tagElement.querySelector('.remove-tag-button');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        this._removeTag(tag);
      });
    }
  }
  
  /**
   * Remove a tag from the filter
   * @param {string} tag - Tag to remove
   * @private
   */
  _removeTag(tag) {
    // Remove tag from UI
    const tagElements = this.container.querySelectorAll(`.tag-item`);
    tagElements.forEach(element => {
      if (element.textContent.trim() === tag) {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }
    });
  }
  
  /**
   * Add a metadata filter
   * @param {string} key - Metadata key
   * @param {string} value - Metadata value
   * @private
   */
  _addMetadataFilter(key, value) {
    // Create metadata item in UI
    const selectedMetadata = this.container.querySelector('.selected-metadata');
    if (!selectedMetadata) return;
    
    // Check if key already exists
    const existingKeys = Array.from(selectedMetadata.querySelectorAll('.metadata-key-label')).map(
      item => item.textContent.replace(':', '').trim()
    );
    
    if (existingKeys.includes(key)) {
      // Remove existing key first
      this._removeMetadataFilter(key);
    }
    
    // Create new metadata element
    const metadataElement = document.createElement('div');
    metadataElement.className = 'metadata-item';
    metadataElement.innerHTML = `
      <span class="metadata-key-label">${key}:</span>
      <span class="metadata-value-label">${value}</span>
      <button type="button" class="remove-metadata-button" data-key="${key}">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // Add to container
    selectedMetadata.appendChild(metadataElement);
    
    // Add event listener for remove button
    const removeButton = metadataElement.querySelector('.remove-metadata-button');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        this._removeMetadataFilter(key);
      });
    }
  }
  
  /**
   * Remove a metadata filter
   * @param {string} key - Metadata key to remove
   * @private
   */
  _removeMetadataFilter(key) {
    // Remove metadata from UI
    const metadataItems = this.container.querySelectorAll('.metadata-item');
    metadataItems.forEach(element => {
      const keyElement = element.querySelector('.metadata-key-label');
      if (keyElement && keyElement.textContent.replace(':', '').trim() === key) {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }
    });
  }
  
  /**
   * Format MIME type for display
   * @param {string} mimetype - MIME type
   * @returns {string} Formatted MIME type
   * @private
   */
  _formatMimeType(mimetype) {
    if (!mimetype) return 'Unknown';
    
    // Check for common type categories
    if (mimetype === 'image/') return 'Images';
    if (mimetype === 'video/') return 'Videos';
    if (mimetype === 'audio/') return 'Audio';
    if (mimetype === 'text/') return 'Text';
    
    // Format specific MIME types
    if (mimetype === 'application/pdf') return 'PDF Document';
    if (mimetype === 'application/json') return 'JSON File';
    
    // Handle general types
    if (mimetype.endsWith('/')) {
      return mimetype.slice(0, -1).charAt(0).toUpperCase() + mimetype.slice(1, -1) + ' Files';
    }
    
    // Default format
    return mimetype;
  }
  
  /**
   * Format size value with appropriate unit
   * @param {number} bytes - Size in bytes
   * @returns {Object} Formatted value and unit
   * @private
   */
  _formatSizeValue(bytes) {
    if (bytes >= 1073741824) {
      return { value: (bytes / 1073741824).toFixed(2), unit: '1073741824' }; // GB
    } else if (bytes >= 1048576) {
      return { value: (bytes / 1048576).toFixed(2), unit: '1048576' }; // MB
    } else if (bytes >= 1024) {
      return { value: (bytes / 1024).toFixed(2), unit: '1024' }; // KB
    } else {
      return { value: bytes, unit: '1' }; // Bytes
    }
  }
  
  /**
   * Format timestamp for display
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted timestamp
   * @private
   */
  _formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
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
    
    // For older dates, show date and time
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback function
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Emit an event to registered listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * Refresh search suggestions from metadata
   * @returns {Promise<boolean>} Success status
   */
  async refreshSuggestions() {
    try {
      await this._loadMetadata();
      return true;
    } catch (error) {
      console.error('Failed to refresh search suggestions:', error);
      return false;
    }
  }

  /**
   * Dispose of resources and event listeners
   */
  dispose() {
    // Clear all event listeners
    this.eventListeners = {};
    
    // Remove DOM event listeners if container exists
    if (this.container) {
      const searchForm = this.container.querySelector('.search-form');
      if (searchForm) {
        const clone = searchForm.cloneNode(true);
        searchForm.parentNode.replaceChild(clone, searchForm);
      }
      
      const advancedSearchForm = this.container.querySelector('.advanced-search-form');
      if (advancedSearchForm) {
        const clone = advancedSearchForm.cloneNode(true);
        advancedSearchForm.parentNode.replaceChild(clone, advancedSearchForm);
      }
    }
    
    // Unregister from event bus if available
    if (this.eventBus) {
      // Assuming the event bus has an 'off' method for unregistering listeners
      if (typeof this.eventBus.off === 'function') {
        this.eventBus.off('search-interface:perform-search');
        this.eventBus.off('search-interface:apply-filter');
        this.eventBus.off('search-interface:clear-search');
      }
    }
  }
}

export default SearchInterface;