/**
 * Database Backup Search Component
 * 
 * Provides an advanced search interface for database backups using the PyArrow Content Index
 * integration. Allows users to search, filter, and explore database backups with 
 * rich metadata from the content index.
 */

import { databaseBackupPyArrowAdapter } from '../database_backup_pyarrow_adapter.js';
import { databaseBackupBridge } from '../database_backup_bridge.js';

/**
 * Database Backup Search Component
 * 
 * Manages search and filtering of database backups with PyArrow Content Index integration
 */
class DatabaseBackupSearch {
  /**
   * Create a database backup search component
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {Function} options.onSelectBackup - Callback for backup selection
   * @param {Object} options.resources - Resource pool
   */
  constructor(options = {}) {
    this.container = options.container;
    this.onSelectBackup = options.onSelectBackup || (() => {});
    this.resources = options.resources || {};
    
    // Use provided adapter or get singleton instance
    this.adapter = this.resources.databaseBackupPyArrowAdapter || databaseBackupPyArrowAdapter;
    this.backupBridge = this.resources.databaseBackupBridge || databaseBackupBridge;
    
    // Search settings
    this.currentSearch = {
      text: '',
      db_type: '',
      filter: {},
      sort: { field: 'created_at', direction: 'desc' },
      limit: 20,
      offset: 0
    };
    
    // Cached results for pagination
    this.searchResults = null;
    this.isLoading = false;
    this.totalResults = 0;
    this.selectedBackup = null;
    
    // Stats cache
    this.backupStats = null;
    
    // Initialize component
    this.init();
  }
  
  /**
   * Initialize the search component
   */
  init() {
    if (!this.container) {
      console.error('Container element is required for DatabaseBackupSearch');
      return;
    }
    
    // Create UI elements
    this._createUI();
    
    // Bind event listeners
    this._bindEvents();
    
    // Load initial data
    this._loadInitialData();
  }
  
