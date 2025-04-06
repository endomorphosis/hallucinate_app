/**
 * Enhanced Search Integration Module
 * 
 * This module integrates the enhanced search functionality into the PyArrow Content Index Dashboard.
 * It adds:
 * - Advanced search capabilities
 * - Saved searches functionality
 * - Search history tracking
 */

// Import the search discovery components
const {
  createAdvancedSearchPanel,
  createSavedSearchesModal,
  createSearchHistoryModal,
  createActiveFiltersIndicator,
  collectSearchCriteria,
  applySearchCriteria,
  showSaveSearchDialog
} = require('./search_discovery.js');

/**
 * Integrates enhanced search capabilities into the dashboard
 * 
 * @param {Object} dashboard - The dashboard instance to integrate with
 * @returns {boolean} - Whether the integration was successful
 */
function integrateEnhancedSearch(dashboard) {
  if (!dashboard) {
    console.error('Dashboard instance is required for integration');
    return false;
  }

  try {
    // Store references to original methods if needed
    const originalRenderSearchControls = dashboard._renderSearchControls;

    if (!originalRenderSearchControls) {
      console.error('Dashboard does not have _renderSearchControls method');
      return false;
    }

    // Add storage for saved searches and history if not already present
    if (!dashboard.savedSearches) {
      dashboard.savedSearches = loadSavedSearches();
    }

    if (!dashboard.searchHistory) {
      dashboard.searchHistory = loadSearchHistory();
    }

    // Override the _renderSearchControls method
    dashboard._renderSearchControls = function() {
      const container = document.createElement('div');
      container.className = 'dashboard-controls';

      // Create basic search box (similar to original implementation)
      const searchBox = document.createElement('div');
      searchBox.className = 'search-box';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search by CID, path, name, or tags...';
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this._handleSearch(searchInput.value);
        }
      });
      searchBox.appendChild(searchInput);

      const searchButton = document.createElement('button');
      searchButton.textContent = 'Search';
      searchButton.addEventListener('click', () => {
        this._handleSearch(searchInput.value);
      });
      searchBox.appendChild(searchButton);

      // Add advanced search toggle button
      const advancedButton = document.createElement('button');
      advancedButton.textContent = 'Advanced';
      advancedButton.addEventListener('click', () => {
        const advPanel = document.querySelector('.advanced-search-panel');
        if (advPanel) {
          advPanel.style.display = advPanel.style.display === 'none' ? 'block' : 'none';
        }
      });
      searchBox.appendChild(advancedButton);

      container.appendChild(searchBox);
      
      // Add view mode control (grid or list view)
      const viewModeControls = document.createElement('div');
      viewModeControls.className = 'view-mode-controls';
      
      // List view button (default)
      const listViewBtn = document.createElement('button');
      listViewBtn.className = 'view-mode-btn' + (this.viewMode !== 'grid' ? ' active' : '');
      listViewBtn.innerHTML = '<i class="fas fa-list"></i>';
      listViewBtn.title = 'List View';
      listViewBtn.dataset.mode = 'list';
      listViewBtn.addEventListener('click', () => {
        if (this.viewMode !== 'list') {
          this.viewMode = 'list';
          updateViewModeButtons();
          this._refreshDashboard();
          
          // Emit view mode change event if event bus exists
          if (typeof eventBus !== 'undefined' && eventBus) {
            eventBus.emit('view-mode-changed', 'list');
          }
        }
      });
      viewModeControls.appendChild(listViewBtn);
      
      // Grid view button
      const gridViewBtn = document.createElement('button');
      gridViewBtn.className = 'view-mode-btn' + (this.viewMode === 'grid' ? ' active' : '');
      gridViewBtn.innerHTML = '<i class="fas fa-th-large"></i>';
      gridViewBtn.title = 'Grid View';
      gridViewBtn.dataset.mode = 'grid';
      gridViewBtn.addEventListener('click', () => {
        if (this.viewMode !== 'grid') {
          this.viewMode = 'grid';
          updateViewModeButtons();
          this._refreshDashboard();
          
          // Emit view mode change event if event bus exists
          if (typeof eventBus !== 'undefined' && eventBus) {
            eventBus.emit('view-mode-changed', 'grid');
          }
        }
      });
      viewModeControls.appendChild(gridViewBtn);
      
      // Helper function to update button states
      const updateViewModeButtons = () => {
        listViewBtn.classList.toggle('active', this.viewMode !== 'grid');
        gridViewBtn.classList.toggle('active', this.viewMode === 'grid');
      };
      
      // Add view mode controls to container
      container.appendChild(viewModeControls);

      // Add filter box with history and saved searches buttons
      const filterBox = document.createElement('div');
      filterBox.className = 'filter-box';

      // Status indicator for active filters
      if (this.searchCriteria && Object.keys(this.searchCriteria).length > 0) {
        const filtersIndicator = createActiveFiltersIndicator(this.searchCriteria, () => {
          this.searchCriteria = {};
          this._refreshDashboard();
        });
        if (filtersIndicator) {
          filterBox.appendChild(filtersIndicator);
        }
      }

      // Sort option (from original implementation)
      const sortSelect = document.createElement('select');
      sortSelect.addEventListener('change', () => {
        this.sortField = sortSelect.value;
        this._refreshDashboard();
      });
      
      const sortOptions = [
        { value: 'timestamp', label: 'Sort by: Date Added (newest)' },
        { value: 'timestamp_asc', label: 'Sort by: Date Added (oldest)' },
        { value: 'size', label: 'Sort by: Size (largest)' },
        { value: 'size_asc', label: 'Sort by: Size (smallest)' },
        { value: 'name', label: 'Sort by: Name (A-Z)' },
        { value: 'name_desc', label: 'Sort by: Name (Z-A)' }
      ];
      
      sortOptions.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        if (option.value === this.sortField) {
          optionEl.selected = true;
        }
        sortSelect.appendChild(optionEl);
      });
      
      filterBox.appendChild(sortSelect);

      // History button
      const historyButton = document.createElement('button');
      historyButton.textContent = 'History';
      historyButton.addEventListener('click', () => {
        this._showSearchHistory();
      });
      filterBox.appendChild(historyButton);

      // Saved searches button
      const savedButton = document.createElement('button');
      savedButton.textContent = 'Saved Searches';
      savedButton.addEventListener('click', () => {
        this._showSavedSearches();
      });
      filterBox.appendChild(savedButton);

      // Add refresh button
      const refreshButton = document.createElement('button');
      refreshButton.id = 'content-index-refresh-btn';
      refreshButton.textContent = 'Refresh';
      refreshButton.addEventListener('click', () => {
        this._refreshDashboard();
      });
      filterBox.appendChild(refreshButton);

      container.appendChild(filterBox);

      // Create and add advanced search panel
      const advancedPanel = createAdvancedSearchPanel();
      container.appendChild(advancedPanel);

      // Initialize saved searches modal
      this.savedSearchesModal = createSavedSearchesModal(
        this.savedSearches,
        (search) => this._applySavedSearch(search),
        (id) => this._deleteSavedSearch(id)
      );
      document.body.appendChild(this.savedSearchesModal);

      // Initialize search history modal
      this.searchHistoryModal = createSearchHistoryModal(
        this.searchHistory,
        (historyItem) => this._applyHistorySearch(historyItem),
        (id) => this._deleteSearchHistory(id),
        () => this._clearSearchHistory()
      );
      document.body.appendChild(this.searchHistoryModal);

      // Add event listeners for the advanced search panel
      setTimeout(() => {
        const applyButton = document.getElementById('adv-search-apply');
        if (applyButton) {
          applyButton.addEventListener('click', () => {
            this._applyAdvancedSearch();
          });
        }

        const saveButton = document.getElementById('adv-search-save');
        if (saveButton) {
          saveButton.addEventListener('click', () => {
            this._saveAdvancedSearch();
          });
        }

        const resetButton = document.getElementById('adv-search-reset');
        if (resetButton) {
          resetButton.addEventListener('click', () => {
            this._resetAdvancedSearch();
          });
        }
      }, 0);

      return container;
    };

    // Add or override the search handling methods
    dashboard._handleSearch = function(query) {
      if (!query || query.trim() === '') {
        return;
      }

      // Create a basic search criteria with the query
      const criteria = {
        query: query.trim()
      };

      // Apply the search
      this.searchCriteria = criteria;
      this._addToSearchHistory({
        query: query.trim(),
        criteria: criteria,
        timestamp: Date.now(),
        resultCount: null // This will be updated after results are fetched
      });

      this._refreshDashboard();
    };

    dashboard._applyAdvancedSearch = function() {
      const criteria = collectSearchCriteria();
      
      if (Object.keys(criteria).length === 0) {
        console.warn('No search criteria provided');
        return;
      }

      // Apply the search criteria
      this.searchCriteria = criteria;
      
      // Add to search history
      this._addToSearchHistory({
        query: 'Advanced Search',
        criteria: criteria,
        timestamp: Date.now(),
        resultCount: null // This will be updated after results are fetched
      });

      // Hide the advanced search panel
      const advPanel = document.querySelector('.advanced-search-panel');
      if (advPanel) {
        advPanel.style.display = 'none';
      }

      this._refreshDashboard();
    };

    dashboard._resetAdvancedSearch = function() {
      // Reset all form fields
      document.querySelectorAll('.search-field input, .search-field select').forEach(field => {
        if (field.type === 'select-one') {
          field.selectedIndex = 0;
        } else if (field.type === 'checkbox' || field.type === 'radio') {
          field.checked = false;
        } else {
          field.value = '';
        }
      });
    };

    dashboard._saveAdvancedSearch = function() {
      const criteria = collectSearchCriteria();
      
      if (Object.keys(criteria).length === 0) {
        console.warn('No search criteria to save');
        return;
      }

      // Show save dialog
      showSaveSearchDialog(criteria, (savedSearch) => {
        // Generate unique ID
        savedSearch.id = 'search_' + Date.now();
        
        // Add to saved searches
        this.savedSearches.unshift(savedSearch);
        
        // Save to localStorage
        saveSavedSearches(this.savedSearches);
        
        // Update saved searches modal
        if (this.savedSearchesModal) {
          document.body.removeChild(this.savedSearchesModal);
          this.savedSearchesModal = createSavedSearchesModal(
            this.savedSearches,
            (search) => this._applySavedSearch(search),
            (id) => this._deleteSavedSearch(id)
          );
          document.body.appendChild(this.savedSearchesModal);
        }
        
        // Show confirmation
        this._showNotification('Search saved successfully', 'success');
      });
    };

    dashboard._showSavedSearches = function() {
      if (this.savedSearchesModal) {
        this.savedSearchesModal.style.display = 'flex';
      }
    };

    dashboard._applySavedSearch = function(search) {
      if (!search || !search.criteria) {
        console.error('Invalid saved search');
        return;
      }

      // Apply the search criteria
      this.searchCriteria = search.criteria;
      
      // Add to search history
      this._addToSearchHistory({
        query: search.name,
        criteria: search.criteria,
        timestamp: Date.now(),
        resultCount: null // This will be updated after results are fetched
      });

      // Apply criteria to advanced search form
      applySearchCriteria(search.criteria);

      // Hide the modal
      if (this.savedSearchesModal) {
        this.savedSearchesModal.style.display = 'none';
      }

      this._refreshDashboard();
    };

    dashboard._deleteSavedSearch = function(id) {
      if (!id) return;

      // Remove from saved searches
      this.savedSearches = this.savedSearches.filter(search => search.id !== id);
      
      // Save to localStorage
      saveSavedSearches(this.savedSearches);
      
      // Update saved searches modal
      if (this.savedSearchesModal) {
        document.body.removeChild(this.savedSearchesModal);
        this.savedSearchesModal = createSavedSearchesModal(
          this.savedSearches,
          (search) => this._applySavedSearch(search),
          (id) => this._deleteSavedSearch(id)
        );
        document.body.appendChild(this.savedSearchesModal);
      }
    };

    dashboard._showSearchHistory = function() {
      if (this.searchHistoryModal) {
        this.searchHistoryModal.style.display = 'flex';
      }
    };

    dashboard._applyHistorySearch = function(historyItem) {
      if (!historyItem) {
        console.error('Invalid history item');
        return;
      }

      // Apply the search criteria
      if (historyItem.criteria) {
        this.searchCriteria = historyItem.criteria;
        
        // Apply criteria to advanced search form
        applySearchCriteria(historyItem.criteria);
      } else if (historyItem.query) {
        // Simple query search
        this.searchCriteria = { query: historyItem.query };
        
        // Update search input
        const searchInput = document.querySelector('.search-box input');
        if (searchInput) {
          searchInput.value = historyItem.query;
        }
      }

      // Add new entry to search history
      this._addToSearchHistory({
        query: historyItem.query || 'Advanced Search',
        criteria: historyItem.criteria || {},
        timestamp: Date.now(),
        resultCount: null // This will be updated after results are fetched
      });

      // Hide the modal
      if (this.searchHistoryModal) {
        this.searchHistoryModal.style.display = 'none';
      }

      this._refreshDashboard();
    };

    dashboard._deleteSearchHistory = function(id) {
      if (!id) return;

      // Remove from search history
      this.searchHistory = this.searchHistory.filter(item => item.id !== id);
      
      // Save to localStorage
      saveSearchHistory(this.searchHistory);
      
      // Update search history modal
      if (this.searchHistoryModal) {
        document.body.removeChild(this.searchHistoryModal);
        this.searchHistoryModal = createSearchHistoryModal(
          this.searchHistory,
          (historyItem) => this._applyHistorySearch(historyItem),
          (id) => this._deleteSearchHistory(id),
          () => this._clearSearchHistory()
        );
        document.body.appendChild(this.searchHistoryModal);
      }
    };

    dashboard._clearSearchHistory = function() {
      // Clear search history
      this.searchHistory = [];
      
      // Save to localStorage
      saveSearchHistory(this.searchHistory);
      
      // Update search history modal
      if (this.searchHistoryModal) {
        document.body.removeChild(this.searchHistoryModal);
        this.searchHistoryModal = createSearchHistoryModal(
          this.searchHistory,
          (historyItem) => this._applyHistorySearch(historyItem),
          (id) => this._deleteSearchHistory(id),
          () => this._clearSearchHistory()
        );
        document.body.appendChild(this.searchHistoryModal);
      }
    };

    dashboard._addToSearchHistory = function(historyItem) {
      if (!historyItem) return;

      // Generate ID if not provided
      if (!historyItem.id) {
        historyItem.id = 'history_' + Date.now();
      }

      // Add to beginning of history array
      this.searchHistory.unshift(historyItem);
      
      // Limit history to 50 items
      if (this.searchHistory.length > 50) {
        this.searchHistory = this.searchHistory.slice(0, 50);
      }
      
      // Save to localStorage
      saveSearchHistory(this.searchHistory);
      
      // Update search history modal
      if (this.searchHistoryModal) {
        document.body.removeChild(this.searchHistoryModal);
        this.searchHistoryModal = createSearchHistoryModal(
          this.searchHistory,
          (historyItem) => this._applyHistorySearch(historyItem),
          (id) => this._deleteSearchHistory(id),
          () => this._clearSearchHistory()
        );
        document.body.appendChild(this.searchHistoryModal);
      }
    };

    dashboard._updateHistoryResultCount = function(historyId, count) {
      if (!historyId || count === undefined) return;

      // Update result count in history item
      const historyItem = this.searchHistory.find(item => item.id === historyId);
      if (historyItem) {
        historyItem.resultCount = count;
        
        // Save to localStorage
        saveSearchHistory(this.searchHistory);
        
        // Update search history modal (if needed)
        if (this.searchHistoryModal && this.searchHistoryModal.style.display === 'flex') {
          document.body.removeChild(this.searchHistoryModal);
          this.searchHistoryModal = createSearchHistoryModal(
            this.searchHistory,
            (historyItem) => this._applyHistorySearch(historyItem),
            (id) => this._deleteSearchHistory(id),
            () => this._clearSearchHistory()
          );
          document.body.appendChild(this.searchHistoryModal);
        }
      }
    };

    // Add notification method if not present
    if (!dashboard._showNotification) {
      dashboard._showNotification = function(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = type === 'error' ? 'error-notification' : 'success-notification';
        
        const icon = document.createElement('span');
        icon.className = type === 'error' ? 'error-icon' : 'success-icon';
        icon.textContent = type === 'error' ? '✕' : '✓';
        notification.appendChild(icon);
        
        const messageEl = document.createElement('div');
        messageEl.className = type === 'error' ? 'error-message' : 'success-message';
        messageEl.textContent = message;
        notification.appendChild(messageEl);
        
        const closeButton = document.createElement('button');
        closeButton.className = type === 'error' ? 'error-close' : 'success-close';
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => {
          document.body.removeChild(notification);
        });
        notification.appendChild(closeButton);
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 5000);
      };
    }

    // Override or supplement the refreshDashboard method to update criteria
    const originalRefreshDashboard = dashboard._refreshDashboard;
    dashboard._refreshDashboard = function() {
      // Handle search criteria to update the request parameters
      if (this.searchCriteria && Object.keys(this.searchCriteria).length > 0) {
        // Store the current history item ID to update result count later
        this.currentHistoryId = this.searchHistory.length > 0 ? this.searchHistory[0].id : null;
      }
      
      // Call the original refresh method
      if (originalRefreshDashboard) {
        originalRefreshDashboard.call(this);
      } else {
        console.warn('Original _refreshDashboard method not found');
        this._loadData();
      }
    };

    // After data is loaded, update the result count in search history
    const originalLoadData = dashboard._loadData;
    if (originalLoadData) {
      dashboard._loadData = function() {
        originalLoadData.call(this);
        
        // After loading data, update result count in history if needed
        if (this.currentHistoryId && this.totalEntries !== undefined) {
          this._updateHistoryResultCount(this.currentHistoryId, this.totalEntries);
          this.currentHistoryId = null;
        }
      };
    }

    // Initialize searchCriteria if not present
    if (!dashboard.searchCriteria) {
      dashboard.searchCriteria = {};
    }

    console.info('Enhanced search integration successful');
    return true;
  } catch (error) {
    console.error('Enhanced search integration failed:', error);
    return false;
  }
}

