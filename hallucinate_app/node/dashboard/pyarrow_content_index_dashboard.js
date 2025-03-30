/**
 * PyArrow Content Index Dashboard
 * 
 * Dashboard panel for visualizing and interacting with the PyArrow Content Index
 * Provides interfaces for searching, browsing, and managing content index entries
 * 
 * @module dashboard/pyarrow_content_index_dashboard
 */

const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

/**
 * Main PyArrow Content Index Dashboard component
 * Provides an interface for the Electron wrapper
 */
class PyArrowContentIndexDashboardComponent extends EventEmitter {
  /**
   * Create a PyArrow Content Index Dashboard
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.element - DOM element to render the dashboard in
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.resources - Resource pool containing dependencies
   * @param {Object} options.config - Configuration options
   */
  constructor(options = {}) {
    this.element = options.element;
    this.eventBus = options.eventBus;
    this.resources = options.resources || {};
    this.config = options.config || {};
    
    // Get PyArrow Index from resource pool
    this.pyarrowIndex = this.resources.pyarrowIndex;
    
    // Default configuration
    this.config = {
      refreshInterval: 30000, // 30 seconds
      pageSize: 10,
      sortField: 'updated_at',
      sortDirection: 'desc',
      ...this.config
    };
    
    // State
    this.currentPage = 1;
    this.currentQuery = '';
    this.currentFilter = {};
    this.totalEntries = 0;
    this.entries = [];
    this.loading = false;
    this.selectedEntry = null;
    this.viewMode = 'list'; // 'list' or 'detail'
    
    // Bind event handlers
    this._bindEvents();
  }
  
  /**
   * Initialize the dashboard panel
   * 
   * @returns {Promise<void>}
   */
  async init() {
    this.loading = true;
    this.render();
    
    try {
      // Verify PyArrow Index access
      if (!this.pyarrowIndex) {
        if (this.resources.pythonBridge) {
          const { PyArrowIndex } = await import('../pyarrow_index.js');
          this.pyarrowIndex = new PyArrowIndex({
            pythonBridge: this.resources.pythonBridge,
            indexPath: this.config.indexPath
          });
          await this.pyarrowIndex.init();
        } else {
          throw new Error('PyArrow Index not available');
        }
      }
      
      // Set up refresh interval
      this._startRefreshInterval();
      
      // Load initial data
      await this._loadData();
    } catch (error) {
      console.error('Failed to initialize PyArrow Content Index Dashboard:', error);
      this._showError('Failed to initialize dashboard', error);
    } finally {
      this.loading = false;
      this.render();
    }
  }
  
  /**
   * Render the dashboard panel
   */
  render() {
    if (!this.element) return;
    
    // Clear the element
    this.element.innerHTML = '';
    
    // Add the dashboard container
    const container = document.createElement('div');
    container.className = 'pyarrow-content-index-dashboard';
    
    // Add the header
    container.appendChild(this._renderHeader());
    
    // Add the search and filter section
    container.appendChild(this._renderSearchControls());
    
    // Add the main content area
    if (this.loading) {
      container.appendChild(this._renderLoading());
    } else if (this.viewMode === 'list') {
      container.appendChild(this._renderList());
    } else if (this.viewMode === 'detail' && this.selectedEntry) {
      container.appendChild(this._renderDetail());
    }
    
    // Add the footer
    container.appendChild(this._renderFooter());
    
    // Append to the main element
    this.element.appendChild(container);
  }
  