  /**
   * Create the search UI elements
   * @private
   */
  _createUI() {
    // Set container class for styling
    this.container.classList.add('database-backup-search');
    
    // Create search interface
    const searchHTML = `
      <div class="search-container">
        <div class="search-header">
          <h3>Search Database Backups</h3>
          <div class="refresh-button">
            <button id="refresh-search" title="Refresh search results">
              <i class="fa fa-refresh"></i>
            </button>
          </div>
        </div>
        
        <div class="search-form">
          <div class="search-row">
            <div class="search-field">
              <label for="search-text">Search</label>
              <input type="text" id="search-text" placeholder="Search by backup ID, CID, or path" />
            </div>
            
            <div class="search-field">
              <label for="db-type-filter">Database Type</label>
              <select id="db-type-filter">
                <option value="">All Types</option>
                <option value="orbitdb">OrbitDB</option>
                <option value="fireproofdb">FireproofDB</option>
                <option value="duckdb">DuckDB</option>
              </select>
            </div>
          </div>
          
          <div class="search-row">
            <div class="search-field">
              <label for="date-from">From Date</label>
              <input type="date" id="date-from" />
            </div>
            
            <div class="search-field">
              <label for="date-to">To Date</label>
              <input type="date" id="date-to" />
            </div>
            
            <div class="search-field">
              <label for="restore-filter">Restore Status</label>
              <select id="restore-filter">
                <option value="">All</option>
                <option value="restored">Restored</option>
                <option value="not-restored">Not Restored</option>
              </select>
            </div>
          </div>
          
          <div class="search-buttons">
            <button id="search-button" class="primary-button">Search</button>
            <button id="clear-button" class="secondary-button">Clear</button>
            <button id="advanced-filters-toggle" class="text-button">Advanced Filters</button>
          </div>
          
          <div id="advanced-filters" class="advanced-filters" style="display: none;">
            <div class="search-row">
              <div class="search-field">
                <label for="collection-filter">Collection/Table</label>
                <input type="text" id="collection-filter" placeholder="Filter by collection or table name" />
              </div>
              
              <div class="search-field">
                <label for="size-min">Min Size (KB)</label>
                <input type="number" id="size-min" min="0" />
              </div>
              
              <div class="search-field">
                <label for="size-max">Max Size (KB)</label>
                <input type="number" id="size-max" min="0" />
              </div>
            </div>
            
            <div class="search-row">
              <div class="search-field">
                <label for="sort-field">Sort By</label>
                <select id="sort-field">
                  <option value="created_at">Date Created</option>
                  <option value="size">Size</option>
                  <option value="document_count">Document Count</option>
                  <option value="metadata.restore_count">Restore Count</option>
                </select>
              </div>
              
              <div class="search-field">
                <label for="sort-direction">Order</label>
                <select id="sort-direction">
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
              
              <div class="search-field">
                <label for="limit">Results Per Page</label>
                <select id="limit">
                  <option value="10">10</option>
                  <option value="20" selected>20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="search-stats">
        <div class="stats-container">
          <div class="stats-loading">Loading statistics...</div>
          <div class="stats-content" style="display: none;">
            <div class="stats-row">
              <div class="stat-box">
                <span class="stat-label">Total Backups</span>
                <span class="stat-value" id="stat-total-backups">0</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">OrbitDB</span>
                <span class="stat-value" id="stat-orbitdb-backups">0</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">FireproofDB</span>
                <span class="stat-value" id="stat-fireproofdb-backups">0</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">DuckDB</span>
                <span class="stat-value" id="stat-duckdb-backups">0</span>
              </div>
            </div>
            <div class="stats-row">
              <div class="stat-box">
                <span class="stat-label">Avg. Size</span>
                <span class="stat-value" id="stat-avg-size">0 KB</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Total Restores</span>
                <span class="stat-value" id="stat-total-restores">0</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Created This Month</span>
                <span class="stat-value" id="stat-month-backups">0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="results-container">
        <div class="results-header">
          <h3>Search Results</h3>
          <div class="results-count">
            <span id="results-count">0</span> results
          </div>
        </div>
        
        <div class="results-loading" style="display: none;">
          <div class="loading-spinner"></div>
          <div class="loading-text">Searching backups...</div>
        </div>
        
        <div class="results-table-container">
          <table class="results-table">
            <thead>
              <tr>
                <th>Backup ID</th>
                <th>Database</th>
                <th>Date Created</th>
                <th>Size</th>
                <th>Restores</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              <tr class="no-results">
                <td colspan="6">No backups found. Try a different search or create a backup first.</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="pagination">
          <button id="prev-page" class="pagination-button" disabled>Previous</button>
          <span class="pagination-info">Page <span id="current-page">1</span></span>
          <button id="next-page" class="pagination-button" disabled>Next</button>
        </div>
      </div>
      
      <div class="backup-details" style="display: none;">
        <div class="details-header">
          <h3>Backup Details</h3>
          <button id="close-details" class="close-button">×</button>
        </div>
        <div class="details-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading backup details...</div>
        </div>
        <div class="details-content" style="display: none;">
          <div class="details-row">
            <div class="details-label">Backup ID:</div>
            <div class="details-value" id="detail-backup-id"></div>
          </div>
          <div class="details-row">
            <div class="details-label">Database Type:</div>
            <div class="details-value" id="detail-db-type"></div>
          </div>
          <div class="details-row">
            <div class="details-label">Created:</div>
            <div class="details-value" id="detail-created"></div>
          </div>
          <div class="details-row">
            <div class="details-label">Size:</div>
            <div class="details-value" id="detail-size"></div>
          </div>
          <div class="details-row">
            <div class="details-label">CID:</div>
            <div class="details-value" id="detail-cid"></div>
          </div>
          <div class="details-row">
            <div class="details-label">Virtual Path:</div>
            <div class="details-value" id="detail-path"></div>
          </div>
          <div class="details-row">
            <div class="details-label">Restore Count:</div>
            <div class="details-value" id="detail-restore-count"></div>
          </div>
          <div class="details-row" id="detail-restored-container">
            <div class="details-label">Last Restored:</div>
            <div class="details-value" id="detail-last-restored"></div>
          </div>
          <div class="details-section">
            <h4>Collections/Tables</h4>
            <div class="details-collections" id="detail-collections"></div>
          </div>
          <div class="details-section">
            <h4>Tags</h4>
            <div class="details-tags" id="detail-tags"></div>
          </div>
          <div class="details-actions">
            <button id="detail-restore-button" class="primary-button">Restore Backup</button>
            <button id="detail-delete-button" class="danger-button">Delete Backup</button>
          </div>
        </div>
      </div>
    `;
    
    // Set container HTML
    this.container.innerHTML = searchHTML;
  }
  