/**
 * Load saved searches from localStorage
 * 
 * @returns {Array} The saved searches
 */
function loadSavedSearches() {
  try {
    const savedData = localStorage.getItem('pyarrow_saved_searches');
    return savedData ? JSON.parse(savedData) : [];
  } catch (error) {
    console.error('Failed to load saved searches:', error);
    return [];
  }
}

/**
 * Save saved searches to localStorage
 * 
 * @param {Array} searches - The saved searches to store
 */
function saveSavedSearches(searches) {
  try {
    localStorage.setItem('pyarrow_saved_searches', JSON.stringify(searches));
  } catch (error) {
    console.error('Failed to save searches:', error);
  }
}

/**
 * Load search history from localStorage
 * 
 * @returns {Array} The search history
 */
function loadSearchHistory() {
  try {
    const historyData = localStorage.getItem('pyarrow_search_history');
    return historyData ? JSON.parse(historyData) : [];
  } catch (error) {
    console.error('Failed to load search history:', error);
    return [];
  }
}

/**
 * Save search history to localStorage
 * 
 * @param {Array} history - The search history to store
 */
function saveSearchHistory(history) {
  try {
    localStorage.setItem('pyarrow_search_history', JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save search history:', error);
  }
}

/**
 * Creates a loader script for automatic integration
 * 
 * @returns {string} - The loader script
 */
function createSearchIntegrationLoader() {
  return `
    // Auto-integration script for enhanced search functionality
    (function() {
      try {
        // Wait for dashboard to be initialized
        const checkInterval = setInterval(() => {
          const dashboardInstance = window.contentIndexDashboard;
          if (dashboardInstance && typeof dashboardInstance._renderSearchControls === 'function') {
            clearInterval(checkInterval);
            
            // Load the integration module
            const searchIntegration = require('./enhanced_search/search_integration.js');
            
            // Integrate the enhanced search
            searchIntegration.integrateEnhancedSearch(dashboardInstance);
            
            console.info('Enhanced search functionality loaded');
          }
        }, 500);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
      } catch (error) {
        console.error('Failed to auto-integrate enhanced search:', error);
      }
    })();
  `;
}

/**
 * Initialize the integration manually
 * 
 * @param {string} dashboardSelector - CSS selector for the dashboard element
 * @returns {Promise<boolean>} - Whether the integration was successful
 */
async function initializeSearchIntegration(dashboardSelector = '.pyarrow-content-index-dashboard') {
  return new Promise((resolve) => {
    try {
      // Wait for the dashboard to be available in the DOM
      const checkInterval = setInterval(() => {
        const dashboardElement = document.querySelector(dashboardSelector);
        if (dashboardElement && window.contentIndexDashboard) {
          clearInterval(checkInterval);
          
          // Integrate with the dashboard instance
          const result = integrateEnhancedSearch(window.contentIndexDashboard);
          resolve(result);
        }
      }, 500);
      
      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 10000);
    } catch (error) {
      console.error('Search integration initialization failed:', error);
      resolve(false);
    }
  });
}

// Export the module functions
module.exports = {
  integrateEnhancedSearch,
  createSearchIntegrationLoader,
  initializeSearchIntegration,
  loadSavedSearches,
  saveSavedSearches,
  loadSearchHistory,
  saveSearchHistory
};