  /**
   * Render the dashboard header
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    
    const title = document.createElement('h2');
    title.textContent = 'PyArrow Content Index';
    header.appendChild(title);
    
    const stats = document.createElement('div');
    stats.className = 'dashboard-stats';
    stats.innerHTML = `
      <span class="stat">Total Entries: <strong>${this.totalEntries}</strong></span>
      <span class="stat">Last Update: <strong>${new Date().toLocaleString()}</strong></span>
    `;
    header.appendChild(stats);
    
    return header;
  }
  
  /**
   * Render the search controls
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderSearchControls() {
    const controls = document.createElement('div');
    controls.className = 'dashboard-controls';
    
    // Search box
    const searchBox = document.createElement('div');
    searchBox.className = 'search-box';
    searchBox.innerHTML = `
      <input type="text" id="content-index-search" 
        placeholder="Search by CID, path, or keywords..." 
        value="${this.currentQuery}">
      <button id="content-index-search-btn"><i class="fa fa-search"></i></button>
    `;
    controls.appendChild(searchBox);
    
    // Filter controls
    const filterBox = document.createElement('div');
    filterBox.className = 'filter-box';
    filterBox.innerHTML = `
      <select id="content-index-filter-type">
        <option value="">All Types</option>
        <option value="model">Models</option>
        <option value="dataset">Datasets</option>
        <option value="embedding">Embeddings</option>
        <option value="document">Documents</option>
        <option value="image">Images</option>
        <option value="audio">Audio</option>
        <option value="video">Video</option>
      </select>
      <select id="content-index-sort">
        <option value="updated_at-desc">Latest Updates</option>
        <option value="created_at-desc">Newest First</option>
        <option value="created_at-asc">Oldest First</option>
        <option value="size-desc">Largest Size</option>
        <option value="size-asc">Smallest Size</option>
      </select>
      <button id="content-index-filter-btn">Apply Filters</button>
      <button id="content-index-refresh-btn"><i class="fa fa-refresh"></i></button>
    `;
    controls.appendChild(filterBox);
    
    // Set up event listeners for controls after they're added to the DOM
    setTimeout(() => {
      const searchInput = document.getElementById('content-index-search');
      const searchBtn = document.getElementById('content-index-search-btn');
      const filterBtn = document.getElementById('content-index-filter-btn');
      const refreshBtn = document.getElementById('content-index-refresh-btn');
      
      if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') this._handleSearch();
        });
      }
      
      if (searchBtn) {
        searchBtn.addEventListener('click', () => this._handleSearch());
      }
      
      if (filterBtn) {
        filterBtn.addEventListener('click', () => this._handleFilterChange());
      }
      
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this._handleRefresh());
      }
    }, 0);
    
    return controls;
  }
  
  /**
   * Render the loading spinner
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderLoading() {
    const loading = document.createElement('div');
    loading.className = 'loading-spinner';
    loading.innerHTML = '<div class="spinner"></div><p>Loading content index data...</p>';
    return loading;
  }
  
  /**
   * Render the content list
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderList() {
    const listContainer = document.createElement('div');
    listContainer.className = 'content-list-container';
    
    if (this.entries.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <p>No content index entries found.</p>
        <button id="content-index-add-btn">Add New Entry</button>
      `;
      listContainer.appendChild(emptyState);
      
      // Add event listener for the add button
      setTimeout(() => {
        const addBtn = document.getElementById('content-index-add-btn');
        if (addBtn) {
          addBtn.addEventListener('click', () => this._handleAddEntry());
        }
      }, 0);
      
      return listContainer;
    }
    
    // Create table for entries
    const table = document.createElement('table');
    table.className = 'content-list-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Type</th>
        <th>Path</th>
        <th>CID</th>
        <th>Size</th>
        <th>Updated</th>
        <th>Actions</th>
      </tr>
    `;
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    this.entries.forEach((entry, index) => {
      const row = document.createElement('tr');
      row.dataset.index = index;
      
      // Format size
      const size = entry.size ? this._formatSize(entry.size) : 'N/A';
      
      // Format date
      const updated = entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A';
      
      // Get type icon
      const typeIcon = this._getTypeIcon(entry.mimetype);
      
      row.innerHTML = `
        <td><i class="${typeIcon}"></i> ${entry.mimetype?.split('/')[0] || 'Unknown'}</td>
        <td>${entry.path || 'N/A'}</td>
        <td><span class="cid-display" title="${entry.cid}">${this._shortenCid(entry.cid)}</span></td>
        <td>${size}</td>
        <td>${updated}</td>
        <td>
          <button class="view-btn" data-index="${index}" title="View Details"><i class="fa fa-eye"></i></button>
          <button class="copy-btn" data-cid="${entry.cid}" title="Copy CID"><i class="fa fa-copy"></i></button>
          <button class="download-btn" data-cid="${entry.cid}" title="Download"><i class="fa fa-download"></i></button>
        </td>
      `;
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    listContainer.appendChild(table);
    
    // Add pagination
    if (this.totalEntries > this.config.pageSize) {
      const pagination = document.createElement('div');
      pagination.className = 'pagination';
      
      const totalPages = Math.ceil(this.totalEntries / this.config.pageSize);
      
      pagination.innerHTML = `
        <button id="prev-page-btn" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${this.currentPage} of ${totalPages}</span>
        <button id="next-page-btn" ${this.currentPage === totalPages ? 'disabled' : ''}>Next</button>
      `;
      
      listContainer.appendChild(pagination);
      
      // Add event listeners for pagination
      setTimeout(() => {
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
              this.currentPage--;
              this._loadData();
            }
          });
        }
        
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
              this.currentPage++;
              this._loadData();
            }
          });
        }
      }, 0);
    }
    
    // Add event listeners for row actions
    setTimeout(() => {
      const viewButtons = document.querySelectorAll('.view-btn');
      const copyButtons = document.querySelectorAll('.copy-btn');
      const downloadButtons = document.querySelectorAll('.download-btn');
      
      viewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.closest('.view-btn').dataset.index, 10);
          this._handleViewEntry(index);
        });
      });
      
      copyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.target.closest('.copy-btn').dataset.cid;
          this._handleCopyCid(cid);
        });
      });
      
      downloadButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.target.closest('.download-btn').dataset.cid;
          this._handleDownload(cid);
        });
      });
    }, 0);
    
    return listContainer;
  }
  
  /**
   * Render the detail view for a selected entry
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderDetail() {
    const detailContainer = document.createElement('div');
    detailContainer.className = 'content-detail-container';
    
    if (!this.selectedEntry) {
      return detailContainer;
    }
    
    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.innerHTML = '<i class="fa fa-arrow-left"></i> Back to List';
    backBtn.addEventListener('click', () => {
      this.viewMode = 'list';
      this.selectedEntry = null;
      this.render();
    });
    detailContainer.appendChild(backBtn);
    
    // Entry header
    const header = document.createElement('div');
    header.className = 'detail-header';
    
    const typeIcon = this._getTypeIcon(this.selectedEntry.mimetype);
    
    header.innerHTML = `
      <h3><i class="${typeIcon}"></i> ${this.selectedEntry.path || 'Unnamed Content'}</h3>
      <div class="detail-actions">
        <button id="detail-copy-btn" title="Copy CID"><i class="fa fa-copy"></i> Copy CID</button>
        <button id="detail-download-btn" title="Download"><i class="fa fa-download"></i> Download</button>
        <button id="detail-delete-btn" title="Delete" class="danger-btn"><i class="fa fa-trash"></i> Delete</button>
      </div>
    `;
    detailContainer.appendChild(header);
    
    // Entry details
    const details = document.createElement('div');
    details.className = 'detail-content';
    
    // Basic info
    const basicInfo = document.createElement('div');
    basicInfo.className = 'detail-section';
    basicInfo.innerHTML = `
      <h4>Basic Information</h4>
      <table class="detail-table">
        <tr>
          <th>CID</th>
          <td><code>${this.selectedEntry.cid}</code></td>
        </tr>
        <tr>
          <th>Path</th>
          <td>${this.selectedEntry.path || 'N/A'}</td>
        </tr>
        <tr>
          <th>MIME Type</th>
          <td>${this.selectedEntry.mimetype || 'Unknown'}</td>
        </tr>
        <tr>
          <th>Size</th>
          <td>${this.selectedEntry.size ? this._formatSize(this.selectedEntry.size) : 'N/A'}</td>
        </tr>
        <tr>
          <th>Created</th>
          <td>${this.selectedEntry.created_at ? new Date(this.selectedEntry.created_at).toLocaleString() : 'N/A'}</td>
        </tr>
        <tr>
          <th>Updated</th>
          <td>${this.selectedEntry.updated_at ? new Date(this.selectedEntry.updated_at).toLocaleString() : 'N/A'}</td>
        </tr>
      </table>
    `;
    details.appendChild(basicInfo);
    
    // Hash information
    if (this.selectedEntry.md5 || this.selectedEntry.sha256) {
      const hashInfo = document.createElement('div');
      hashInfo.className = 'detail-section';
      hashInfo.innerHTML = `
        <h4>Hash Information</h4>
        <table class="detail-table">
          ${this.selectedEntry.md5 ? `<tr><th>MD5</th><td><code>${this._bufferToHex(this.selectedEntry.md5)}</code></td></tr>` : ''}
          ${this.selectedEntry.sha256 ? `<tr><th>SHA-256</th><td><code>${this._bufferToHex(this.selectedEntry.sha256)}</code></td></tr>` : ''}
        </table>
      `;
      details.appendChild(hashInfo);
    }
    
    // Storage locations
    if (this.selectedEntry.locations) {
      const locationsInfo = document.createElement('div');
      locationsInfo.className = 'detail-section';
      locationsInfo.innerHTML = '<h4>Storage Locations</h4>';
      
      const locationsTable = document.createElement('table');
      locationsTable.className = 'detail-table';
      
      // Filecoin
      if (this.selectedEntry.locations.filecoin?.length) {
        const filecoinRow = document.createElement('tr');
        filecoinRow.innerHTML = `
          <th>Filecoin</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.filecoin.map(loc => `<li>${loc}</li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(filecoinRow);
      }
      
      // Storacha
      if (this.selectedEntry.locations.storacha) {
        const storachaRow = document.createElement('tr');
        storachaRow.innerHTML = `
          <th>Storacha W3UP</th>
          <td>${this.selectedEntry.locations.storacha}</td>
        `;
        locationsTable.appendChild(storachaRow);
      }
      
      // libp2p
      if (this.selectedEntry.locations.libp2p?.length) {
        const libp2pRow = document.createElement('tr');
        libp2pRow.innerHTML = `
          <th>libp2p Peers</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.libp2p.map(loc => `<li>${loc}</li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(libp2pRow);
      }
      
      // IPFS
      if (this.selectedEntry.locations.ipfs?.length) {
        const ipfsRow = document.createElement('tr');
        ipfsRow.innerHTML = `
          <th>IPFS Gateways</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.ipfs.map(loc => `<li><a href="${loc}/ipfs/${this.selectedEntry.cid}" target="_blank">${loc}</a></li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(ipfsRow);
      }
      
      // IPFS Cluster
      if (this.selectedEntry.locations.ipfs_cluster?.length) {
        const ipfsClusterRow = document.createElement('tr');
        ipfsClusterRow.innerHTML = `
          <th>IPFS Cluster</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.ipfs_cluster.map(loc => `<li>${loc}</li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(ipfsClusterRow);
      }
      
      // S3
      if (this.selectedEntry.locations.s3?.bucket) {
        const s3Row = document.createElement('tr');
        s3Row.innerHTML = `
          <th>S3</th>
          <td>
            <table class="nested-table">
              <tr><th>Bucket</th><td>${this.selectedEntry.locations.s3.bucket}</td></tr>
              <tr><th>Key</th><td>${this.selectedEntry.locations.s3.key}</td></tr>
              <tr><th>Region</th><td>${this.selectedEntry.locations.s3.region || 'N/A'}</td></tr>
              <tr><th>Endpoint</th><td>${this.selectedEntry.locations.s3.endpoint || 'N/A'}</td></tr>
            </table>
          </td>
        `;
        locationsTable.appendChild(s3Row);
      }
      
      // Hugging Face
      if (this.selectedEntry.locations.huggingface?.repo_id) {
        const hfRow = document.createElement('tr');
        hfRow.innerHTML = `
          <th>Hugging Face</th>
          <td>
            <table class="nested-table">
              <tr><th>Repository</th><td>${this.selectedEntry.locations.huggingface.repo_id}</td></tr>
              <tr><th>Path</th><td>${this.selectedEntry.locations.huggingface.path}</td></tr>
              <tr><th>Revision</th><td>${this.selectedEntry.locations.huggingface.revision || 'main'}</td></tr>
            </table>
          </td>
        `;
        locationsTable.appendChild(hfRow);
      }
      
      locationsInfo.appendChild(locationsTable);
      details.appendChild(locationsInfo);
    }
    
    // Custom metadata
    if (this.selectedEntry.metadata) {
      const metadataSection = document.createElement('div');
      metadataSection.className = 'detail-section';
      metadataSection.innerHTML = '<h4>Custom Metadata</h4>';
      
      const metadataTable = document.createElement('table');
      metadataTable.className = 'detail-table';
      
      Object.entries(this.selectedEntry.metadata).forEach(([key, value]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <th>${key}</th>
          <td>${typeof value === 'object' ? '<pre>' + JSON.stringify(value, null, 2) + '</pre>' : value}</td>
        `;
        metadataTable.appendChild(row);
      });
      
      metadataSection.appendChild(metadataTable);
      details.appendChild(metadataSection);
    }
    
    detailContainer.appendChild(details);
    
    // Add event listeners
    setTimeout(() => {
      const copyBtn = document.getElementById('detail-copy-btn');
      const downloadBtn = document.getElementById('detail-download-btn');
      const deleteBtn = document.getElementById('detail-delete-btn');
      
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          this._handleCopyCid(this.selectedEntry.cid);
        });
      }
      
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          this._handleDownload(this.selectedEntry.cid);
        });
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          this._handleDeleteEntry(this.selectedEntry.cid);
        });
      }
    }, 0);
    
    return detailContainer;
  }
  
  /**
   * Render the dashboard footer
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    
    footer.innerHTML = `
      <button id="content-index-add-btn" class="primary-btn">
        <i class="fa fa-plus"></i> Add New Entry
      </button>
      <button id="content-index-export-btn">
        <i class="fa fa-download"></i> Export Index
      </button>
      <button id="content-index-import-btn">
        <i class="fa fa-upload"></i> Import Index
      </button>
    `;
    
    // Add event listeners
    setTimeout(() => {
      const addBtn = document.getElementById('content-index-add-btn');
      const exportBtn = document.getElementById('content-index-export-btn');
      const importBtn = document.getElementById('content-index-import-btn');
      
      if (addBtn) {
        addBtn.addEventListener('click', () => this._handleAddEntry());
      }
      
      if (exportBtn) {
        exportBtn.addEventListener('click', () => this._handleExportIndex());
      }
      
      if (importBtn) {
        importBtn.addEventListener('click', () => this._handleImportIndex());
      }
    }, 0);
    
    return footer;
  }
  
  /**
   * Show an error message
   * 
   * @param {string} message - Error message
   * @param {Error} error - Error object
   * @private
   */
  _showError(message, error) {
    console.error(message, error);
    
    if (!this.element) return;
    
    const errorElem = document.createElement('div');
    errorElem.className = 'error-notification';
    errorElem.innerHTML = `
      <span class="error-icon"><i class="fa fa-exclamation-triangle"></i></span>
      <span class="error-message">${message}</span>
      <button class="error-close"><i class="fa fa-times"></i></button>
    `;
    
    this.element.appendChild(errorElem);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (errorElem.parentNode) {
        errorElem.parentNode.removeChild(errorElem);
      }
    }, 5000);
    
    // Add event listener for close button
    const closeBtn = errorElem.querySelector('.error-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        errorElem.parentNode.removeChild(errorElem);
      });
    }
    
    // Report to eventBus if available
    if (this.eventBus) {
      this.eventBus.emit('error', {
        source: 'PyArrow Content Index Dashboard',
        message,
        error
      });
    }
  }
  
  /**
   * Show a success notification
   * 
   * @param {string} message - Success message
   * @private
   */
  _showSuccess(message) {
    if (!this.element) return;
    
    const successElem = document.createElement('div');
    successElem.className = 'success-notification';
    successElem.innerHTML = `
      <span class="success-icon"><i class="fa fa-check-circle"></i></span>
      <span class="success-message">${message}</span>
      <button class="success-close"><i class="fa fa-times"></i></button>
    `;
    
    this.element.appendChild(successElem);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      if (successElem.parentNode) {
        successElem.parentNode.removeChild(successElem);
      }
    }, 3000);
    
    // Add event listener for close button
    const closeBtn = successElem.querySelector('.success-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        successElem.parentNode.removeChild(successElem);
      });
    }
  }
  
  /**
   * Bind event handlers
   * 
   * @private
   */
  _bindEvents() {
    // Listen for global events if eventBus is available
    if (this.eventBus) {
      // Listen for content index update events
      this.eventBus.on('content-index-updated', () => {
        this._loadData();
      });
      
      // Listen for new entry added events
      this.eventBus.on('content-index-entry-added', (entry) => {
        this._showSuccess(`New entry added: ${entry.path || entry.cid}`);
        this._loadData();
      });
      
      // Listen for entry deleted events
      this.eventBus.on('content-index-entry-deleted', (cid) => {
        this._showSuccess(`Entry deleted: ${cid}`);
        if (this.selectedEntry && this.selectedEntry.cid === cid) {
          this.selectedEntry = null;
          this.viewMode = 'list';
        }
        this._loadData();
      });
    }
  }
  
  /**
   * Start the refresh interval
   * 
   * @private
   */
  _startRefreshInterval() {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Set up new interval
    if (this.config.refreshInterval > 0) {
      this.refreshInterval = setInterval(() => {
        this._loadData();
      }, this.config.refreshInterval);
    }
  }
  
  /**
   * Load data from the PyArrow Content Index
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _loadData() {
    if (!this.pyarrowIndex) return;
    
    this.loading = true;
    if (this.viewMode === 'list') {
      this.render();
    }
    
    try {
      // Build query options
      const options = {
        offset: (this.currentPage - 1) * this.config.pageSize,
        limit: this.config.pageSize,
        sort: this.config.sortField,
        sortDirection: this.config.sortDirection
      };
      
      // Add filter if present
      if (Object.keys(this.currentFilter).length > 0) {
        options.filter = this.currentFilter;
      }
      
      // Add search query if present
      if (this.currentQuery) {
        options.query = this.currentQuery;
      }
      
      // Query the index
      const result = await this.pyarrowIndex.query(options);
      
      this.entries = result.entries || [];
      this.totalEntries = result.total || 0;
      
      // If in detail view, refresh the selected entry
      if (this.viewMode === 'detail' && this.selectedEntry) {
        const updatedEntry = await this.pyarrowIndex.lookupByCid(this.selectedEntry.cid);
        if (updatedEntry) {
          this.selectedEntry = updatedEntry;
        }
      }
    } catch (error) {
      console.error('Failed to load content index data:', error);
      this._showError('Failed to load content index data', error);
      this.entries = [];
      this.totalEntries = 0;
    } finally {
      this.loading = false;
      this.render();
    }
  }
  
  /**
   * Handle search
   * 
   * @private
   */
  _handleSearch() {
    const searchInput = document.getElementById('content-index-search');
    if (!searchInput) return;
    
    this.currentQuery = searchInput.value.trim();
    this.currentPage = 1;
    this._loadData();
  }
  
  /**
   * Handle filter change
   * 
   * @private
   */
  _handleFilterChange() {
    const typeSelect = document.getElementById('content-index-filter-type');
    const sortSelect = document.getElementById('content-index-sort');
    
    if (!typeSelect || !sortSelect) return;
    
    const type = typeSelect.value;
    const sortValue = sortSelect.value;
    
    // Update filter
    this.currentFilter = {};
    if (type) {
      this.currentFilter.type = type;
    }
    
    // Update sort
    if (sortValue) {
      const [field, direction] = sortValue.split('-');
      this.config.sortField = field;
      this.config.sortDirection = direction;
    }
    
    this.currentPage = 1;
    this._loadData();
  }
  
  /**
   * Handle refresh
   * 
   * @private
   */
  _handleRefresh() {
    this._loadData();
  }
  
  /**
   * Handle view entry
   * 
   * @param {number} index - Index of the entry to view
   * @private
   */
  _handleViewEntry(index) {
    if (index >= 0 && index < this.entries.length) {
      this.selectedEntry = this.entries[index];
      this.viewMode = 'detail';
      this.render();
    }
  }
  
  /**
   * Handle copying a CID to clipboard
   * 
   * @param {string} cid - CID to copy
   * @private
   */
  _handleCopyCid(cid) {
    if (!cid) return;
    
    try {
      // Copy to clipboard
      navigator.clipboard.writeText(cid)
        .then(() => {
          this._showSuccess('CID copied to clipboard');
        })
        .catch((error) => {
          console.error('Failed to copy CID:', error);
          this._showError('Failed to copy CID', error);
        });
    } catch (error) {
      console.error('Failed to copy CID:', error);
      this._showError('Failed to copy CID', error);
      
      // Fallback method
      const tempInput = document.createElement('input');
      tempInput.value = cid;
      document.body.appendChild(tempInput);
      tempInput.select();
      
      try {
        const success = document.execCommand('copy');
        if (success) {
          this._showSuccess('CID copied to clipboard');
        } else {
          this._showError('Failed to copy CID', new Error('execCommand returned false'));
        }
      } catch (execError) {
        this._showError('Failed to copy CID', execError);
      } finally {
        document.body.removeChild(tempInput);
      }
    }
  }
  
  /**
   * Handle downloading content
   * 
   * @param {string} cid - CID to download
   * @private
   */
  async _handleDownload(cid) {
    if (!cid || !this.pyarrowIndex) return;
    
    try {
      // Show loading state
      this._showSuccess('Starting download...');
      
      // Get entry details
      const entry = await this.pyarrowIndex.lookupByCid(cid);
      if (!entry) {
        throw new Error(`Entry with CID ${cid} not found`);
      }
      
      // Trigger download through IPFS Kit
      const result = await this.pyarrowIndex.download(cid, {
        // Optional download location
        destination: this.config.downloadFolder
      });
      
      if (result.success) {
        this._showSuccess(`Downloaded to: ${result.path}`);
        
        // If result contains a file URL, open it
        if (result.url) {
          window.open(result.url, '_blank');
        }
      } else {
        throw new Error(result.error || 'Unknown download error');
      }
    } catch (error) {
      console.error('Failed to download content:', error);
      this._showError('Failed to download content', error);
    }
  }
  
  /**
   * Handle adding a new entry
   * 
   * @private
   */
  _handleAddEntry() {
    // Create modal for adding new entry
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add New Content Index Entry</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="add-entry-form">
            <div class="form-group">
              <label for="entry-cid">CID (required)</label>
              <input type="text" id="entry-cid" required placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi">
            </div>
            <div class="form-group">
              <label for="entry-path">Path</label>
              <input type="text" id="entry-path" placeholder="/datasets/common_voice/en/train.parquet">
            </div>
            <div class="form-group">
              <label for="entry-mimetype">MIME Type</label>
              <input type="text" id="entry-mimetype" placeholder="application/octet-stream">
            </div>
            <div class="form-group">
              <label for="entry-size">Size (bytes)</label>
              <input type="number" id="entry-size" placeholder="1024">
            </div>
            <div class="form-group">
              <label for="entry-locations">Storage Locations (JSON)</label>
              <textarea id="entry-locations" rows="5" placeholder='{
  "ipfs": ["https://ipfs.io", "https://dweb.link"],
  "huggingface": {
    "repo_id": "username/repo",
    "path": "file.bin",
    "revision": "main"
  }
}'></textarea>
            </div>
            <div class="form-group">
              <label for="entry-metadata">Custom Metadata (JSON)</label>
              <textarea id="entry-metadata" rows="5" placeholder='{
  "description": "My dataset",
  "tags": ["audio", "speech"],
  "language": "en"
}'></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="secondary-btn">Cancel</button>
          <button id="modal-submit" class="primary-btn">Add Entry</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeButton = modal.querySelector('.modal-close');
    const cancelButton = document.getElementById('modal-cancel');
    const submitButton = document.getElementById('modal-submit');
    const form = document.getElementById('add-entry-form');
    
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);
    
    if (submitButton && form) {
      submitButton.addEventListener('click', async () => {
        // Get form values
        const cid = document.getElementById('entry-cid')?.value?.trim();
        const path = document.getElementById('entry-path')?.value?.trim();
        const mimetype = document.getElementById('entry-mimetype')?.value?.trim();
        const sizeStr = document.getElementById('entry-size')?.value?.trim();
        const locationsJson = document.getElementById('entry-locations')?.value?.trim();
        const metadataJson = document.getElementById('entry-metadata')?.value?.trim();
        
        // Validate CID
        if (!cid) {
          this._showError('CID is required', new Error('Missing required field'));
          return;
        }
        
        try {
          // Parse JSON fields
          const entry = {
            cid,
            path: path || null,
            mimetype: mimetype || null,
            size: sizeStr ? parseInt(sizeStr, 10) : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // Add locations if provided
          if (locationsJson) {
            try {
              entry.locations = JSON.parse(locationsJson);
            } catch (jsonError) {
              this._showError('Invalid JSON in locations field', jsonError);
              return;
            }
          }
          
          // Add metadata if provided
          if (metadataJson) {
            try {
              entry.metadata = JSON.parse(metadataJson);
            } catch (jsonError) {
              this._showError('Invalid JSON in metadata field', jsonError);
              return;
            }
          }
          
          // Add the entry
          const result = await this.pyarrowIndex.addEntry(entry);
          
          if (result.success) {
            this._showSuccess('Entry added successfully');
            closeModal();
            
            // Notify event bus if available
            if (this.eventBus) {
              this.eventBus.emit('content-index-entry-added', entry);
            }
            
            // Reload data
            this._loadData();
          } else {
            throw new Error(result.error || 'Failed to add entry');
          }
        } catch (error) {
          console.error('Failed to add entry:', error);
          this._showError('Failed to add entry', error);
        }
      });
    }
  }
  
  /**
   * Handle deleting an entry
   * 
   * @param {string} cid - CID of the entry to delete
   * @private
   */
  _handleDeleteEntry(cid) {
    if (!cid || !this.pyarrowIndex) return;
    
    // Confirm deletion
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal';
    confirmModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Confirm Deletion</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete the entry with CID:</p>
          <code>${cid}</code>
          <p>This action cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="secondary-btn">Cancel</button>
          <button id="modal-confirm" class="danger-btn">Delete</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(confirmModal);
    
    // Add event listeners
    const closeButton = confirmModal.querySelector('.modal-close');
    const cancelButton = document.getElementById('modal-cancel');
    const confirmButton = document.getElementById('modal-confirm');
    
    const closeModal = () => {
      document.body.removeChild(confirmModal);
    };
    
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);
    
    if (confirmButton) {
      confirmButton.addEventListener('click', async () => {
        try {
          // Delete the entry
          const result = await this.pyarrowIndex.deleteEntry(cid);
          
          if (result.success) {
            this._showSuccess('Entry deleted successfully');
            closeModal();
            
            // Return to list view if currently viewing the deleted entry
            if (this.viewMode === 'detail' && this.selectedEntry && this.selectedEntry.cid === cid) {
              this.viewMode = 'list';
              this.selectedEntry = null;
            }
            
            // Notify event bus if available
            if (this.eventBus) {
              this.eventBus.emit('content-index-entry-deleted', cid);
            }
            
            // Reload data
            this._loadData();
          } else {
            throw new Error(result.error || 'Failed to delete entry');
          }
        } catch (error) {
          console.error('Failed to delete entry:', error);
          this._showError('Failed to delete entry', error);
        }
      });
    }
  }
  
  /**
   * Handle exporting the index
   * 
   * @private
   */
  async _handleExportIndex() {
    if (!this.pyarrowIndex) return;
    
    try {
      // Show loading notification
      this._showSuccess('Exporting index...');
      
      // Export the index
      const result = await this.pyarrowIndex.exportToParquet({
        path: this.config.exportPath || null,
        includeTimestamp: true
      });
      
      if (result.success) {
        this._showSuccess(`Index exported to: ${result.path}`);
        
        // If result contains a download URL, trigger download
        if (result.url) {
          const link = document.createElement('a');
          link.href = result.url;
          link.download = result.filename || 'content_index.parquet';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else {
        throw new Error(result.error || 'Failed to export index');
      }
    } catch (error) {
      console.error('Failed to export index:', error);
      this._showError('Failed to export index', error);
    }
  }
  
  /**
   * Handle importing an index
   * 
   * @private
   */
  _handleImportIndex() {
    if (!this.pyarrowIndex) return;
    
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.parquet,.arrow';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // Handle file selection
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        // Show loading notification
        this._showSuccess('Importing index...');
        
        // Import the index
        const result = await this.pyarrowIndex.importFromParquet({
          file: file,
          merge: true // Merge with existing index
        });
        
        if (result.success) {
          this._showSuccess(`Index imported successfully: ${result.count} entries`);
          
          // Reload data
          this._loadData();
          
          // Notify event bus if available
          if (this.eventBus) {
            this.eventBus.emit('content-index-updated');
          }
        } else {
          throw new Error(result.error || 'Failed to import index');
        }
      } catch (error) {
        console.error('Failed to import index:', error);
        this._showError('Failed to import index', error);
      } finally {
        // Remove the file input
        document.body.removeChild(fileInput);
      }
    });
    
    // Trigger file selection
    fileInput.click();
  }
  
  /**
   * Format file size in human-readable format
   * 
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Shorten a CID for display
   * 
   * @param {string} cid - CID to shorten
   * @returns {string} Shortened CID
   * @private
   */
  _shortenCid(cid) {
    if (!cid) return '';
    if (cid.length <= 16) return cid;
    
    return cid.substring(0, 8) + '...' + cid.substring(cid.length - 8);
  }
  
  /**
   * Get an icon for a given MIME type
   * 
   * @param {string} mimetype - MIME type
   * @returns {string} CSS class for the icon
   * @private
   */
  _getTypeIcon(mimetype) {
    if (!mimetype) return 'fa fa-file-o';
    
    const type = mimetype.split('/')[0];
    const subtype = mimetype.split('/')[1];
    
    switch (type) {
      case 'image':
        return 'fa fa-file-image-o';
      case 'video':
        return 'fa fa-file-video-o';
      case 'audio':
        return 'fa fa-file-audio-o';
      case 'text':
        if (subtype === 'csv') return 'fa fa-file-excel-o';
        if (subtype === 'html') return 'fa fa-file-code-o';
        return 'fa fa-file-text-o';
      case 'application':
        if (subtype === 'pdf') return 'fa fa-file-pdf-o';
        if (subtype === 'json') return 'fa fa-file-code-o';
        if (subtype.includes('javascript')) return 'fa fa-file-code-o';
        if (subtype.includes('zip') || subtype.includes('compressed')) return 'fa fa-file-archive-o';
        return 'fa fa-file-o';
      default:
        return 'fa fa-file-o';
    }
  }
  
  /**
   * Convert a binary buffer to hexadecimal string
   * 
   * @param {Buffer|Uint8Array} buffer - Binary buffer
   * @returns {string} Hexadecimal string
   * @private
   */
  _bufferToHex(buffer) {
    if (!buffer) return '';
    
    // Convert ArrayBuffer to Uint8Array if needed
    const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    
    // Convert to hex
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Electron wrapper for PyArrow Content Index Dashboard
 * Provides a window and IPC communication for the dashboard component
 */
class PyArrowContentIndexDashboard {
  /**
   * Create a new PyArrow Content Index Dashboard
   * @param {Object} options Dashboard options
   */
  constructor(options = {}) {
    this.options = {
      indexPath: options.indexPath || path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow'),
      mainWindow: options.mainWindow || null,
      refreshInterval: options.refreshInterval || 10000, // ms
      autoOpen: options.autoOpen || false,
      ...options
    };
    
    this.window = null;
    this.autoRefreshTimer = null;
    this.pyarrowIndex = null;
    
    // Set up IPC handlers
    this._setupIpcHandlers();
    
    // Auto-open if configured
    if (this.options.autoOpen) {
      this.openDashboard();
    }
  }
  
  /**
   * Set up IPC handlers for communication with renderer processes
   * @private
   */
  _setupIpcHandlers() {
    // Handle display-content-index-dashboard event from renderer
    ipcMain.on('display-content-index-dashboard', (event, data) => {
      this.openDashboard(data);
    });
    
    // Handle content-index-search from renderer
    ipcMain.on('content-index-search', async (event, query) => {
      try {
        const result = await this._doSearch(query);
        event.reply('content-index-search-result', result);
      } catch (error) {
        console.error('Error searching content index:', error);
        event.reply('content-index-search-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle content-index-view-details from renderer
    ipcMain.on('content-index-view-details', async (event, cid) => {
      try {
        const entry = await this._getEntryByCid(cid);
        event.reply('content-index-entry-details', entry);
      } catch (error) {
        console.error('Error getting entry details:', error);
        event.reply('content-index-entry-error', {
          error: error.message || String(error),
          cid
        });
      }
    });
    
    // Handle content-index-add-entry from renderer
    ipcMain.on('content-index-add-entry', async (event, entry) => {
      try {
        const result = await this._addEntry(entry);
        event.reply('content-index-add-result', result);
      } catch (error) {
        console.error('Error adding entry:', error);
        event.reply('content-index-add-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle content-index-delete-entry from renderer
    ipcMain.on('content-index-delete-entry', async (event, cid) => {
      try {
        const result = await this._deleteEntry(cid);
        event.reply('content-index-delete-result', result);
      } catch (error) {
        console.error('Error deleting entry:', error);
        event.reply('content-index-delete-error', {
          error: error.message || String(error),
          cid
        });
      }
    });
    
    // Handle content-index-export from renderer
    ipcMain.on('content-index-export', async (event, exportOptions) => {
      try {
        const result = await this._exportIndex(exportOptions);
        event.reply('content-index-export-result', result);
      } catch (error) {
        console.error('Error exporting index:', error);
        event.reply('content-index-export-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle content-index-import from renderer
    ipcMain.on('content-index-import', async (event, importOptions) => {
      try {
        const result = await this._importIndex(importOptions);
        event.reply('content-index-import-result', result);
      } catch (error) {
        console.error('Error importing index:', error);
        event.reply('content-index-import-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle close-dashboard from renderer
    ipcMain.on('close-content-index-dashboard', (event) => {
      this.closeDashboard();
    });
  }
  
  /**
   * Perform search on content index
   * @private
   * @param {Object} query Query parameters
   * @returns {Promise<Object>} Search results
   */
  async _doSearch(query) {
    // This would use the PyArrow index in a real implementation
    // For now, it returns mock data
    return {
      entries: Array(10).fill(0).map((_, i) => ({
        cid: `bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzd${i}`,
        path: `/datasets/sample/file_${i}.bin`,
        mimetype: i % 2 === 0 ? 'application/octet-stream' : 'text/plain',
        size: 1024 * (i + 1),
        created_at: new Date(Date.now() - 86400000 * i).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * i).toISOString()
      })),
      total: 42
    };
  }
  
  /**
   * Get entry by CID
   * @private
   * @param {string} cid Content ID
   * @returns {Promise<Object>} Entry details
   */
  async _getEntryByCid(cid) {
    // This would use the PyArrow index in a real implementation
    // For now, it returns mock data
    return {
      cid,
      path: `/datasets/sample/file_${cid.slice(-1)}.bin`,
      mimetype: 'application/octet-stream',
      size: 1024 * 10,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      locations: {
        ipfs: ['https://ipfs.io', 'https://dweb.link'],
        huggingface: {
          repo_id: 'username/repo',
          path: 'file.bin',
          revision: 'main'
        }
      },
      metadata: {
        description: 'Sample dataset',
        tags: ['sample', 'test'],
        created_by: 'PyArrow Content Index Dashboard'
      }
    };
  }
  
  /**
   * Add entry to content index
   * @private
   * @param {Object} entry Entry to add
   * @returns {Promise<Object>} Result
   */
  async _addEntry(entry) {
    // This would use the PyArrow index in a real implementation
    console.log('Adding entry:', entry);
    return { success: true };
  }
  
  /**
   * Delete entry from content index
   * @private
   * @param {string} cid Content ID to delete
   * @returns {Promise<Object>} Result
   */
  async _deleteEntry(cid) {
    // This would use the PyArrow index in a real implementation
    console.log('Deleting entry:', cid);
    return { success: true };
  }
  
  /**
   * Export content index
   * @private
   * @param {Object} options Export options
   * @returns {Promise<Object>} Result
   */
  async _exportIndex(options) {
    // This would use the PyArrow index in a real implementation
    console.log('Exporting index:', options);
    const exportPath = options.path || path.join(os.homedir(), '.hallucinate_app', 'exports', `content_index_${Date.now()}.parquet`);
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
    
    // Create empty file for mock
    fs.writeFileSync(exportPath, 'MOCK EXPORT');
    
    return { 
      success: true,
      path: exportPath
    };
  }
  
  /**
   * Import content index
   * @private
   * @param {Object} options Import options
   * @returns {Promise<Object>} Result
   */
  async _importIndex(options) {
    // This would use the PyArrow index in a real implementation
    console.log('Importing index:', options);
    return { 
      success: true,
      count: 42
    };
  }
  
  /**
   * Open the content index dashboard
   * @param {Object} data Optional data to initialize the dashboard with
   */
  openDashboard(data = null) {
    // If already open, just focus the window
    if (this.window) {
      this.window.focus();
      return;
    }
    
    // Create the dashboard window
    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'PyArrow Content Index Dashboard',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Create the HTML file for the dashboard
    this._createDashboardHtml();
    
    // Load the dashboard HTML
    this.window.loadFile(path.join(__dirname, 'pyarrow_content_index_dashboard.html'));
    
    // Handle window closed
    this.window.on('closed', () => {
      this.window = null;
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    });
    
    // When content is loaded, send initial data
    this.window.webContents.on('did-finish-load', () => {
      // Send initial config
      this.window.webContents.send('init-content-index-dashboard', {
        config: {
          indexPath: this.options.indexPath,
          refreshInterval: this.options.refreshInterval
        },
        ...data
      });
      
      // Set up auto-refresh timer
      if (this.options.refreshInterval > 0) {
        this.autoRefreshTimer = setInterval(() => {
          this.refreshData();
        }, this.options.refreshInterval);
      }
    });
  }
  
  /**
   * Create HTML file for the dashboard
   * @private
   */
  _createDashboardHtml() {
    const htmlPath = path.join(__dirname, 'pyarrow_content_index_dashboard.html');
    const cssPath = path.join(__dirname, 'pyarrow_content_index_dashboard.css');
    
    // Get the CSS content
    let cssContent = '';
    try {
      cssContent = fs.readFileSync(cssPath, 'utf8');
    } catch (error) {
      console.error('Error reading CSS file:', error);
    }
    
    // Create HTML content
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PyArrow Content Index Dashboard</title>
  <style>${cssContent}</style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
</head>
<body>
  <div id="dashboard-container"></div>
  
  <script>
    // Renderer script
    const { ipcRenderer } = require('electron');
    
    // Dashboard state
    let config = {
      indexPath: '',
      refreshInterval: 10000,
      pageSize: 10,
      sortField: 'updated_at',
      sortDirection: 'desc'
    };
    let currentPage = 1;
    let currentQuery = '';
    let currentFilter = {};
    let totalEntries = 0;
    let entries = [];
    let loading = true;
    let selectedEntry = null;
    let viewMode = 'list'; // 'list' or 'detail'
    
    // Initialize dashboard when config is received
    ipcRenderer.on('init-content-index-dashboard', (event, data) => {
      config = { ...config, ...data.config };
      renderDashboard();
      loadData();
    });
    
    // Handle search results
    ipcRenderer.on('content-index-search-result', (event, result) => {
      entries = result.entries || [];
      totalEntries = result.total || 0;
      loading = false;
      renderDashboard();
    });
    
    // Handle search errors
    ipcRenderer.on('content-index-search-error', (event, error) => {
      showError('Search failed', new Error(error.error));
      loading = false;
      renderDashboard();
    });
    
    // Handle entry details
    ipcRenderer.on('content-index-entry-details', (event, entry) => {
      selectedEntry = entry;
      viewMode = 'detail';
      renderDashboard();
    });
    
    // Handle entry errors
    ipcRenderer.on('content-index-entry-error', (event, error) => {
      showError('Failed to get entry details', new Error(error.error));
    });
    
    // Handle add results
    ipcRenderer.on('content-index-add-result', (event, result) => {
      if (result.success) {
        showSuccess('Entry added successfully');
        loadData();
      } else {
        showError('Failed to add entry', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Handle delete results
    ipcRenderer.on('content-index-delete-result', (event, result) => {
      if (result.success) {
        showSuccess('Entry deleted successfully');
        if (viewMode === 'detail') {
          viewMode = 'list';
          selectedEntry = null;
        }
        loadData();
      } else {
        showError('Failed to delete entry', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Handle export results
    ipcRenderer.on('content-index-export-result', (event, result) => {
      if (result.success) {
        showSuccess(\`Index exported to: \${result.path}\`);
      } else {
        showError('Failed to export index', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Handle import results
    ipcRenderer.on('content-index-import-result', (event, result) => {
      if (result.success) {
        showSuccess(\`Index imported successfully: \${result.count} entries\`);
        loadData();
      } else {
        showError('Failed to import index', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Load data from the backend
    function loadData() {
      loading = true;
      renderDashboard();
      
      // Build query options
      const options = {
        offset: (currentPage - 1) * config.pageSize,
        limit: config.pageSize,
        sort: config.sortField,
        sortDirection: config.sortDirection
      };
      
      // Add filter if present
      if (Object.keys(currentFilter).length > 0) {
        options.filter = currentFilter;
      }
      
      // Add search query if present
      if (currentQuery) {
        options.query = currentQuery;
      }
      
      // Send search request to main process
      ipcRenderer.send('content-index-search', options);
    }
    
    // View entry details
    function viewEntry(index) {
      if (index >= 0 && index < entries.length) {
        const cid = entries[index].cid;
        ipcRenderer.send('content-index-view-details', cid);
      }
    }
    
    // Add a new entry
    function addEntry(entry) {
      ipcRenderer.send('content-index-add-entry', entry);
    }
    
    // Delete an entry
    function deleteEntry(cid) {
      ipcRenderer.send('content-index-delete-entry', cid);
    }
    
    // Export the index
    function exportIndex(options) {
      ipcRenderer.send('content-index-export', options);
    }
    
    // Import an index
    function importIndex(options) {
      ipcRenderer.send('content-index-import', options);
    }
    
    // Handle search
    function handleSearch() {
      const searchInput = document.getElementById('content-index-search');
      if (!searchInput) return;
      
      currentQuery = searchInput.value.trim();
      currentPage = 1;
      loadData();
    }
    
    // Handle filter change
    function handleFilterChange() {
      const typeSelect = document.getElementById('content-index-filter-type');
      const sortSelect = document.getElementById('content-index-sort');
      
      if (!typeSelect || !sortSelect) return;
      
      const type = typeSelect.value;
      const sortValue = sortSelect.value;
      
      // Update filter
      currentFilter = {};
      if (type) {
        currentFilter.type = type;
      }
      
      // Update sort
      if (sortValue) {
        const [field, direction] = sortValue.split('-');
        config.sortField = field;
        config.sortDirection = direction;
      }
      
      currentPage = 1;
      loadData();
    }
    
    // Handle copy CID
    function handleCopyCid(cid) {
      if (!cid) return;
      
      try {
        navigator.clipboard.writeText(cid)
          .then(() => {
            showSuccess('CID copied to clipboard');
          })
          .catch((error) => {
            console.error('Failed to copy CID:', error);
            showError('Failed to copy CID', error);
          });
      } catch (error) {
        console.error('Failed to copy CID:', error);
        showError('Failed to copy CID', error);
        
        // Fallback method
        const tempInput = document.createElement('input');
        tempInput.value = cid;
        document.body.appendChild(tempInput);
        tempInput.select();
        
        try {
          const success = document.execCommand('copy');
          if (success) {
            showSuccess('CID copied to clipboard');
          } else {
            showError('Failed to copy CID', new Error('execCommand returned false'));
          }
        } catch (execError) {
          showError('Failed to copy CID', execError);
        } finally {
          document.body.removeChild(tempInput);
        }
      }
    }
    
    // Handle download
    function handleDownload(cid) {
      showSuccess('Download feature not implemented in demo');
    }
    
    // Handle add entry modal
    function handleAddEntry() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add New Content Index Entry</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <form id="add-entry-form">
              <div class="form-group">
                <label for="entry-cid">CID (required)</label>
                <input type="text" id="entry-cid" required placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi">
              </div>
              <div class="form-group">
                <label for="entry-path">Path</label>
                <input type="text" id="entry-path" placeholder="/datasets/common_voice/en/train.parquet">
              </div>
              <div class="form-group">
                <label for="entry-mimetype">MIME Type</label>
                <input type="text" id="entry-mimetype" placeholder="application/octet-stream">
              </div>
              <div class="form-group">
                <label for="entry-size">Size (bytes)</label>
                <input type="number" id="entry-size" placeholder="1024">
              </div>
              <div class="form-group">
                <label for="entry-locations">Storage Locations (JSON)</label>
                <textarea id="entry-locations" rows="5" placeholder='{
  "ipfs": ["https://ipfs.io", "https://dweb.link"],
  "huggingface": {
    "repo_id": "username/repo",
    "path": "file.bin",
    "revision": "main"
  }
}'></textarea>
              </div>
              <div class="form-group">
                <label for="entry-metadata">Custom Metadata (JSON)</label>
                <textarea id="entry-metadata" rows="5" placeholder='{
  "description": "My dataset",
  "tags": ["audio", "speech"],
  "language": "en"
}'></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button id="modal-cancel" class="secondary-btn">Cancel</button>
            <button id="modal-submit" class="primary-btn">Add Entry</button>
          </div>
        </div>
      \`;
      
      document.body.appendChild(modal);
      
      // Add event listeners
      const closeButton = modal.querySelector('.modal-close');
      const cancelButton = document.getElementById('modal-cancel');
      const submitButton = document.getElementById('modal-submit');
      const form = document.getElementById('add-entry-form');
      
      const closeModal = () => {
        document.body.removeChild(modal);
      };
      
      if (closeButton) closeButton.addEventListener('click', closeModal);
      if (cancelButton) cancelButton.addEventListener('click', closeModal);
      
      if (submitButton && form) {
        submitButton.addEventListener('click', () => {
          // Get form values
          const cid = document.getElementById('entry-cid')?.value?.trim();
          const path = document.getElementById('entry-path')?.value?.trim();
          const mimetype = document.getElementById('entry-mimetype')?.value?.trim();
          const sizeStr = document.getElementById('entry-size')?.value?.trim();
          const locationsJson = document.getElementById('entry-locations')?.value?.trim();
          const metadataJson = document.getElementById('entry-metadata')?.value?.trim();
          
          // Validate CID
          if (!cid) {
            showError('CID is required', new Error('Missing required field'));
            return;
          }
          
          try {
            // Parse JSON fields
            const entry = {
              cid,
              path: path || null,
              mimetype: mimetype || null,
              size: sizeStr ? parseInt(sizeStr, 10) : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            // Add locations if provided
            if (locationsJson) {
              try {
                entry.locations = JSON.parse(locationsJson);
              } catch (jsonError) {
                showError('Invalid JSON in locations field', jsonError);
                return;
              }
            }
            
            // Add metadata if provided
            if (metadataJson) {
              try {
                entry.metadata = JSON.parse(metadataJson);
              } catch (jsonError) {
                showError('Invalid JSON in metadata field', jsonError);
                return;
              }
            }
            
            // Add the entry
            addEntry(entry);
            closeModal();
          } catch (error) {
            console.error('Failed to add entry:', error);
            showError('Failed to add entry', error);
          }
        });
      }
    }
    
    // Handle delete entry
    function handleDeleteEntry(cid) {
      if (!cid) return;
      
      // Confirm deletion
      const confirmModal = document.createElement('div');
      confirmModal.className = 'modal';
      confirmModal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h3>Confirm Deletion</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete the entry with CID:</p>
            <code>\${cid}</code>
            <p>This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button id="modal-cancel" class="secondary-btn">Cancel</button>
            <button id="modal-confirm" class="danger-btn">Delete</button>
          </div>
        </div>
      \`;
      
      document.body.appendChild(confirmModal);
      
      // Add event listeners
      const closeButton = confirmModal.querySelector('.modal-close');
      const cancelButton = document.getElementById('modal-cancel');
      const confirmButton = document.getElementById('modal-confirm');
      
      const closeModal = () => {
        document.body.removeChild(confirmModal);
      };
      
      if (closeButton) closeButton.addEventListener('click', closeModal);
      if (cancelButton) cancelButton.addEventListener('click', closeModal);
      
      if (confirmButton) {
        confirmButton.addEventListener('click', () => {
          deleteEntry(cid);
          closeModal();
        });
      }
    }
    
    // Handle export index
    function handleExportIndex() {
      exportIndex({
        includeTimestamp: true
      });
    }
    
    // Handle import index
    function handleImportIndex() {
      showSuccess('Import feature not fully implemented in demo');
      importIndex({
        merge: true
      });
    }
    
    // Show an error message
    function showError(message, error) {
      console.error(message, error);
      
      const errorElem = document.createElement('div');
      errorElem.className = 'error-notification';
      errorElem.innerHTML = \`
        <span class="error-icon"><i class="fa fa-exclamation-triangle"></i></span>
        <span class="error-message">\${message}</span>
        <button class="error-close"><i class="fa fa-times"></i></button>
      \`;
      
      document.body.appendChild(errorElem);
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        if (errorElem.parentNode) {
          errorElem.parentNode.removeChild(errorElem);
        }
      }, 5000);
      
      // Add event listener for close button
      const closeBtn = errorElem.querySelector('.error-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          errorElem.parentNode.removeChild(errorElem);
        });
      }
    }
    
    // Show a success notification
    function showSuccess(message) {
      const successElem = document.createElement('div');
      successElem.className = 'success-notification';
      successElem.innerHTML = \`
        <span class="success-icon"><i class="fa fa-check-circle"></i></span>
        <span class="success-message">\${message}</span>
        <button class="success-close"><i class="fa fa-times"></i></button>
      \`;
      
      document.body.appendChild(successElem);
      
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        if (successElem.parentNode) {
          successElem.parentNode.removeChild(successElem);
        }
      }, 3000);
      
      // Add event listener for close button
      const closeBtn = successElem.querySelector('.success-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          successElem.parentNode.removeChild(successElem);
        });
      }
    }
    
    // Format file size
    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      
      return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Shorten CID
    function shortenCid(cid) {
      if (!cid) return '';
      if (cid.length <= 16) return cid;
      
      return cid.substring(0, 8) + '...' + cid.substring(cid.length - 8);
    }
    
    // Get type icon
    function getTypeIcon(mimetype) {
      if (!mimetype) return 'fa fa-file-o';
      
      const type = mimetype.split('/')[0];
      const subtype = mimetype.split('/')[1];
      
      switch (type) {
        case 'image':
          return 'fa fa-file-image-o';
        case 'video':
          return 'fa fa-file-video-o';
        case 'audio':
          return 'fa fa-file-audio-o';
        case 'text':
          if (subtype === 'csv') return 'fa fa-file-excel-o';
          if (subtype === 'html') return 'fa fa-file-code-o';
          return 'fa fa-file-text-o';
        case 'application':
          if (subtype === 'pdf') return 'fa fa-file-pdf-o';
          if (subtype === 'json') return 'fa fa-file-code-o';
          if (subtype.includes('javascript')) return 'fa fa-file-code-o';
          if (subtype.includes('zip') || subtype.includes('compressed')) return 'fa fa-file-archive-o';
          return 'fa fa-file-o';
        default:
          return 'fa fa-file-o';
      }
    }
    
    // Render the dashboard
    function renderDashboard() {
      const container = document.getElementById('dashboard-container');
      if (!container) return;
      
      // Clear container
      container.innerHTML = '';
      
      // Create dashboard
      const dashboard = document.createElement('div');
      dashboard.className = 'pyarrow-content-index-dashboard';
      
      // Header
      const header = document.createElement('div');
      header.className = 'dashboard-header';
      header.innerHTML = \`
        <h2>PyArrow Content Index</h2>
        <div class="dashboard-stats">
          <span class="stat">Total Entries: <strong>\${totalEntries}</strong></span>
          <span class="stat">Last Update: <strong>\${new Date().toLocaleString()}</strong></span>
        </div>
      \`;
      dashboard.appendChild(header);
      
      // Controls
      const controls = document.createElement('div');
      controls.className = 'dashboard-controls';
      controls.innerHTML = \`
        <div class="search-box">
          <input type="text" id="content-index-search" 
            placeholder="Search by CID, path, or keywords..." 
            value="\${currentQuery}">
          <button id="content-index-search-btn"><i class="fa fa-search"></i></button>
        </div>
        <div class="filter-box">
          <select id="content-index-filter-type">
            <option value="">All Types</option>
            <option value="model">Models</option>
            <option value="dataset">Datasets</option>
            <option value="embedding">Embeddings</option>
            <option value="document">Documents</option>
            <option value="image">Images</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
          <select id="content-index-sort">
            <option value="updated_at-desc">Latest Updates</option>
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
            <option value="size-desc">Largest Size</option>
            <option value="size-asc">Smallest Size</option>
          </select>
          <button id="content-index-filter-btn">Apply Filters</button>
          <button id="content-index-refresh-btn"><i class="fa fa-refresh"></i></button>
        </div>
      \`;
      dashboard.appendChild(controls);
      
      // Main content
      let mainContent;
      if (loading) {
        mainContent = document.createElement('div');
        mainContent.className = 'loading-spinner';
        mainContent.innerHTML = '<div class="spinner"></div><p>Loading content index data...</p>';
      } else if (viewMode === 'list') {
        mainContent = renderList();
      } else if (viewMode === 'detail' && selectedEntry) {
        mainContent = renderDetail();
      } else {
        mainContent = document.createElement('div');
        mainContent.className = 'content-list-container';
        mainContent.innerHTML = '<p>No content to display</p>';
      }
      dashboard.appendChild(mainContent);
      
      // Footer
      const footer = document.createElement('div');
      footer.className = 'dashboard-footer';
      footer.innerHTML = \`
        <button id="content-index-add-btn" class="primary-btn">
          <i class="fa fa-plus"></i> Add New Entry
        </button>
        <button id="content-index-export-btn">
          <i class="fa fa-download"></i> Export Index
        </button>
        <button id="content-index-import-btn">
          <i class="fa fa-upload"></i> Import Index
        </button>
      \`;
      dashboard.appendChild(footer);
      
      // Add to container
      container.appendChild(dashboard);
      
      // Add event listeners
      setupEventListeners();
    }
    
    // Render the list view
    function renderList() {
      const listContainer = document.createElement('div');
      listContainer.className = 'content-list-container';
      
      if (entries.length === 0) {
        listContainer.innerHTML = \`
          <div class="empty-state">
            <p>No content index entries found.</p>
            <button id="content-index-add-btn">Add New Entry</button>
          </div>
        \`;
        return listContainer;
      }
      
      // Create table
      const table = document.createElement('table');
      table.className = 'content-list-table';
      table.innerHTML = \`
        <thead>
          <tr>
            <th>Type</th>
            <th>Path</th>
            <th>CID</th>
            <th>Size</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          \${entries.map((entry, index) => {
            const size = entry.size ? formatSize(entry.size) : 'N/A';
            const updated = entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A';
            const typeIcon = getTypeIcon(entry.mimetype);
            
            return \`
              <tr data-index="\${index}">
                <td><i class="\${typeIcon}"></i> \${entry.mimetype?.split('/')[0] || 'Unknown'}</td>
                <td>\${entry.path || 'N/A'}</td>
                <td><span class="cid-display" title="\${entry.cid}">\${shortenCid(entry.cid)}</span></td>
                <td>\${size}</td>
                <td>\${updated}</td>
                <td>
                  <button class="view-btn" data-index="\${index}" title="View Details"><i class="fa fa-eye"></i></button>
                  <button class="copy-btn" data-cid="\${entry.cid}" title="Copy CID"><i class="fa fa-copy"></i></button>
                  <button class="download-btn" data-cid="\${entry.cid}" title="Download"><i class="fa fa-download"></i></button>
                </td>
              </tr>
            \`;
          }).join('')}
        </tbody>
      \`;
      listContainer.appendChild(table);
      
      // Add pagination if needed
      if (totalEntries > config.pageSize) {
        const totalPages = Math.ceil(totalEntries / config.pageSize);
        const pagination = document.createElement('div');
        pagination.className = 'pagination';
        pagination.innerHTML = \`
          <button id="prev-page-btn" \${currentPage === 1 ? 'disabled' : ''}>Previous</button>
          <span>Page \${currentPage} of \${totalPages}</span>
          <button id="next-page-btn" \${currentPage === totalPages ? 'disabled' : ''}>Next</button>
        \`;
        listContainer.appendChild(pagination);
      }
      
      return listContainer;
    }
    
    // Render the detail view
    function renderDetail() {
      const detailContainer = document.createElement('div');
      detailContainer.className = 'content-detail-container';
      
      if (!selectedEntry) {
        return detailContainer;
      }
      
      // Back button
      const backBtn = document.createElement('button');
      backBtn.className = 'back-btn';
      backBtn.innerHTML = '<i class="fa fa-arrow-left"></i> Back to List';
      backBtn.addEventListener('click', () => {
        viewMode = 'list';
        selectedEntry = null;
        renderDashboard();
      });
      detailContainer.appendChild(backBtn);
      
      // Entry header
      const header = document.createElement('div');
      header.className = 'detail-header';
      const typeIcon = getTypeIcon(selectedEntry.mimetype);
      header.innerHTML = \`
        <h3><i class="\${typeIcon}"></i> \${selectedEntry.path || 'Unnamed Content'}</h3>
        <div class="detail-actions">
          <button id="detail-copy-btn" title="Copy CID"><i class="fa fa-copy"></i> Copy CID</button>
          <button id="detail-download-btn" title="Download"><i class="fa fa-download"></i> Download</button>
          <button id="detail-delete-btn" title="Delete" class="danger-btn"><i class="fa fa-trash"></i> Delete</button>
        </div>
      \`;
      detailContainer.appendChild(header);
      
      // Entry details
      const details = document.createElement('div');
      details.className = 'detail-content';
      
      // Basic info
      const basicInfo = document.createElement('div');
      basicInfo.className = 'detail-section';
      basicInfo.innerHTML = \`
        <h4>Basic Information</h4>
        <table class="detail-table">
          <tr>
            <th>CID</th>
            <td><code>\${selectedEntry.cid}</code></td>
          </tr>
          <tr>
            <th>Path</th>
            <td>\${selectedEntry.path || 'N/A'}</td>
          </tr>
          <tr>
            <th>MIME Type</th>
            <td>\${selectedEntry.mimetype || 'Unknown'}</td>
          </tr>
          <tr>
            <th>Size</th>
            <td>\${selectedEntry.size ? formatSize(selectedEntry.size) : 'N/A'}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>\${selectedEntry.created_at ? new Date(selectedEntry.created_at).toLocaleString() : 'N/A'}</td>
          </tr>
          <tr>
            <th>Updated</th>
            <td>\${selectedEntry.updated_at ? new Date(selectedEntry.updated_at).toLocaleString() : 'N/A'}</td>
          </tr>
        </table>
      \`;
      details.appendChild(basicInfo);
      
      // Storage locations
      if (selectedEntry.locations) {
        let locationsHtml = '<h4>Storage Locations</h4><table class="detail-table">';
        
        // Filecoin
        if (selectedEntry.locations.filecoin?.length) {
          locationsHtml += \`
            <tr>
              <th>Filecoin</th>
              <td>
                <ul>
                  \${selectedEntry.locations.filecoin.map(loc => \`<li>\${loc}</li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // Storacha
        if (selectedEntry.locations.storacha) {
          locationsHtml += \`
            <tr>
              <th>Storacha W3UP</th>
              <td>\${selectedEntry.locations.storacha}</td>
            </tr>
          \`;
        }
        
        // libp2p
        if (selectedEntry.locations.libp2p?.length) {
          locationsHtml += \`
            <tr>
              <th>libp2p Peers</th>
              <td>
                <ul>
                  \${selectedEntry.locations.libp2p.map(loc => \`<li>\${loc}</li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // IPFS
        if (selectedEntry.locations.ipfs?.length) {
          locationsHtml += \`
            <tr>
              <th>IPFS Gateways</th>
              <td>
                <ul>
                  \${selectedEntry.locations.ipfs.map(loc => \`<li><a href="\${loc}/ipfs/\${selectedEntry.cid}" target="_blank">\${loc}</a></li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // IPFS Cluster
        if (selectedEntry.locations.ipfs_cluster?.length) {
          locationsHtml += \`
            <tr>
              <th>IPFS Cluster</th>
              <td>
                <ul>
                  \${selectedEntry.locations.ipfs_cluster.map(loc => \`<li>\${loc}</li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // S3
        if (selectedEntry.locations.s3?.bucket) {
          locationsHtml += \`
            <tr>
              <th>S3</th>
              <td>
                <table class="nested-table">
                  <tr><th>Bucket</th><td>\${selectedEntry.locations.s3.bucket}</td></tr>
                  <tr><th>Key</th><td>\${selectedEntry.locations.s3.key}</td></tr>
                  <tr><th>Region</th><td>\${selectedEntry.locations.s3.region || 'N/A'}</td></tr>
                  <tr><th>Endpoint</th><td>\${selectedEntry.locations.s3.endpoint || 'N/A'}</td></tr>
                </table>
              </td>
            </tr>
          \`;
        }
        
        // Hugging Face
        if (selectedEntry.locations.huggingface?.repo_id) {
          locationsHtml += \`
            <tr>
              <th>Hugging Face</th>
              <td>
                <table class="nested-table">
                  <tr><th>Repository</th><td>\${selectedEntry.locations.huggingface.repo_id}</td></tr>
                  <tr><th>Path</th><td>\${selectedEntry.locations.huggingface.path}</td></tr>
                  <tr><th>Revision</th><td>\${selectedEntry.locations.huggingface.revision || 'main'}</td></tr>
                </table>
              </td>
            </tr>
          \`;
        }
        
        locationsHtml += '</table>';
        
        const locationsInfo = document.createElement('div');
        locationsInfo.className = 'detail-section';
        locationsInfo.innerHTML = locationsHtml;
        details.appendChild(locationsInfo);
      }
      
      // Custom metadata
      if (selectedEntry.metadata) {
        const metadataSection = document.createElement('div');
        metadataSection.className = 'detail-section';
        metadataSection.innerHTML = '<h4>Custom Metadata</h4><table class="detail-table">';
        
        for (const [key, value] of Object.entries(selectedEntry.metadata)) {
          metadataSection.innerHTML += \`
            <tr>
              <th>\${key}</th>
              <td>\${typeof value === 'object' ? '<pre>' + JSON.stringify(value, null, 2) + '</pre>' : value}</td>
            </tr>
          \`;
        }
        
        metadataSection.innerHTML += '</table>';
        details.appendChild(metadataSection);
      }
      
      detailContainer.appendChild(details);
      return detailContainer;
    }
    
    // Set up event listeners for the dashboard
    function setupEventListeners() {
      // Search input
      const searchInput = document.getElementById('content-index-search');
      if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') handleSearch();
        });
      }
      
      // Search button
      const searchBtn = document.getElementById('content-index-search-btn');
      if (searchBtn) {
        searchBtn.addEventListener('click', () => handleSearch());
      }
      
      // Filter button
      const filterBtn = document.getElementById('content-index-filter-btn');
      if (filterBtn) {
        filterBtn.addEventListener('click', () => handleFilterChange());
      }
      
      // Refresh button
      const refreshBtn = document.getElementById('content-index-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadData());
      }
      
      // Add button
      const addBtn = document.getElementById('content-index-add-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => handleAddEntry());
      }
      
      // Export button
      const exportBtn = document.getElementById('content-index-export-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => handleExportIndex());
      }
      
      // Import button
      const importBtn = document.getElementById('content-index-import-btn');
      if (importBtn) {
        importBtn.addEventListener('click', () => handleImportIndex());
      }
      
      // Pagination buttons
      const prevBtn = document.getElementById('prev-page-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            loadData();
          }
        });
      }
      
      const nextBtn = document.getElementById('next-page-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          currentPage++;
          loadData();
        });
      }
      
      // View buttons
      const viewButtons = document.querySelectorAll('.view-btn');
      viewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.currentTarget.dataset.index, 10);
          viewEntry(index);
        });
      });
      
      // Copy buttons
      const copyButtons = document.querySelectorAll('.copy-btn');
      copyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.currentTarget.dataset.cid;
          handleCopyCid(cid);
        });
      });
      
      // Download buttons
      const downloadButtons = document.querySelectorAll('.download-btn');
      downloadButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.currentTarget.dataset.cid;
          handleDownload(cid);
        });
      });
      
      // Detail view buttons
      if (viewMode === 'detail') {
        const detailCopyBtn = document.getElementById('detail-copy-btn');
        if (detailCopyBtn) {
          detailCopyBtn.addEventListener('click', () => {
            handleCopyCid(selectedEntry.cid);
          });
        }
        
        const detailDownloadBtn = document.getElementById('detail-download-btn');
        if (detailDownloadBtn) {
          detailDownloadBtn.addEventListener('click', () => {
            handleDownload(selectedEntry.cid);
          });
        }
        
        const detailDeleteBtn = document.getElementById('detail-delete-btn');
        if (detailDeleteBtn) {
          detailDeleteBtn.addEventListener('click', () => {
            handleDeleteEntry(selectedEntry.cid);
          });
        }
      }
    }
    
    // Initialize when the window loads
    window.addEventListener('DOMContentLoaded', () => {
      renderDashboard();
    });
  </script>
</body>
</html>
`;
    
    // Write the HTML file
    fs.writeFileSync(htmlPath, htmlContent);
  }
  
  /**
   * Close the dashboard
   */
  closeDashboard() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
    
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
  
  /**
   * Refresh data from the content index
   */
  refreshData() {
    if (!this.window) return;
    
    try {
      // Perform search to refresh data
      this._doSearch({}).then(result => {
        this.window.webContents.send('content-index-search-result', result);
      }).catch(error => {
        console.error('Error refreshing data:', error);
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }
}

module.exports = PyArrowContentIndexDashboard;