  /**
   * Bind event listeners to UI elements
   * @private
   */
  _bindEvents() {
    // Search form
    const searchButton = this.container.querySelector('#search-button');
    const clearButton = this.container.querySelector('#clear-button');
    const advancedFiltersToggle = this.container.querySelector('#advanced-filters-toggle');
    const refreshButton = this.container.querySelector('#refresh-search');
    
    // Pagination
    const prevPageButton = this.container.querySelector('#prev-page');
    const nextPageButton = this.container.querySelector('#next-page');
    
    // Details panel
    const closeDetailsButton = this.container.querySelector('#close-details');
    const restoreButton = this.container.querySelector('#detail-restore-button');
    const deleteButton = this.container.querySelector('#detail-delete-button');
    
    // Bind search events
    searchButton.addEventListener('click', () => this._performSearch());
    clearButton.addEventListener('click', () => this._clearSearch());
    advancedFiltersToggle.addEventListener('click', () => this._toggleAdvancedFilters());
    refreshButton.addEventListener('click', () => this._refreshSearch());
    
    // Bind pagination events
    prevPageButton.addEventListener('click', () => this._prevPage());
    nextPageButton.addEventListener('click', () => this._nextPage());
    
    // Bind details events
    closeDetailsButton.addEventListener('click', () => this._closeDetails());
    restoreButton.addEventListener('click', () => this._restoreSelectedBackup());
    deleteButton.addEventListener('click', () => this._deleteSelectedBackup());
    
    // Listen for adapter events
    this.adapter.on('backup-indexed', () => this._refreshStats());
    this.adapter.on('restore-metadata-updated', () => this._refreshStats());
  }
  
  /**
   * Load initial statistics and perform a default search
   * @private
   */
  async _loadInitialData() {
    // Load stats
    this._loadBackupStats();
    
    // Perform initial search
    this._performSearch();
  }
  
  /**
   * Toggle the advanced filters section
   * @private
   */
  _toggleAdvancedFilters() {
    const advancedFilters = this.container.querySelector('#advanced-filters');
    const button = this.container.querySelector('#advanced-filters-toggle');
    
    if (advancedFilters.style.display === 'none') {
      advancedFilters.style.display = 'block';
      button.textContent = 'Hide Advanced Filters';
    } else {
      advancedFilters.style.display = 'none';
      button.textContent = 'Advanced Filters';
    }
  }
  
  /**
   * Load backup statistics and update the UI
   * @private
   */
  async _loadBackupStats() {
    try {
      // Show loading state
      const statsLoading = this.container.querySelector('.stats-loading');
      const statsContent = this.container.querySelector('.stats-content');
      
      statsLoading.style.display = 'block';
      statsContent.style.display = 'none';
      
      // Get stats from adapter
      this.backupStats = await this.adapter.getBackupStats();
      
      // Update UI
      this._updateStatsUI(this.backupStats);
      
      // Hide loading, show content
      statsLoading.style.display = 'none';
      statsContent.style.display = 'block';
    } catch (error) {
      console.error('Error loading backup stats:', error);
      
      // Show simple error in stats area
      const statsLoading = this.container.querySelector('.stats-loading');
      statsLoading.textContent = 'Error loading statistics. Try refreshing the page.';
    }
  }
  
  /**
   * Update the stats UI with current statistics
   * 
   * @param {Object} stats - Backup statistics
   * @private
   */
  _updateStatsUI(stats) {
    if (!stats) return;
    
    // Update total count
    const totalBackups = this.container.querySelector('#stat-total-backups');
    totalBackups.textContent = stats.total_count;
    
    // Update database-specific counts
    const orbitdbBackups = this.container.querySelector('#stat-orbitdb-backups');
    orbitdbBackups.textContent = stats.by_db_type['orbitdb'] || 0;
    
    const fireproofdbBackups = this.container.querySelector('#stat-fireproofdb-backups');
    fireproofdbBackups.textContent = stats.by_db_type['fireproofdb'] || 0;
    
    const duckdbBackups = this.container.querySelector('#stat-duckdb-backups');
    duckdbBackups.textContent = stats.by_db_type['duckdb'] || 0;
    
    // Update average size
    const avgSize = this.container.querySelector('#stat-avg-size');
    avgSize.textContent = this._formatSize(stats.size_metrics.average_size);
    
    // Update restore count
    const totalRestores = this.container.querySelector('#stat-total-restores');
    totalRestores.textContent = stats.restore_metrics.total_restores;
    
    // Update this month's backups
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const monthBackups = this.container.querySelector('#stat-month-backups');
    monthBackups.textContent = stats.by_month[currentMonth] || 0;
  }
  
