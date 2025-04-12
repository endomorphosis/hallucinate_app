/**
 * Model Management Component for PyArrow Content Index Dashboard
 * 
 * Provides UI components and functionality to manage AI models with PyArrow Content Index
 */

class ModelManagementComponent {
  /**
   * Create a new ModelManagementComponent instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.element Container element for the component
   * @param {Object} options.bridge PyArrow Content Index bridge
   * @param {Object} options.secureManager Secure PyArrow Index Manager (optional)
   * @param {boolean} options.secureMode Whether security is enabled
   * @param {Object} options.eventBus Event bus for communication
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.bridge = options.bridge;
    this.secureManager = options.secureManager;
    this.secureMode = options.secureMode || false;
    this.eventBus = options.eventBus;
    
    this.initialized = false;
    this.models = [];
    this.modelTypes = {
      'text-generation': 'Text Generation',
      'text-classification': 'Text Classification',
      'text-embedding': 'Text Embedding',
      'image-classification': 'Image Classification',
      'image-to-text': 'Image to Text',
      'image-segmentation': 'Image Segmentation',
      'image-generation': 'Image Generation',
      'audio-classification': 'Audio Classification',
      'audio-to-text': 'Audio to Text',
      'other': 'Other'
    };
  }
  
  /**
   * Initialize the component
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      console.log('Initializing model management component...');
      
      // Fetch initial models from the content index
      await this.loadModels();
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize model management component:', error);
      return false;
    }
  }
  
  /**
   * Load models from the content index
   */
  async loadModels() {
    try {
      // Query the content index for models
      const queryParams = {
        filter: {
          type: 'model'
        },
        sort: [{ field: 'created_at', order: 'desc' }],
        limit: 100
      };
      
      // Execute query through bridge or secure manager
      const result = this.secureMode && this.secureManager 
        ? await this.secureManager.query(queryParams) 
        : await this.bridge.query(queryParams);
      
      if (result && Array.isArray(result.entries)) {
        this.models = result.entries.map(entry => {
          // Extract model-specific metadata
          const metadata = entry.metadata || {};
          return {
            cid: entry.cid,
            path: entry.path,
            name: metadata.name || this.getModelNameFromPath(entry.path),
            type: metadata.type || this.inferModelType(entry.path),
            framework: metadata.framework || 'unknown',
            size: entry.size || 0,
            description: metadata.description || '',
            created_at: entry.created_at || new Date().toISOString(),
            tags: metadata.tags || [],
            source: metadata.source || { type: 'ipfs' },
            config: metadata.config || {},
            statistics: metadata.statistics || { downloads: 0, uses: 0 }
          };
        });
      } else {
        this.models = [];
      }
      
      // Sort by most recent
      this.models.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      console.log(`Loaded ${this.models.length} models from content index`);
    } catch (error) {
      console.error('Failed to load models:', error);
      this.models = [];
      throw error;
    }
  }
  