  /**
   * Build search options from form values
   * @returns {Object} Search options
   * @private
   */
  _getSearchOptions() {
    // Get basic search params
    const searchText = this.container.querySelector('#search-text').value.trim();
    const dbType = this.container.querySelector('#db-type-filter').value;
    const dateFrom = this.container.querySelector('#date-from').value;
    const dateTo = this.container.querySelector('#date-to').value;
    const restoreFilter = this.container.querySelector('#restore-filter').value;
    
    // Get advanced filters
    const collectionFilter = this.container.querySelector('#collection-filter').value.trim();
    const minSize = this.container.querySelector('#size-min').value;
    const maxSize = this.container.querySelector('#size-max').value;
    
    // Get sort options
    const sortField = this.container.querySelector('#sort-field').value;
    const sortDirection = this.container.querySelector('#sort-direction').value;
    const limit = parseInt(this.container.querySelector('#limit').value, 10);
    
    // Build filter object
    const filter = {};
    
    if (dateFrom) {
      filter.date_from = dateFrom;
    }
    
    if (dateTo) {
      filter.date_to = dateTo;
    }
    
    if (restoreFilter === 'restored') {
      filter.restored = true;
    } else if (restoreFilter === 'not-restored') {
      filter.restored = false;
    }
    
    if (collectionFilter) {
      filter.collection = collectionFilter;
    }
    
    if (minSize) {
      filter.min_size = parseInt(minSize, 10) * 1024; // Convert KB to bytes
    }
    
    if (maxSize) {
      filter.max_size = parseInt(maxSize, 10) * 1024; // Convert KB to bytes
    }
    
    // Build search options
    const options = {
      text: searchText,
      filter,
      sort: {
        field: sortField,
        direction: sortDirection
      },
      limit,
      offset: 0 // Start at first page
    };
    
    // Add db_type if selected
    if (dbType) {
      options.db_type = dbType;
    }
    
    return options;
  }
  
  /**
   * Perform search based on current form values
   * @private
   */
  async _performSearch() {
    try {
      this._setLoading(true);
      
      // Get search options from form
      const options = this._getSearchOptions();
      
      // Save current search
      this.currentSearch = options;
      
      // Execute search
      const results = await this.adapter.searchBackups(options);
      
      // Update results
      this.searchResults = results;
      this.totalResults = results.total;
      
      // Update UI
      this._updateResultsUI(results);
      this._updatePaginationUI();
      
      // Clear selected backup
      this.selectedBackup = null;
      this._closeDetails();
    } catch (error) {
      console.error('Error searching backups:', error);
      this._showError('Search failed', error.message);
    } finally {
      this._setLoading(false);
    }
  }
  
  /**
   * Refresh current search results
   * @private
   */
  async _refreshSearch() {
    try {
      this._setLoading(true);
      
      // Execute search with current options
      const results = await this.adapter.searchBackups(this.currentSearch);
      
      // Update results
      this.searchResults = results;
      this.totalResults = results.total;
      
      // Update UI
      this._updateResultsUI(results);
      this._updatePaginationUI();
      
      // Clear selected backup
      this.selectedBackup = null;
      this._closeDetails();
      
      // Also refresh stats
      this._refreshStats();
    } catch (error) {
      console.error('Error refreshing search:', error);
      this._showError('Refresh failed', error.message);
    } finally {
      this._setLoading(false);
    }
  }
  
  /**
   * Refresh statistics
   * @private
   */
  async _refreshStats() {
    this._loadBackupStats();
  }
  
  /**
   * Clear search form and results
   * @private
   */
  _clearSearch() {
    // Reset form inputs
    this.container.querySelector('#search-text').value = '';
    this.container.querySelector('#db-type-filter').value = '';
    this.container.querySelector('#date-from').value = '';
    this.container.querySelector('#date-to').value = '';
    this.container.querySelector('#restore-filter').value = '';
    this.container.querySelector('#collection-filter').value = '';
    this.container.querySelector('#size-min').value = '';
    this.container.querySelector('#size-max').value = '';
    this.container.querySelector('#sort-field').value = 'created_at';
    this.container.querySelector('#sort-direction').value = 'desc';
    this.container.querySelector('#limit').value = '20';
    
    // Reset current search
    this.currentSearch = {
      text: '',
      db_type: '',
      filter: {},
      sort: { field: 'created_at', direction: 'desc' },
      limit: 20,
      offset: 0
    };
    
    // Perform fresh search
    this._performSearch();
  }
  
  /**
   * Go to the previous page of results
   * @private
   */
  async _prevPage() {
    if (this.currentSearch.offset <= 0) return;
    
    try {
      this._setLoading(true);
      
      // Update offset
      this.currentSearch.offset = Math.max(0, this.currentSearch.offset - this.currentSearch.limit);
      
      // Execute search
      const results = await this.adapter.searchBackups(this.currentSearch);
      
      // Update results
      this.searchResults = results;
      
      // Update UI
      this._updateResultsUI(results);
      this._updatePaginationUI();
    } catch (error) {
      console.error('Error loading previous page:', error);
      this._showError('Page navigation failed', error.message);
    } finally {
      this._setLoading(false);
    }
  }
  
  /**
   * Go to the next page of results
   * @private
   */
  async _nextPage() {
    const nextOffset = this.currentSearch.offset + this.currentSearch.limit;
    if (nextOffset >= this.totalResults) return;
    
    try {
      this._setLoading(true);
      
      // Update offset
      this.currentSearch.offset = nextOffset;
      
      // Execute search
      const results = await this.adapter.searchBackups(this.currentSearch);
      
      // Update results
      this.searchResults = results;
      
      // Update UI
      this._updateResultsUI(results);
      this._updatePaginationUI();
    } catch (error) {
      console.error('Error loading next page:', error);
      this._showError('Page navigation failed', error.message);
    } finally {
      this._setLoading(false);
    }
  }
  