  /**
   * Render the component
   */
  async render() {
    if (!this.element) {
      console.error('No container element provided for model management component');
      return;
    }
    
    // Create main container
    this.element.innerHTML = `
      <div class="model-management-component">
        <div class="action-bar">
          <h3>Model Management</h3>
          <div class="actions">
            <button id="import-model-btn" class="btn btn-primary">
              <i class="fas fa-cloud-upload-alt btn-icon"></i> Import Model
            </button>
            <div class="search-box">
              <i class="fas fa-search"></i>
              <input type="text" id="model-search-input" placeholder="Search models..." />
            </div>
            <select id="model-type-filter">
              <option value="">All Types</option>
              ${Object.entries(this.modelTypes).map(([value, label]) => 
                `<option value="${value}">${label}</option>`
              ).join('')}
            </select>
            <button id="refresh-models-btn" class="btn btn-secondary">
              <i class="fas fa-sync-alt btn-icon"></i> Refresh
            </button>
          </div>
        </div>
        
        <!-- Model Statistics Overview -->
        <div class="stats-container">
          <div class="stat-card">
            <div class="stat-value" id="models-count">${this.models.length}</div>
            <div class="stat-label">Total Models</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="models-size">${this.formatBytes(this.calculateTotalSize())}</div>
            <div class="stat-label">Total Size</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="model-types-count">${this.countModelTypes()}</div>
            <div class="stat-label">Model Types</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="models-downloads">${this.calculateTotalDownloads()}</div>
            <div class="stat-label">Total Downloads</div>
          </div>
        </div>
        
        <!-- Models Grid View -->
        <div class="models-view">
          <div class="view-options">
            <button class="view-option active" data-view="grid"><i class="fas fa-th"></i></button>
            <button class="view-option" data-view="list"><i class="fas fa-list"></i></button>
          </div>
          
          <div id="models-grid" class="models-grid">
            ${this.renderModelsGrid()}
          </div>
          
          <div id="models-list" class="models-list" style="display: none;">
            <table class="models-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Framework</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderModelsList()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    // Add model import modal
    this.element.insertAdjacentHTML('beforeend', this.renderImportModal());
    
    // Add model details modal
    this.element.insertAdjacentHTML('beforeend', this.renderModelDetailsModal());
    
    // Add event listeners
    this.addEventListeners();
  }
  
  /**
   * Add event listeners to component elements
   */
  addEventListeners() {
    // Import model button
    const importModelBtn = this.element.querySelector('#import-model-btn');
    if (importModelBtn) {
      importModelBtn.addEventListener('click', () => this.showImportModal());
    }
    
    // Refresh models button
    const refreshModelsBtn = this.element.querySelector('#refresh-models-btn');
    if (refreshModelsBtn) {
      refreshModelsBtn.addEventListener('click', async () => {
        await this.loadModels();
        this.updateModelsView();
      });
    }
    
    // View options
    const viewOptions = this.element.querySelectorAll('.view-option');
    viewOptions.forEach(option => {
      option.addEventListener('click', () => {
        viewOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        
        const view = option.getAttribute('data-view');
        this.switchView(view);
      });
    });
    
    // Model type filter
    const typeFilter = this.element.querySelector('#model-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', () => this.filterModels());
    }
    
    // Model search
    const searchInput = this.element.querySelector('#model-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.filterModels());
    }
    
    // Import form submission
    const importForm = this.element.querySelector('#import-model-form');
    if (importForm) {
      importForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleImportModel();
      });
    }
    
    // Model source selector
    const sourceSelector = this.element.querySelector('#import-model-source');
    if (sourceSelector) {
      sourceSelector.addEventListener('change', () => {
        const sourceType = sourceSelector.value;
        
        // Show/hide fields based on source type
        const huggingfaceFields = this.element.querySelector('#huggingface-fields');
        const ipfsFields = this.element.querySelector('#ipfs-fields');
        const localFields = this.element.querySelector('#local-fields');
        
        huggingfaceFields.style.display = sourceType === 'huggingface' ? 'block' : 'none';
        ipfsFields.style.display = sourceType === 'ipfs' ? 'block' : 'none';
        localFields.style.display = sourceType === 'local' ? 'block' : 'none';
      });
    }
    
    // Close modal buttons
    const closeButtons = this.element.querySelectorAll('.modal-close, .modal-close-btn');
    closeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const modal = button.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
        }
      });
    });
    
    // Model details buttons
    this.element.querySelectorAll('.model-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.model-card-actions')) {
          const modelId = card.getAttribute('data-model-cid');
          this.showModelDetails(modelId);
        }
      });
    });
    
    // Model action buttons in grid view
    this.element.querySelectorAll('.model-action-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = button.getAttribute('data-action');
        const modelId = button.closest('.model-card').getAttribute('data-model-cid');
        
        if (action === 'view') {
          this.showModelDetails(modelId);
        } else if (action === 'download') {
          this.downloadModel(modelId);
        } else if (action === 'delete') {
          this.deleteModel(modelId);
        }
      });
    });
    
    // Model action buttons in list view
    this.element.querySelectorAll('.list-model-action-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = button.getAttribute('data-action');
        const modelId = button.closest('tr').getAttribute('data-model-cid');
        
        if (action === 'view') {
          this.showModelDetails(modelId);
        } else if (action === 'download') {
          this.downloadModel(modelId);
        } else if (action === 'delete') {
          this.deleteModel(modelId);
        }
      });
    });
    
    // Modal overlay click to close
    const modalOverlays = this.element.querySelectorAll('.modal-overlay');
    modalOverlays.forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });
  }
  
  /**
   * Switch between grid and list view
   * @param {string} view View type ('grid' or 'list')
   */
  switchView(view) {
    const gridView = this.element.querySelector('#models-grid');
    const listView = this.element.querySelector('#models-list');
    
    if (view === 'grid') {
      gridView.style.display = 'grid';
      listView.style.display = 'none';
    } else if (view === 'list') {
      gridView.style.display = 'none';
      listView.style.display = 'block';
    }
  }
  
  /**
   * Filter models based on search and type filter
   */
  filterModels() {
    const searchInput = this.element.querySelector('#model-search-input');
    const typeFilter = this.element.querySelector('#model-type-filter');
    
    if (!searchInput || !typeFilter) return;
    
    const searchTerm = searchInput.value.toLowerCase();
    const selectedType = typeFilter.value;
    
    // Filter models
    const filteredModels = this.models.filter(model => {
      const matchesSearch = 
        model.name.toLowerCase().includes(searchTerm) || 
        model.description.toLowerCase().includes(searchTerm) ||
        (model.tags && model.tags.some(tag => tag.toLowerCase().includes(searchTerm)));
      
      const matchesType = !selectedType || model.type === selectedType;
      
      return matchesSearch && matchesType;
    });
    
    // Update grid and list views
    this.updateModelsGrid(filteredModels);
    this.updateModelsList(filteredModels);
    
    // Update stats
    this.element.querySelector('#models-count').textContent = filteredModels.length;
  }
  
  /**
   * Update the models grid view
   * @param {Array} models Models to display (optional, defaults to all models)
   */
  updateModelsGrid(models = null) {
    const gridContainer = this.element.querySelector('#models-grid');
    if (!gridContainer) return;
    
    const modelsToRender = models || this.models;
    gridContainer.innerHTML = modelsToRender.length > 0 
      ? this.renderModelsGrid(modelsToRender)
      : '<div class="no-models">No models found</div>';
    
    // Re-add event listeners
    this.addEventListeners();
  }
  
  /**
   * Update the models list view
   * @param {Array} models Models to display (optional, defaults to all models)
   */
  updateModelsList(models = null) {
    const listContainer = this.element.querySelector('.models-table tbody');
    if (!listContainer) return;
    
    const modelsToRender = models || this.models;
    listContainer.innerHTML = modelsToRender.length > 0 
      ? this.renderModelsList(modelsToRender)
      : '<tr><td colspan="6" class="text-center">No models found</td></tr>';
    
    // Re-add event listeners
    this.addEventListeners();
  }
  
  /**
   * Update both views after a data change
   */
  updateModelsView() {
    this.updateModelsGrid();
    this.updateModelsList();
    
    // Update statistics
    this.element.querySelector('#models-count').textContent = this.models.length;
    this.element.querySelector('#models-size').textContent = this.formatBytes(this.calculateTotalSize());
    this.element.querySelector('#model-types-count').textContent = this.countModelTypes();
    this.element.querySelector('#models-downloads').textContent = this.calculateTotalDownloads();
  }
  
  /**
   * Render the models grid
   * @param {Array} models Models to render (optional, defaults to all models)
   * @returns {string} HTML for models grid
   */
  renderModelsGrid(models = null) {
    const modelsToRender = models || this.models;
    
    if (!modelsToRender || modelsToRender.length === 0) {
      return '<div class="no-models">No models found</div>';
    }
    
    return modelsToRender.map(model => {
      const date = new Date(model.created_at).toLocaleDateString();
      return `
        <div class="model-card" data-model-cid="${model.cid}">
          <div class="model-card-header">
            <div class="model-type">${this.modelTypes[model.type] || model.type}</div>
            <div class="model-framework">${model.framework}</div>
          </div>
          <div class="model-card-body">
            <h3 class="model-name">${model.name}</h3>
            <p class="model-description">${model.description || 'No description available'}</p>
            <div class="model-info">
              <div class="model-info-item">
                <i class="fas fa-file-archive"></i>
                <span>${this.formatBytes(model.size)}</span>
              </div>
              <div class="model-info-item">
                <i class="fas fa-calendar-alt"></i>
                <span>${date}</span>
              </div>
            </div>
            <div class="model-tags">
              ${(model.tags || []).map(tag => `
                <span class="model-tag">${tag}</span>
              `).join('')}
            </div>
          </div>
          <div class="model-card-actions">
            <button class="model-action-btn" data-action="view" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="model-action-btn" data-action="download" title="Download Model">
              <i class="fas fa-download"></i>
            </button>
            <button class="model-action-btn" data-action="delete" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  /**
   * Render the models list
   * @param {Array} models Models to render (optional, defaults to all models)
   * @returns {string} HTML for models list
   */
  renderModelsList(models = null) {
    const modelsToRender = models || this.models;
    
    if (!modelsToRender || modelsToRender.length === 0) {
      return '<tr><td colspan="6" class="text-center">No models found</td></tr>';
    }
    
    return modelsToRender.map(model => {
      const date = new Date(model.created_at).toLocaleDateString();
      return `
        <tr data-model-cid="${model.cid}">
          <td>${model.name}</td>
          <td>${this.modelTypes[model.type] || model.type}</td>
          <td>${model.framework}</td>
          <td>${this.formatBytes(model.size)}</td>
          <td>${date}</td>
          <td class="list-model-actions">
            <button class="list-model-action-btn" data-action="view" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="list-model-action-btn" data-action="download" title="Download Model">
              <i class="fas fa-download"></i>
            </button>
            <button class="list-model-action-btn" data-action="delete" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
  
  /**
   * Render import model modal
   * @returns {string} HTML for import modal
   */
  renderImportModal() {
    return `
      <div id="import-model-modal" class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Import Model</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <form id="import-model-form">
              <div class="form-group">
                <label for="import-model-name">Model Name*</label>
                <input type="text" id="import-model-name" class="form-control" required>
              </div>
              
              <div class="form-group">
                <label for="import-model-type">Model Type*</label>
                <select id="import-model-type" class="form-control" required>
                  ${Object.entries(this.modelTypes).map(([value, label]) => 
                    `<option value="${value}">${label}</option>`
                  ).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label for="import-model-description">Description</label>
                <textarea id="import-model-description" class="form-control" rows="3"></textarea>
              </div>
              
              <div class="form-group">
                <label for="import-model-tags">Tags (comma separated)</label>
                <input type="text" id="import-model-tags" class="form-control" placeholder="llm, text-generation, onnx">
              </div>
              
              <div class="form-group">
                <label for="import-model-framework">Framework</label>
                <select id="import-model-framework" class="form-control">
                  <option value="pytorch">PyTorch</option>
                  <option value="tensorflow">TensorFlow</option>
                  <option value="onnx">ONNX</option>
                  <option value="jax">JAX</option>
                  <option value="llama.cpp">Llama.cpp</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="import-model-source">Source*</label>
                <select id="import-model-source" class="form-control" required>
                  <option value="huggingface">HuggingFace Hub</option>
                  <option value="ipfs">IPFS</option>
                  <option value="local">Local File</option>
                </select>
              </div>
              
              <!-- HuggingFace Fields -->
              <div id="huggingface-fields">
                <div class="form-group">
                  <label for="import-model-huggingface-id">HuggingFace Model ID*</label>
                  <input type="text" id="import-model-huggingface-id" class="form-control" placeholder="e.g. microsoft/phi-2">
                </div>
                
                <div class="form-group">
                  <label for="import-model-huggingface-revision">Revision</label>
                  <input type="text" id="import-model-huggingface-revision" class="form-control" placeholder="e.g. main">
                </div>
              </div>
              
              <!-- IPFS Fields -->
              <div id="ipfs-fields" style="display: none;">
                <div class="form-group">
                  <label for="import-model-ipfs-cid">IPFS CID*</label>
                  <input type="text" id="import-model-ipfs-cid" class="form-control" placeholder="e.g. QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx">
                </div>
              </div>
              
              <!-- Local File Fields -->
              <div id="local-fields" style="display: none;">
                <div class="form-group">
                  <label for="import-model-local-path">File Path*</label>
                  <input type="text" id="import-model-local-path" class="form-control" placeholder="/path/to/model">
                </div>
              </div>
              
              <div id="import-model-result" class="form-result"></div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-close-btn">Cancel</button>
            <button type="submit" form="import-model-form" class="btn btn-primary">Import Model</button>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Render model details modal
   * @returns {string} HTML for model details modal
   */
  renderModelDetailsModal() {
    return `
      <div id="model-details-modal" class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Model Details</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body" id="model-details-body">
            <div class="loading">
              <div class="spinner"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button id="download-model-btn" class="btn btn-secondary">
              <i class="fas fa-download"></i> Download
            </button>
            <button id="delete-model-btn" class="btn btn-danger">
              <i class="fas fa-trash"></i> Delete
            </button>
            <button class="btn btn-primary modal-close-btn">Close</button>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Show import model modal
   */
  showImportModal() {
    const modal = this.element.querySelector('#import-model-modal');
    if (modal) {
      modal.classList.add('active');
    }
  }
  
  /**
   * Show model details modal
   * @param {string} modelId Model CID
   */
  showModelDetails(modelId) {
    const modal = this.element.querySelector('#model-details-modal');
    const detailsBody = this.element.querySelector('#model-details-body');
    const downloadBtn = this.element.querySelector('#download-model-btn');
    const deleteBtn = this.element.querySelector('#delete-model-btn');
    
    if (!modal || !detailsBody) return;
    
    // Show loading state
    detailsBody.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.classList.add('active');
    
    // Find model
    const model = this.models.find(m => m.cid === modelId);
    
    if (!model) {
      detailsBody.innerHTML = '<div class="error-message">Model not found</div>';
      return;
    }
    
    // Add event listeners to action buttons
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        this.downloadModel(modelId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        modal.classList.remove('active');
        this.deleteModel(modelId);
      };
    }
    
    // Format dates
    const createdDate = new Date(model.created_at).toLocaleString();
    
    // Prepare source info
    let sourceInfo = '';
    if (model.source) {
      if (model.source.type === 'huggingface') {
        sourceInfo = `
          <div class="detail-item">
            <span class="detail-label">HuggingFace ID:</span>
            <span class="detail-value">${model.source.id || 'N/A'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Revision:</span>
            <span class="detail-value">${model.source.revision || 'main'}</span>
          </div>
        `;
      } else if (model.source.type === 'ipfs') {
        sourceInfo = `
          <div class="detail-item">
            <span class="detail-label">IPFS CID:</span>
            <span class="detail-value">${model.cid}</span>
          </div>
        `;
      }
    }
    
    // Format tags
    const tagsHtml = model.tags && model.tags.length > 0 
      ? model.tags.map(tag => `<span class="model-tag">${tag}</span>`).join('')
      : '<span class="text-muted">No tags</span>';
    
    // Render model details
    detailsBody.innerHTML = `
      <div class="model-details">
        <div class="detail-section">
          <h4 class="section-title">Basic Information</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Name:</span>
              <span class="detail-value">${model.name}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Type:</span>
              <span class="detail-value">${this.modelTypes[model.type] || model.type}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Framework:</span>
              <span class="detail-value">${model.framework}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Size:</span>
              <span class="detail-value">${this.formatBytes(model.size)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Created:</span>
              <span class="detail-value">${createdDate}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4 class="section-title">Description</h4>
          <div class="detail-text">
            ${model.description || 'No description available.'}
          </div>
        </div>
        
        <div class="detail-section">
          <h4 class="section-title">Tags</h4>
          <div class="model-tags detail-tags">
            ${tagsHtml}
          </div>
        </div>
        
        <div class="detail-section">
          <h4 class="section-title">Source</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Source Type:</span>
              <span class="detail-value">${model.source?.type || 'unknown'}</span>
            </div>
            ${sourceInfo}
          </div>
        </div>
        
        <div class="detail-section">
          <h4 class="section-title">Technical Information</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Path:</span>
              <span class="detail-value">${model.path}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">CID:</span>
              <span class="detail-value">${model.cid}</span>
            </div>
          </div>
        </div>
        
        ${model.config ? `
          <div class="detail-section">
            <h4 class="section-title">Model Configuration</h4>
            <pre class="code-block">${JSON.stringify(model.config, null, 2)}</pre>
          </div>
        ` : ''}
        
        <div class="detail-section">
          <h4 class="section-title">Usage Statistics</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Downloads:</span>
              <span class="detail-value">${model.statistics?.downloads || 0}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Usage Count:</span>
              <span class="detail-value">${model.statistics?.uses || 0}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Handle model import form submission
   */
  async handleImportModel() {
    // Get form values
    const name = this.element.querySelector('#import-model-name').value;
    const type = this.element.querySelector('#import-model-type').value;
    const description = this.element.querySelector('#import-model-description').value;
    const tagsInput = this.element.querySelector('#import-model-tags').value;
    const framework = this.element.querySelector('#import-model-framework').value;
    const source = this.element.querySelector('#import-model-source').value;
    
    // Parse tags
    const tags = tagsInput.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    
    // Create model entry
    const modelEntry = {
      name,
      type,
      description,
      tags,
      framework,
      created_at: new Date().toISOString(),
      source: { type: source },
      statistics: { downloads: 0, uses: 0 }
    };
    
    // Add source-specific fields
    if (source === 'huggingface') {
      const huggingfaceId = this.element.querySelector('#import-model-huggingface-id').value;
      const revision = this.element.querySelector('#import-model-huggingface-revision').value;
      
      if (!huggingfaceId) {
        this.showImportError('HuggingFace Model ID is required');
        return;
      }
      
      modelEntry.source.id = huggingfaceId;
      if (revision) {
        modelEntry.source.revision = revision;
      }
      
      // Add path based on HF ID
      modelEntry.path = `/models/${huggingfaceId.replace('/', '_')}`;
    } else if (source === 'ipfs') {
      const ipfsCid = this.element.querySelector('#import-model-ipfs-cid').value;
      
      if (!ipfsCid) {
        this.showImportError('IPFS CID is required');
        return;
      }
      
      modelEntry.cid = ipfsCid;
      modelEntry.path = `/models/ipfs/${ipfsCid}`;
    } else if (source === 'local') {
      const localPath = this.element.querySelector('#import-model-local-path').value;
      
      if (!localPath) {
        this.showImportError('Local file path is required');
        return;
      }
      
      // Extract filename from path
      const pathParts = localPath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      modelEntry.path = `/models/local/${fileName}`;
    }
    
    // Show import in progress
    const resultArea = this.element.querySelector('#import-model-result');
    resultArea.innerHTML = '<div class="loading">Importing model...</div>';
    
    try {
      // Add the model to the content index
      const result = this.secureMode && this.secureManager 
        ? await this.secureManager.addEntry({
            cid: modelEntry.cid || `model_${Date.now()}`, // Generate a temporary CID if not provided
            path: modelEntry.path,
            metadata: {
              type: 'model',
              name: modelEntry.name,
              model_type: modelEntry.type,
              description: modelEntry.description,
              tags: modelEntry.tags,
              framework: modelEntry.framework,
              source: modelEntry.source,
              statistics: modelEntry.statistics,
            }
          })
        : await this.bridge.addEntry({
            cid: modelEntry.cid || `model_${Date.now()}`,
            path: modelEntry.path,
            metadata: {
              type: 'model',
              name: modelEntry.name,
              model_type: modelEntry.type,
              description: modelEntry.description,
              tags: modelEntry.tags,
              framework: modelEntry.framework,
              source: modelEntry.source,
              statistics: modelEntry.statistics,
            }
          });
      
      if (result && result.success) {
        // Show success
        resultArea.innerHTML = '<div class="success-message">Model imported successfully!</div>';
        
        // Clear form
        this.element.querySelector('#import-model-form').reset();
        
        // Reload models
        await this.loadModels();
        this.updateModelsView();
        
        // Close modal after delay
        setTimeout(() => {
          const modal = this.element.querySelector('#import-model-modal');
          if (modal) {
            modal.classList.remove('active');
          }
        }, 1500);
      } else {
        this.showImportError(result.error || 'Failed to import model');
      }
    } catch (error) {
      console.error('Failed to import model:', error);
      this.showImportError(error.message || 'Failed to import model');
    }
  }
  
  /**
   * Show import error in result area
   * @param {string} message Error message
   */
  showImportError(message) {
    const resultArea = this.element.querySelector('#import-model-result');
    if (resultArea) {
      resultArea.innerHTML = `<div class="error-message">${message}</div>`;
    }
  }
  
  /**
   * Download a model
   * @param {string} modelId Model CID
   */
  async downloadModel(modelId) {
    try {
      const model = this.models.find(m => m.cid === modelId);
      
      if (!model) {
        alert('Model not found');
        return;
      }
      
      // Start the download
      alert(`Downloading model ${model.name}...\nThis feature is a placeholder as the actual download implementation depends on your application's specific requirements.`);
      
      // In a real implementation, you would:
      // 1. Get the model from IPFS or other storage
      // 2. Update the download counter in the metadata
      // 3. Show a download progress indicator
      
      // Simulate updating statistics
      model.statistics = model.statistics || {};
      model.statistics.downloads = (model.statistics.downloads || 0) + 1;
      
      // Update the model entry
      if (this.secureMode && this.secureManager) {
        await this.secureManager.updateEntry(model.cid, {
          metadata: {
            ...model.metadata,
            statistics: model.statistics
          }
        });
      } else if (this.bridge) {
        await this.bridge.updateEntry(model.cid, {
          metadata: {
            ...model.metadata,
            statistics: model.statistics
          }
        });
      }
      
      // Reload data
      await this.loadModels();
      this.updateModelsView();
    } catch (error) {
      console.error('Failed to download model:', error);
      alert(`Failed to download model: ${error.message}`);
    }
  }
  
  /**
   * Delete a model
   * @param {string} modelId Model CID
   */
  async deleteModel(modelId) {
    if (!confirm('Are you sure you want to delete this model?')) {
      return;
    }
    
    try {
      // Delete the model
      const result = this.secureMode && this.secureManager
        ? await this.secureManager.deleteEntry(modelId)
        : await this.bridge.deleteEntry(modelId);
      
      if (result && result.success) {
        // Reload models
        await this.loadModels();
        this.updateModelsView();
        
        alert('Model deleted successfully');
      } else {
        alert(`Failed to delete model: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
      alert(`Failed to delete model: ${error.message}`);
    }
  }
  
  /**
   * Calculate total size of all models
   * @returns {number} Total size in bytes
   */
  calculateTotalSize() {
    return this.models.reduce((total, model) => total + (model.size || 0), 0);
  }
  
  /**
   * Count unique model types
   * @returns {number} Number of unique model types
   */
  countModelTypes() {
    const uniqueTypes = new Set(this.models.map(model => model.type));
    return uniqueTypes.size;
  }
  
  /**
   * Calculate total downloads across all models
   * @returns {number} Total downloads
   */
  calculateTotalDownloads() {
    return this.models.reduce((total, model) => total + ((model.statistics && model.statistics.downloads) || 0), 0);
  }
  
  /**
   * Format bytes to human-readable size
   * @param {number} bytes Size in bytes
   * @returns {string} Formatted size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }
  
  /**
   * Get model name from path
   * @param {string} path Model path
   * @returns {string} Model name
   */
  getModelNameFromPath(path) {
    if (!path) return 'Unknown';
    
    // Extract name from path
    const parts = path.split('/');
    let name = parts[parts.length - 1];
    
    // Remove extension
    const extIndex = name.lastIndexOf('.');
    if (extIndex > 0) {
      name = name.substring(0, extIndex);
    }
    
    // Convert underscores to spaces and capitalize words
    return name
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  
  /**
   * Infer model type from path
   * @param {string} path Model path
   * @returns {string} Model type
   */
  inferModelType(path) {
    if (!path) return 'other';
    
    const pathLower = path.toLowerCase();
    
    if (pathLower.includes('text-generation') || pathLower.includes('llm') || pathLower.includes('gpt') || pathLower.includes('transformer')) {
      return 'text-generation';
    } else if (pathLower.includes('classification') || pathLower.includes('classifier')) {
      return 'text-classification';
    } else if (pathLower.includes('embedding')) {
      return 'text-embedding';
    } else if (pathLower.includes('image') && pathLower.includes('text')) {
      return 'image-to-text';
    } else if (pathLower.includes('image') && pathLower.includes('classification')) {
      return 'image-classification';
    } else if (pathLower.includes('segmentation')) {
      return 'image-segmentation';
    } else if (pathLower.includes('diffusion') || pathLower.includes('stable-diffusion')) {
      return 'image-generation';
    } else if (pathLower.includes('audio') && pathLower.includes('classification')) {
      return 'audio-classification';
    } else if (pathLower.includes('audio') && pathLower.includes('text')) {
      return 'audio-to-text';
    }
    
    return 'other';
  }
}

export default ModelManagementComponent;