  /**
   * Update the UI based on search results
   * 
   * @param {Object} results - Search results
   * @private
   */
  _updateResultsUI(results) {
    // Get results table body
    const tbody = this.container.querySelector('#results-tbody');
    
    // Update results count
    const resultsCount = this.container.querySelector('#results-count');
    resultsCount.textContent = results.total;
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Show no results message if needed
    if (!results.backups || results.backups.length === 0) {
      const noResultsRow = document.createElement('tr');
      noResultsRow.className = 'no-results';
      noResultsRow.innerHTML = '<td colspan="6">No backups found. Try a different search or create a backup first.</td>';
      tbody.appendChild(noResultsRow);
      return;
    }
    
    // Add result rows
    for (const backup of results.backups) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td title="${backup.backup_id}">${this._truncateText(backup.backup_id, 10)}</td>
        <td>${backup.db_type}</td>
        <td>${this._formatDate(backup.created_at)}</td>
        <td>${this._formatSize(backup.size)}</td>
        <td>${backup.metadata?.restore_count || 0}</td>
        <td class="actions-cell">
          <button class="view-button" title="View Details" data-cid="${backup.cid}">
            <i class="fa fa-eye"></i>
          </button>
          <button class="restore-button" title="Restore Backup" data-cid="${backup.cid}">
            <i class="fa fa-undo"></i>
          </button>
        </td>
      `;
      
      // Bind click events
      const viewButton = row.querySelector('.view-button');
      viewButton.addEventListener('click', (e) => {
        const cid = e.currentTarget.getAttribute('data-cid');
        this._viewBackupDetails(cid);
      });
      
      const restoreButton = row.querySelector('.restore-button');
      restoreButton.addEventListener('click', (e) => {
        const cid = e.currentTarget.getAttribute('data-cid');
        this._restoreBackup(cid);
      });
      
      tbody.appendChild(row);
    }
  }
  
  /**
   * Update pagination UI based on current search state
   * @private
   */
  _updatePaginationUI() {
    const prevPageButton = this.container.querySelector('#prev-page');
    const nextPageButton = this.container.querySelector('#next-page');
    const currentPageSpan = this.container.querySelector('#current-page');
    
    // Calculate current page
    const currentPage = Math.floor(this.currentSearch.offset / this.currentSearch.limit) + 1;
    currentPageSpan.textContent = currentPage;
    
    // Update button states
    prevPageButton.disabled = this.currentSearch.offset <= 0;
    nextPageButton.disabled = this.currentSearch.offset + this.currentSearch.limit >= this.totalResults;
  }
  
  /**
   * View detailed information about a specific backup
   * 
   * @param {string} cid - Content ID of the backup
   * @private
   */
  async _viewBackupDetails(cid) {
    try {
      // Show loading state
      const detailsPanel = this.container.querySelector('.backup-details');
      const detailsLoading = this.container.querySelector('.details-loading');
      const detailsContent = this.container.querySelector('.details-content');
      
      detailsPanel.style.display = 'block';
      detailsLoading.style.display = 'block';
      detailsContent.style.display = 'none';
      
      // Get backup details
      const backup = await this.adapter.getBackupDetails({ cid });
      this.selectedBackup = backup;
      
      // Update details UI
      this._updateDetailsUI(backup);
      
      // Hide loading, show content
      detailsLoading.style.display = 'none';
      detailsContent.style.display = 'block';
      
      // Call selection callback if provided
      if (this.onSelectBackup) {
        this.onSelectBackup(backup);
      }
    } catch (error) {
      console.error('Error loading backup details:', error);
      this._closeDetails();
      this._showError('Details Failed', `Could not load backup details: ${error.message}`);
    }
  }
  
  /**
   * Close the details panel
   * @private
   */
  _closeDetails() {
    const detailsPanel = this.container.querySelector('.backup-details');
    detailsPanel.style.display = 'none';
    this.selectedBackup = null;
  }
  
  /**
   * Update the details UI with backup information
   * 
   * @param {Object} backup - Backup details
   * @private
   */
  _updateDetailsUI(backup) {
    // Basic details
    this.container.querySelector('#detail-backup-id').textContent = backup.backup_id;
    this.container.querySelector('#detail-db-type').textContent = backup.db_type;
    this.container.querySelector('#detail-created').textContent = this._formatDate(backup.created_at, true);
    this.container.querySelector('#detail-size').textContent = this._formatSize(backup.size);
    this.container.querySelector('#detail-cid').textContent = backup.cid;
    this.container.querySelector('#detail-path').textContent = backup.path;
    
    // Restore information
    const restoreCount = backup.metadata?.restore_count || 0;
    this.container.querySelector('#detail-restore-count').textContent = restoreCount;
    
    const restoredContainer = this.container.querySelector('#detail-restored-container');
    const lastRestored = this.container.querySelector('#detail-last-restored');
    
    if (restoreCount > 0 && backup.metadata?.last_restored) {
      restoredContainer.style.display = 'flex';
      lastRestored.textContent = this._formatDate(backup.metadata.last_restored, true);
    } else {
      restoredContainer.style.display = 'none';
    }
    
    // Collections/Tables
    const collectionsContainer = this.container.querySelector('#detail-collections');
    collectionsContainer.innerHTML = '';
    
    if (backup.collections && backup.collections !== 'all') {
      if (Array.isArray(backup.collections)) {
        collectionsContainer.innerHTML = backup.collections.map(c => 
          `<span class="tag">${c}</span>`
        ).join('');
      } else {
        collectionsContainer.textContent = backup.collections;
      }
    } else if (backup.tables && backup.tables !== 'all') {
      if (Array.isArray(backup.tables)) {
        collectionsContainer.innerHTML = backup.tables.map(t => 
          `<span class="tag">${t}</span>`
        ).join('');
      } else {
        collectionsContainer.textContent = backup.tables;
      }
    } else {
      collectionsContainer.textContent = 'All collections/tables';
    }
    
    // Tags
    const tagsContainer = this.container.querySelector('#detail-tags');
    tagsContainer.innerHTML = '';
    
    if (backup.tags && Array.isArray(backup.tags)) {
      tagsContainer.innerHTML = backup.tags.map(tag => 
        `<span class="tag">${tag}</span>`
      ).join('');
    } else {
      tagsContainer.textContent = 'No tags';
    }
  }
  
  /**
   * Restore the selected backup
   * @private
   */
  async _restoreSelectedBackup() {
    if (!this.selectedBackup) return;
    
    // Confirm restore
    if (!confirm(`Are you sure you want to restore this ${this.selectedBackup.db_type} backup?`)) {
      return;
    }
    
    try {
      this._setLoading(true);
      
      // Call the appropriate restore method based on database type
      let result;
      
      switch (this.selectedBackup.db_type) {
        case 'orbitdb':
          result = await this.backupBridge.restoreOrbitDB({
            cid: this.selectedBackup.cid,
            backup_id: this.selectedBackup.backup_id
          });
          break;
        case 'fireproofdb':
          result = await this.backupBridge.restoreFireproofDB({
            cid: this.selectedBackup.cid,
            backup_id: this.selectedBackup.backup_id
          });
          break;
        case 'duckdb':
          result = await this.backupBridge.restoreDuckDB({
            cid: this.selectedBackup.cid,
            backup_id: this.selectedBackup.backup_id
          });
          break;
        default:
          throw new Error(`Unknown database type: ${this.selectedBackup.db_type}`);
      }
      
      // Close details panel
      this._closeDetails();
      
      // Show success message
      alert(`Backup restored successfully! Restored ${result.collections_restored.length} collections/tables.`);
      
      // Refresh results after restore
      this._refreshSearch();
    } catch (error) {
      console.error('Error restoring backup:', error);
      this._showError('Restore Failed', error.message);
    } finally {
      this._setLoading(false);
    }
  }
  
  /**
   * Restore a backup by CID
   * 
   * @param {string} cid - Content ID of the backup
   * @private
   */
  async _restoreBackup(cid) {
    try {
      // Get backup details
      const backup = await this.adapter.getBackupDetails({ cid });
      
      // Store as selected backup
      this.selectedBackup = backup;
      
      // Call restore method
      await this._restoreSelectedBackup();
    } catch (error) {
      console.error('Error restoring backup:', error);
      this._showError('Restore Failed', error.message);
    }
  }
  
  /**
   * Delete the selected backup
   * @private
   */
  async _deleteSelectedBackup() {
    if (!this.selectedBackup) return;
    
    // Confirm delete with additional warning
    if (!confirm(`WARNING: Are you sure you want to permanently delete this ${this.selectedBackup.db_type} backup? This action cannot be undone.`)) {
      return;
    }
    
    try {
      this._setLoading(true);
      
      // Delete backup
      await this.backupBridge.deleteBackup(
        this.selectedBackup.db_type, 
        this.selectedBackup.backup_id
      );
      
      // Close details panel
      this._closeDetails();
      
      // Show success message
      alert('Backup deleted successfully.');
      
      // Refresh search results
      this._refreshSearch();
    } catch (error) {
      console.error('Error deleting backup:', error);
      this._showError('Delete Failed', error.message);
    } finally {
      this._setLoading(false);
    }
  }
  
  /**
   * Set loading state for the UI
   * 
   * @param {boolean} isLoading - Whether the UI should show loading
   * @private
   */
  _setLoading(isLoading) {
    this.isLoading = isLoading;
    
    // Update UI elements
    const loadingIndicator = this.container.querySelector('.results-loading');
    
    if (isLoading) {
      loadingIndicator.style.display = 'flex';
    } else {
      loadingIndicator.style.display = 'none';
    }
  }
  
  /**
   * Format a date for display
   * 
   * @param {string} dateString - ISO date string
   * @param {boolean} includeTime - Whether to include time
   * @returns {string} Formatted date
   * @private
   */
  _formatDate(dateString, includeTime = false) {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      
      if (includeTime) {
        return date.toLocaleString();
      } else {
        return date.toLocaleDateString();
      }
    } catch (e) {
      return dateString;
    }
  }
  
  /**
   * Format a size in bytes for display
   * 
   * @param {number} sizeInBytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  _formatSize(sizeInBytes) {
    if (!sizeInBytes) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = parseInt(sizeInBytes, 10);
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }
  
  /**
   * Truncate long text with ellipsis
   * 
   * @param {string} text - Text to truncate
   * @param {number} length - Maximum length
   * @returns {string} Truncated text
   * @private
   */
  _truncateText(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    
    return text.substring(0, length) + '...';
  }
  
  /**
   * Show an error message
   * 
   * @param {string} title - Error title
   * @param {string} message - Error message
   * @private
   */
  _showError(title, message) {
    // Using simple alert for now
    alert(`${title}: ${message}`);
  }
  
  /**
   * Sync backup metadata with the content index
   * 
   * @param {string} dbType - Database type to sync
   * @returns {Promise<Object>} Sync results
   */
  async syncBackupsToIndex(dbType) {
    try {
      this._setLoading(true);
      
      // Run sync operation
      const results = await this.adapter.syncBackupsToIndex({
        db_type: dbType
      });
      
      // Refresh data after sync
      this._refreshStats();
      this._refreshSearch();
      
      return results;
    } catch (error) {
      console.error('Error syncing backups to index:', error);
      this._showError('Sync Failed', error.message);
      throw error;
    } finally {
      this._setLoading(false);
    }
  }
}

export default DatabaseBackupSearch;