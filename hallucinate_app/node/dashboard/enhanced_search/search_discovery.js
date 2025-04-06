/**
 * Enhanced Search Interface for Content Discovery
 * 
 * This module provides advanced search capabilities for the PyArrow Content Index Dashboard.
 * It includes:
 * - Advanced search form with multiple field types
 * - Saved search functionality
 * - Search history tracking
 * - Interactive filtering
 * - Thumbnail integration for visual content
 * - Detail panel for content inspection
 */

/**
 * Builds and returns an advanced search interface
 * 
 * @returns {HTMLElement} The advanced search panel
 */
function createAdvancedSearchPanel() {
  const panel = document.createElement('div');
  panel.className = 'advanced-search-panel';
  panel.style.display = 'none'; // Hidden by default
  
  const heading = document.createElement('h3');
  heading.textContent = 'Advanced Search';
  panel.appendChild(heading);
  
  // Create search fields grid
  const searchGrid = document.createElement('div');
  searchGrid.className = 'search-grid';
  
  // Add search fields
  searchGrid.appendChild(createSearchField('cid', 'Content ID (CID)', 'text'));
  searchGrid.appendChild(createSearchField('path', 'File Path', 'text'));
  searchGrid.appendChild(createSearchField('name', 'File Name', 'text'));
  searchGrid.appendChild(createSearchField('mimetype', 'MIME Type', 'select', [
    { value: '', label: 'Any' },
    { value: 'image/', label: 'Images' },
    { value: 'video/', label: 'Videos' },
    { value: 'audio/', label: 'Audio' },
    { value: 'text/', label: 'Text' },
    { value: 'application/pdf', label: 'PDF Documents' },
    { value: 'application/json', label: 'JSON Files' },
    { value: 'application/x-ipfs', label: 'IPFS Objects' }
  ]));
  searchGrid.appendChild(createSearchField('size_min', 'Min Size (bytes)', 'number'));
  searchGrid.appendChild(createSearchField('size_max', 'Max Size (bytes)', 'number'));
  searchGrid.appendChild(createSearchField('created_after', 'Created After', 'date'));
  searchGrid.appendChild(createSearchField('created_before', 'Created Before', 'date'));
  searchGrid.appendChild(createSearchField('location', 'Storage Location', 'select', [
    { value: '', label: 'Any' },
    { value: 'ipfs', label: 'IPFS' },
    { value: 'filecoin', label: 'Filecoin' },
    { value: 'huggingface', label: 'HuggingFace' },
    { value: 's3', label: 'Amazon S3' },
    { value: 'local', label: 'Local Storage' },
    { value: 'pinata', label: 'Pinata' },
    { value: 'web3storage', label: 'Web3.Storage' },
    { value: 'arweave', label: 'Arweave' }
  ]));
  searchGrid.appendChild(createSearchField('pinned', 'Pin Status', 'select', [
    { value: '', label: 'Any' },
    { value: 'true', label: 'Pinned' },
    { value: 'false', label: 'Not Pinned' }
  ]));
  // Add new thumbnail-related search fields
  searchGrid.appendChild(createSearchField('content_type', 'Content Type', 'select', [
    { value: '', label: 'Any' },
    { value: 'image', label: 'Images' },
    { value: 'video', label: 'Videos' },
    { value: 'audio', label: 'Audio' },
    { value: 'document', label: 'Documents' },
    { value: 'dataset', label: 'Datasets' },
    { value: 'model', label: 'Models' },
    { value: 'code', label: 'Code' },
    { value: 'other', label: 'Other' }
  ]));
  searchGrid.appendChild(createSearchField('has_thumbnail', 'Has Thumbnail', 'select', [
    { value: '', label: 'Any' },
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ]));
  searchGrid.appendChild(createSearchField('visual_content', 'Visual Content', 'select', [
    { value: '', label: 'Any' },
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ]));
  searchGrid.appendChild(createSearchField('tags', 'Tags (comma separated)', 'text'));
  searchGrid.appendChild(createSearchField('limit', 'Result Limit', 'number', null, 100));
  
  panel.appendChild(searchGrid);
  
  // Create action buttons
  const searchActions = document.createElement('div');
  searchActions.className = 'search-actions';
  
  const applyButton = document.createElement('button');
  applyButton.id = 'adv-search-apply';
  applyButton.textContent = 'Apply Filters';
  searchActions.appendChild(applyButton);
  
  const saveButton = document.createElement('button');
  saveButton.id = 'adv-search-save';
  saveButton.textContent = 'Save Search';
  searchActions.appendChild(saveButton);
  
  const resetButton = document.createElement('button');
  resetButton.id = 'adv-search-reset';
  resetButton.textContent = 'Reset';
  searchActions.appendChild(resetButton);
  
  panel.appendChild(searchActions);
  
  return panel;
}

/**
 * Creates a search field element
 * 
 * @param {string} id - The field ID
 * @param {string} label - The field label
 * @param {string} type - The field type (text, number, date, select)
 * @param {Array} [options] - Options for select fields
 * @param {*} [defaultValue] - Default value for the field
 * @returns {HTMLElement} The search field element
 */
function createSearchField(id, label, type, options = null, defaultValue = null) {
  const field = document.createElement('div');
  field.className = 'search-field';
  
  const fieldLabel = document.createElement('label');
  fieldLabel.setAttribute('for', `adv-search-${id}`);
  fieldLabel.textContent = label;
  field.appendChild(fieldLabel);
  
  let input;
  
  if (type === 'select' && options) {
    input = document.createElement('select');
    
    options.forEach(option => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      input.appendChild(optionEl);
    });
  } else {
    input = document.createElement('input');
    input.type = type;
    
    if (type === 'number') {
      input.min = 0;
    }
  }
  
  input.id = `adv-search-${id}`;
  input.name = id;
  
  if (defaultValue !== null) {
    input.value = defaultValue;
  }
  
  field.appendChild(input);
  
  return field;
}

/**
 * Creates and returns a saved searches modal
 * 
 * @param {Array} savedSearches - List of saved searches
 * @param {Function} onApply - Callback when a saved search is applied
 * @param {Function} onDelete - Callback when a saved search is deleted
 * @returns {HTMLElement} The saved searches modal
 */
function createSavedSearchesModal(savedSearches, onApply, onDelete) {
  const modal = document.createElement('div');
  modal.className = 'saved-searches-modal';
  modal.style.display = 'none'; // Hidden by default
  
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  
  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = 'Saved Searches';
  modalHeader.appendChild(modalTitle);
  
  const closeButton = document.createElement('button');
  closeButton.className = 'close-btn';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modalHeader.appendChild(closeButton);
  
  modalContent.appendChild(modalHeader);
  
  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';
  
  const searchesList = document.createElement('div');
  searchesList.className = 'saved-searches-list';
  
  if (!savedSearches || savedSearches.length === 0) {
    const noSearches = document.createElement('div');
    noSearches.className = 'no-data';
    noSearches.textContent = 'No saved searches found';
    searchesList.appendChild(noSearches);
  } else {
    savedSearches.forEach(search => {
      const searchItem = createSavedSearchItem(search, onApply, onDelete);
      searchesList.appendChild(searchItem);
    });
  }
  
  modalBody.appendChild(searchesList);
  modalContent.appendChild(modalBody);
  
  modal.appendChild(modalContent);
  
  return modal;
}

/**
 * Creates a saved search item for the modal
 * 
 * @param {Object} search - The saved search
 * @param {Function} onApply - Callback when the search is applied
 * @param {Function} onDelete - Callback when the search is deleted
 * @returns {HTMLElement} The saved search item
 */
function createSavedSearchItem(search, onApply, onDelete) {
  const item = document.createElement('div');
  item.className = 'saved-search-item';
  
  // Search info
  const searchInfo = document.createElement('div');
  searchInfo.className = 'saved-search-info';
  
  const searchName = document.createElement('h4');
  searchName.textContent = search.name;
  searchInfo.appendChild(searchName);
  
  const saveDate = document.createElement('span');
  saveDate.className = 'saved-date';
  saveDate.textContent = new Date(search.timestamp).toLocaleString();
  searchInfo.appendChild(saveDate);
  
  // Add criteria details
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'View search criteria';
  details.appendChild(summary);
  
  const criteriaList = document.createElement('div');
  criteriaList.className = 'criteria-list';
  
  Object.entries(search.criteria).forEach(([key, value]) => {
    if (value && value !== '') {
      const criteriaItem = document.createElement('div');
      criteriaItem.className = 'criteria-item';
      criteriaItem.textContent = `${key}: ${value}`;
      criteriaList.appendChild(criteriaItem);
    }
  });
  
  details.appendChild(criteriaList);
  searchInfo.appendChild(details);
  
  item.appendChild(searchInfo);
  
  // Search actions
  const searchActions = document.createElement('div');
  searchActions.className = 'saved-search-actions';
  
  const applyButton = document.createElement('button');
  applyButton.className = 'apply-search-btn';
  applyButton.textContent = 'Apply';
  applyButton.addEventListener('click', () => onApply(search));
  searchActions.appendChild(applyButton);
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-search-btn';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => onDelete(search.id));
  searchActions.appendChild(deleteButton);
  
  item.appendChild(searchActions);
  
  return item;
}

/**
 * Creates and returns a search history modal
 * 
 * @param {Array} searchHistory - List of search history items
 * @param {Function} onApply - Callback when a history item is applied
 * @param {Function} onDelete - Callback when a history item is deleted
 * @param {Function} onClear - Callback when all history is cleared
 * @returns {HTMLElement} The search history modal
 */
function createSearchHistoryModal(searchHistory, onApply, onDelete, onClear) {
  const modal = document.createElement('div');
  modal.className = 'search-history-modal';
  modal.style.display = 'none'; // Hidden by default
  
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  
  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = 'Search History';
  modalHeader.appendChild(modalTitle);
  
  const closeButton = document.createElement('button');
  closeButton.className = 'close-btn';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modalHeader.appendChild(closeButton);
  
  modalContent.appendChild(modalHeader);
  
  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';
  
  const historyList = document.createElement('div');
  historyList.className = 'search-history-list';
  
  if (!searchHistory || searchHistory.length === 0) {
    const noHistory = document.createElement('div');
    noHistory.className = 'no-history';
    noHistory.textContent = 'No search history found';
    historyList.appendChild(noHistory);
  } else {
    searchHistory.forEach(historyItem => {
      const item = createHistoryItem(historyItem, onApply, onDelete);
      historyList.appendChild(item);
    });
  }
  
  modalBody.appendChild(historyList);
  modalContent.appendChild(modalBody);
  
  // Modal footer
  if (searchHistory && searchHistory.length > 0) {
    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';
    
    const clearButton = document.createElement('button');
    clearButton.className = 'clear-history-btn';
    clearButton.textContent = 'Clear All History';
    clearButton.addEventListener('click', onClear);
    modalFooter.appendChild(clearButton);
    
    modalContent.appendChild(modalFooter);
  }
  
  modal.appendChild(modalContent);
  
  return modal;
}

/**
 * Creates a history item for the modal
 * 
 * @param {Object} historyItem - The history item
 * @param {Function} onApply - Callback when the history is applied
 * @param {Function} onDelete - Callback when the history is deleted
 * @returns {HTMLElement} The history item
 */
function createHistoryItem(historyItem, onApply, onDelete) {
  const item = document.createElement('div');
  item.className = 'search-history-item';
  
  // History info
  const historyInfo = document.createElement('div');
  historyInfo.className = 'search-history-info';
  
  const historyHeader = document.createElement('div');
  historyHeader.className = 'search-history-header';
  
  const searchQuery = document.createElement('div');
  searchQuery.className = 'search-query';
  searchQuery.textContent = historyItem.query || 'Advanced Search';
  historyHeader.appendChild(searchQuery);
  
  const searchDate = document.createElement('div');
  searchDate.className = 'search-date';
  searchDate.textContent = new Date(historyItem.timestamp).toLocaleString();
  historyHeader.appendChild(searchDate);
  
  historyInfo.appendChild(historyHeader);
  
  const resultCount = document.createElement('div');
  resultCount.className = 'search-result-count';
  resultCount.textContent = `${historyItem.resultCount || 0} results found`;
  historyInfo.appendChild(resultCount);
  
  // Add filter criteria if available
  if (historyItem.criteria && Object.keys(historyItem.criteria).length > 0) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'View search filters';
    details.appendChild(summary);
    
    const criteriaList = document.createElement('ul');
    criteriaList.className = 'filter-criteria-list';
    
    Object.entries(historyItem.criteria).forEach(([key, value]) => {
      if (value && value !== '') {
        const criteriaItem = document.createElement('li');
        criteriaItem.textContent = `${key}: ${value}`;
        criteriaList.appendChild(criteriaItem);
      }
    });
    
    details.appendChild(criteriaList);
    historyInfo.appendChild(details);
  }
  
  item.appendChild(historyInfo);
  
  // History actions
  const historyActions = document.createElement('div');
  historyActions.className = 'search-history-actions';
  
  const applyButton = document.createElement('button');
  applyButton.className = 'apply-history-btn';
  applyButton.textContent = 'Run Again';
  applyButton.addEventListener('click', () => onApply(historyItem));
  historyActions.appendChild(applyButton);
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-history-btn';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => onDelete(historyItem.id));
  historyActions.appendChild(deleteButton);
  
  item.appendChild(historyActions);
  
  return item;
}

/**
 * Creates an active filters indicator
 * 
 * @param {Object} criteria - The filter criteria
 * @param {Function} onClear - Callback when filters are cleared
 * @returns {HTMLElement} The active filters indicator
 */
function createActiveFiltersIndicator(criteria, onClear) {
  const activeCount = Object.values(criteria).filter(value => value && value !== '').length;
  
  if (activeCount === 0) {
    return null;
  }
  
  const indicator = document.createElement('div');
  indicator.className = 'active-filters';
  indicator.textContent = `${activeCount} active filter${activeCount !== 1 ? 's' : ''}`;
  
  const clearButton = document.createElement('button');
  clearButton.textContent = '×';
  clearButton.title = 'Clear all filters';
  clearButton.addEventListener('click', onClear);
  
  indicator.appendChild(clearButton);
  
  return indicator;
}

/**
 * Collects search criteria from the advanced search form
 * 
 * @returns {Object} The search criteria
 */
function collectSearchCriteria() {
  const criteria = {};
  
  // Collect field values
  document.querySelectorAll('.search-field input, .search-field select').forEach(field => {
    if (field.name && field.value !== '') {
      criteria[field.name] = field.value;
    }
  });
  
  // Handle special case for visual content detection
  // If visual content is true, automatically include image and video mime types
  if (criteria.visual_content === 'true' && !criteria.mimetype) {
    criteria.mimetype = '(image/|video/)';
  }
  
  // Handle content_type to mimetype mapping if mimetype is not already specified
  if (criteria.content_type && !criteria.mimetype) {
    switch (criteria.content_type) {
      case 'image':
        criteria.mimetype = 'image/';
        break;
      case 'video':
        criteria.mimetype = 'video/';
        break;
      case 'audio':
        criteria.mimetype = 'audio/';
        break;
      case 'document':
        criteria.mimetype = '(application/pdf|text/|application/msword|application/vnd.openxmlformats)';
        break;
      case 'dataset':
        criteria.mimetype = '(application/json|text/csv|application/x-parquet|application/x-arrow)';
        break;
      case 'model':
        criteria.mimetype = '(application/octet-stream|application/x-safetensors|application/x-onnx)';
        break;
      case 'code':
        criteria.mimetype = '(text/x-|application/x-|text/plain)';
        break;
    }
  }
  
  return criteria;
}

/**
 * Applies search criteria to the advanced search form
 * 
 * @param {Object} criteria - The search criteria to apply
 */
function applySearchCriteria(criteria) {
  // Reset form first
  document.querySelectorAll('.search-field input, .search-field select').forEach(field => {
    if (field.type === 'select-one') {
      field.selectedIndex = 0;
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      field.checked = false;
    } else {
      field.value = '';
    }
  });
  
  // Apply criteria
  Object.entries(criteria).forEach(([key, value]) => {
    const field = document.getElementById(`adv-search-${key}`);
    if (field) {
      if (field.type === 'checkbox') {
        field.checked = value === 'true';
      } else {
        field.value = value;
      }
    }
  });
}

/**
 * Shows the save search dialog
 * 
 * @param {Object} criteria - The search criteria to save
 * @param {Function} onSave - Callback when the search is saved
 */
function showSaveSearchDialog(criteria, onSave) {
  // Create a modal for saving
  const modal = document.createElement('div');
  modal.className = 'modal';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  
  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = 'Save Search';
  modalHeader.appendChild(modalTitle);
  
  const closeButton = document.createElement('button');
  closeButton.className = 'modal-close';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modalHeader.appendChild(closeButton);
  
  modalContent.appendChild(modalHeader);
  
  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';
  
  const form = document.createElement('div');
  
  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  
  const nameLabel = document.createElement('label');
  nameLabel.setAttribute('for', 'save-search-name');
  nameLabel.textContent = 'Search Name';
  nameGroup.appendChild(nameLabel);
  
  const nameInput = document.createElement('input');
  nameInput.id = 'save-search-name';
  nameInput.type = 'text';
  nameInput.placeholder = 'Enter a name for this search';
  nameInput.required = true;
  nameGroup.appendChild(nameInput);
  
  form.appendChild(nameGroup);
  
  const descGroup = document.createElement('div');
  descGroup.className = 'form-group';
  
  const descLabel = document.createElement('label');
  descLabel.setAttribute('for', 'save-search-desc');
  descLabel.textContent = 'Description (optional)';
  descGroup.appendChild(descLabel);
  
  const descInput = document.createElement('textarea');
  descInput.id = 'save-search-desc';
  descInput.placeholder = 'Enter a description for this search';
  descGroup.appendChild(descInput);
  
  form.appendChild(descGroup);
  
  modalBody.appendChild(form);
  modalContent.appendChild(modalBody);
  
  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';
  
  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-btn';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modalFooter.appendChild(cancelButton);
  
  const saveButton = document.createElement('button');
  saveButton.className = 'primary-btn';
  saveButton.textContent = 'Save Search';
  saveButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.classList.add('error');
      return;
    }
    
    onSave({
      name,
      description: descInput.value.trim(),
      criteria,
      timestamp: Date.now()
    });
    
    document.body.removeChild(modal);
  });
  modalFooter.appendChild(saveButton);
  
  modalContent.appendChild(modalFooter);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Focus the name input
  nameInput.focus();
}

/**
 * Enhances search results with visual indicators for thumbnails
 * 
 * @param {Array} results - The search results 
 * @param {Function} thumbnailGenerator - Function to generate thumbnails
 * @param {Object} options - Configuration options
 * @returns {Array} Enhanced search results
 */
function enhanceSearchResultsWithThumbnails(results, thumbnailGenerator, options = {}) {
  if (!results || !Array.isArray(results) || !thumbnailGenerator) {
    return results;
  }

  const enhanced = results.map(item => {
    // Skip if the item is already enhanced
    if (item._thumbnailEnhanced) {
      return item;
    }

    const mimetype = item.mimetype || '';
    const isVisualContent = mimetype.startsWith('image/') || mimetype.startsWith('video/');
    const isPDF = mimetype === 'application/pdf';
    
    // Add thumbnail information
    const enhancedItem = {
      ...item,
      _thumbnailEnhanced: true,
      isVisualContent,
      isPDF,
      hasThumbnail: isVisualContent || isPDF,
      // Generate placeholder thumbnail data that the thumbnail system can use
      thumbnailData: {
        cid: item.cid,
        mimetype,
        path: item.path || '',
        isVisual: isVisualContent,
        isPDF
      }
    };
    
    return enhancedItem;
  });
  
  return enhanced;
}

/**
 * Creates an enhanced search results view with thumbnails
 * 
 * @param {Array} results - The search results
 * @param {Function} thumbnailGenerator - Function to generate thumbnails
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} The enhanced search results view
 */
function createEnhancedSearchResultsView(results, thumbnailGenerator, options = {}) {
  const container = document.createElement('div');
  container.className = 'enhanced-search-results';
  
  if (!results || !Array.isArray(results) || results.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.textContent = 'No results found';
    container.appendChild(noResults);
    return container;
  }
  
  // Determine view mode - grid or list
  const viewMode = options.viewMode || 'list';
  container.classList.add(`view-mode-${viewMode}`);
  
  // Enhance results with thumbnail information
  const enhancedResults = enhanceSearchResultsWithThumbnails(results, thumbnailGenerator, options);
  
  if (viewMode === 'grid') {
    // Create grid view for visual content
    const grid = document.createElement('div');
    grid.className = 'results-grid';
    
    enhancedResults.forEach(item => {
      const gridItem = document.createElement('div');
      gridItem.className = 'grid-item';
      gridItem.dataset.cid = item.cid;
      
      // Create thumbnail container
      const thumbnailContainer = document.createElement('div');
      thumbnailContainer.className = 'thumbnail-container';
      
      if (item.hasThumbnail && thumbnailGenerator) {
        // Use thumbnail generator if available
        const thumbnail = thumbnailGenerator(
          item.cid, 
          item.mimetype, 
          item.path || '', 
          options.thumbnailOptions || {}
        );
        
        if (thumbnail) {
          thumbnailContainer.appendChild(thumbnail);
        } else {
          // Fallback if thumbnail generation fails
          const placeholder = document.createElement('div');
          placeholder.className = 'thumbnail-placeholder';
          placeholder.innerHTML = '<i class="fas fa-file"></i>';
          thumbnailContainer.appendChild(placeholder);
        }
      } else {
        // Fallback for non-visual content
        const placeholder = document.createElement('div');
        placeholder.className = 'thumbnail-placeholder';
        placeholder.innerHTML = '<i class="fas fa-file"></i>';
        thumbnailContainer.appendChild(placeholder);
      }
      
      gridItem.appendChild(thumbnailContainer);
      
      // Add metadata
      const itemMeta = document.createElement('div');
      itemMeta.className = 'item-metadata';
      
      const itemName = document.createElement('div');
      itemName.className = 'item-name';
      itemName.textContent = item.name || item.path?.split('/').pop() || item.cid.substring(0, 10) + '...';
      itemMeta.appendChild(itemName);
      
      const itemSize = document.createElement('div');
      itemSize.className = 'item-size';
      itemSize.textContent = formatSize(item.size || 0);
      itemMeta.appendChild(itemSize);
      
      gridItem.appendChild(itemMeta);
      
      // Add click handler
      gridItem.addEventListener('click', () => {
        if (options.onItemClick) {
          options.onItemClick(item);
        }
      });
      
      grid.appendChild(gridItem);
    });
    
    container.appendChild(grid);
  } else {
    // Create list view for all content
    const list = document.createElement('div');
    list.className = 'results-list';
    
    enhancedResults.forEach(item => {
      const listItem = document.createElement('div');
      listItem.className = 'list-item';
      listItem.dataset.cid = item.cid;
      
      // Create thumbnail if applicable
      if (options.showThumbnailsInList !== false && thumbnailGenerator) {
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'item-thumbnail';
        
        if (item.hasThumbnail) {
          // Use thumbnail generator
          const thumbnail = thumbnailGenerator(
            item.cid, 
            item.mimetype, 
            item.path || '', 
            { thumbnailSize: 'small', ...options.thumbnailOptions }
          );
          
          if (thumbnail) {
            thumbnailContainer.appendChild(thumbnail);
          } else {
            // Fallback if thumbnail generation fails
            const icon = document.createElement('i');
            icon.className = 'fas fa-file';
            thumbnailContainer.appendChild(icon);
          }
        } else {
          // Fallback for non-visual content
          const icon = document.createElement('i');
          icon.className = 'fas fa-file';
          thumbnailContainer.appendChild(icon);
        }
        
        listItem.appendChild(thumbnailContainer);
      }
      
      // Add metadata
      const itemContent = document.createElement('div');
      itemContent.className = 'item-content';
      
      const itemHeader = document.createElement('div');
      itemHeader.className = 'item-header';
      
      const itemName = document.createElement('div');
      itemName.className = 'item-name';
      itemName.textContent = item.name || item.path?.split('/').pop() || item.cid.substring(0, 16) + '...';
      itemHeader.appendChild(itemName);
      
      const itemType = document.createElement('div');
      itemType.className = 'item-type';
      itemType.textContent = item.mimetype || 'Unknown';
      itemHeader.appendChild(itemType);
      
      itemContent.appendChild(itemHeader);
      
      const itemDetails = document.createElement('div');
      itemDetails.className = 'item-details';
      
      const cidElem = document.createElement('div');
      cidElem.className = 'item-cid';
      cidElem.textContent = `CID: ${item.cid}`;
      itemDetails.appendChild(cidElem);
      
      const pathElem = document.createElement('div');
      pathElem.className = 'item-path';
      pathElem.textContent = `Path: ${item.path || 'N/A'}`;
      itemDetails.appendChild(pathElem);
      
      const sizeElem = document.createElement('div');
      sizeElem.className = 'item-size';
      sizeElem.textContent = `Size: ${formatSize(item.size || 0)}`;
      itemDetails.appendChild(sizeElem);
      
      itemContent.appendChild(itemDetails);
      listItem.appendChild(itemContent);
      
      // Add actions
      const itemActions = document.createElement('div');
      itemActions.className = 'item-actions';
      
      const viewButton = document.createElement('button');
      viewButton.className = 'item-view-btn';
      viewButton.innerHTML = '<i class="fas fa-eye"></i>';
      viewButton.title = 'View details';
      viewButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.onItemView) {
          options.onItemView(item);
        }
      });
      itemActions.appendChild(viewButton);
      
      listItem.appendChild(itemActions);
      
      // Add click handler for the whole item
      listItem.addEventListener('click', () => {
        if (options.onItemClick) {
          options.onItemClick(item);
        }
      });
      
      list.appendChild(listItem);
    });
    
    container.appendChild(list);
  }
  
  return container;
}

/**
 * Formats a file size in bytes to a human-readable string
 * 
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Creates a detailed content inspection panel
 * 
 * @param {Object} content - The content object with metadata
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} The detail panel element
 */
function createContentDetailPanel(content, options = {}) {
  if (!content) {
    return createEmptyDetailPanel('No content selected');
  }

  // Create the main container
  const container = document.createElement('div');
  container.className = 'content-detail-panel';
  container.dataset.cid = content.cid;

  // Create top section with preview
  const topSection = document.createElement('div');
  topSection.className = 'detail-top-section';

  // Create content preview
  const previewContainer = document.createElement('div');
  previewContainer.className = 'content-preview-container';

  const previewElement = createContentPreview(content, options);
  previewContainer.appendChild(previewElement);
  
  topSection.appendChild(previewContainer);

  // Create info panel
  const infoPanel = document.createElement('div');
  infoPanel.className = 'content-info-panel';

  // Basic information section
  const basicInfo = document.createElement('div');
  basicInfo.className = 'basic-info-section';

  // Content name/title
  const titleElement = document.createElement('h3');
  titleElement.className = 'content-title';
  titleElement.textContent = content.name || content.path?.split('/').pop() || content.cid.substring(0, 10) + '...';
  basicInfo.appendChild(titleElement);

  // Content type
  const typeElement = document.createElement('div');
  typeElement.className = 'content-type';
  typeElement.innerHTML = `<span class="info-label">Type:</span> <span class="info-value">${content.mimetype || 'Unknown'}</span>`;
  basicInfo.appendChild(typeElement);

  // Content size
  const sizeElement = document.createElement('div');
  sizeElement.className = 'content-size';
  sizeElement.innerHTML = `<span class="info-label">Size:</span> <span class="info-value">${formatSize(content.size || 0)}</span>`;
  basicInfo.appendChild(sizeElement);

  // Date added/modified
  if (content.timestamp) {
    const dateElement = document.createElement('div');
    dateElement.className = 'content-date';
    dateElement.innerHTML = `<span class="info-label">Added:</span> <span class="info-value">${new Date(content.timestamp).toLocaleString()}</span>`;
    basicInfo.appendChild(dateElement);
  }

  infoPanel.appendChild(basicInfo);
  topSection.appendChild(infoPanel);
  container.appendChild(topSection);

  // Create tabs for detailed information
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'detail-tabs';

  const tabButtons = document.createElement('div');
  tabButtons.className = 'tab-buttons';

  const metadataTabButton = document.createElement('button');
  metadataTabButton.className = 'tab-button active';
  metadataTabButton.textContent = 'Metadata';
  metadataTabButton.dataset.tab = 'metadata';
  tabButtons.appendChild(metadataTabButton);

  const locationTabButton = document.createElement('button');
  locationTabButton.className = 'tab-button';
  locationTabButton.textContent = 'Locations';
  locationTabButton.dataset.tab = 'locations';
  tabButtons.appendChild(locationTabButton);

  const previewTabButton = document.createElement('button');
  previewTabButton.className = 'tab-button';
  previewTabButton.textContent = 'Preview Options';
  previewTabButton.dataset.tab = 'preview';
  tabButtons.appendChild(previewTabButton);

  if (content.tags && content.tags.length > 0) {
    const tagsTabButton = document.createElement('button');
    tagsTabButton.className = 'tab-button';
    tagsTabButton.textContent = 'Tags';
    tagsTabButton.dataset.tab = 'tags';
    tabButtons.appendChild(tagsTabButton);
  }

  tabsContainer.appendChild(tabButtons);

  // Tab content
  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';

  // Metadata tab (active by default)
  const metadataTab = document.createElement('div');
  metadataTab.className = 'tab-pane active';
  metadataTab.dataset.tab = 'metadata';
  metadataTab.appendChild(createMetadataTable(content));
  tabContent.appendChild(metadataTab);

  // Locations tab
  const locationsTab = document.createElement('div');
  locationsTab.className = 'tab-pane';
  locationsTab.dataset.tab = 'locations';
  locationsTab.appendChild(createLocationsPanel(content));
  tabContent.appendChild(locationsTab);

  // Preview options tab
  const previewTab = document.createElement('div');
  previewTab.className = 'tab-pane';
  previewTab.dataset.tab = 'preview';
  previewTab.appendChild(createPreviewOptionsPanel(content, options));
  tabContent.appendChild(previewTab);

  // Tags tab (if available)
  if (content.tags && content.tags.length > 0) {
    const tagsTab = document.createElement('div');
    tagsTab.className = 'tab-pane';
    tagsTab.dataset.tab = 'tags';
    tagsTab.appendChild(createTagsPanel(content.tags));
    tabContent.appendChild(tagsTab);
  }

  tabsContainer.appendChild(tabContent);
  container.appendChild(tabsContainer);

  // Add action buttons
  const actionBar = document.createElement('div');
  actionBar.className = 'detail-action-bar';

  // IPFS Gateway button
  if (content.cid) {
    const gatewayButton = document.createElement('button');
    gatewayButton.className = 'action-button gateway-button';
    gatewayButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Open in IPFS Gateway';
    gatewayButton.addEventListener('click', () => {
      const gateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
      window.open(`${gateway}${content.cid}`, '_blank');
    });
    actionBar.appendChild(gatewayButton);
  }

  // Copy CID button
  const copyButton = document.createElement('button');
  copyButton.className = 'action-button copy-button';
  copyButton.innerHTML = '<i class="fas fa-clipboard"></i> Copy CID';
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(content.cid).then(
      () => {
        // Show success indicator
        copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
          copyButton.innerHTML = '<i class="fas fa-clipboard"></i> Copy CID';
        }, 2000);
      },
      () => {
        // Show failure indicator
        copyButton.innerHTML = '<i class="fas fa-times"></i> Failed to copy';
        setTimeout(() => {
          copyButton.innerHTML = '<i class="fas fa-clipboard"></i> Copy CID';
        }, 2000);
      }
    );
  });
  actionBar.appendChild(copyButton);

  // Close button
  const closeButton = document.createElement('button');
  closeButton.className = 'action-button close-button';
  closeButton.innerHTML = '<i class="fas fa-times"></i> Close';
  closeButton.addEventListener('click', () => {
    if (options.onClose) {
      options.onClose();
    }
  });
  actionBar.appendChild(closeButton);

  container.appendChild(actionBar);

  // Add tab switching functionality
  tabButtons.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs and buttons
      tabButtons.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      tabContent.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      // Add active class to selected tab and button
      button.classList.add('active');
      const tabName = button.dataset.tab;
      tabContent.querySelector(`.tab-pane[data-tab="${tabName}"]`)?.classList.add('active');
    });
  });

  return container;
}

/**
 * Creates an empty detail panel with a message
 * 
 * @param {string} message - The message to display
 * @returns {HTMLElement} The empty detail panel
 */
function createEmptyDetailPanel(message = 'No content selected') {
  const container = document.createElement('div');
  container.className = 'content-detail-panel empty';

  const emptyContainer = document.createElement('div');
  emptyContainer.className = 'empty-detail-container';

  const icon = document.createElement('i');
  icon.className = 'fas fa-info-circle empty-icon';
  emptyContainer.appendChild(icon);

  const messageElement = document.createElement('p');
  messageElement.className = 'empty-message';
  messageElement.textContent = message;
  emptyContainer.appendChild(messageElement);

  container.appendChild(emptyContainer);
  return container;
}

/**
 * Creates a content preview based on content type
 * 
 * @param {Object} content - The content object
 * @param {Object} options - Preview options
 * @returns {HTMLElement} The preview element
 */
function createContentPreview(content, options = {}) {
  const container = document.createElement('div');
  container.className = 'content-preview';

  if (!content || !content.cid) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.innerHTML = '<i class="fas fa-file"></i><p>Preview not available</p>';
    container.appendChild(placeholder);
    return container;
  }

  const mimetype = content.mimetype || '';
  const ipfsGateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
  const contentUrl = `${ipfsGateway}${content.cid}`;

  // Image preview
  if (mimetype.startsWith('image/')) {
    const img = document.createElement('img');
    img.className = 'image-preview';
    img.src = contentUrl;
    img.alt = content.name || content.cid;
    img.addEventListener('error', () => {
      img.src = ''; // Clear the errored image
      img.alt = 'Image failed to load';
      img.classList.add('preview-error');
    });
    container.appendChild(img);
  } 
  // Video preview
  else if (mimetype.startsWith('video/')) {
    const video = document.createElement('video');
    video.className = 'video-preview';
    video.controls = true;
    video.preload = 'metadata';
    
    const source = document.createElement('source');
    source.src = contentUrl;
    source.type = mimetype;
    video.appendChild(source);
    
    const fallback = document.createElement('p');
    fallback.textContent = 'Your browser does not support the video tag.';
    video.appendChild(fallback);
    
    container.appendChild(video);
  }
  // Audio preview
  else if (mimetype.startsWith('audio/')) {
    const audio = document.createElement('audio');
    audio.className = 'audio-preview';
    audio.controls = true;
    
    const source = document.createElement('source');
    source.src = contentUrl;
    source.type = mimetype;
    audio.appendChild(source);
    
    const fallback = document.createElement('p');
    fallback.textContent = 'Your browser does not support the audio tag.';
    audio.appendChild(fallback);
    
    container.appendChild(audio);
  }
  // PDF preview
  else if (mimetype === 'application/pdf') {
    const frame = document.createElement('iframe');
    frame.className = 'pdf-preview';
    frame.src = contentUrl;
    frame.title = 'PDF Preview';
    frame.setAttribute('frameborder', '0');
    
    container.appendChild(frame);
  }
  // Text/code preview
  else if (mimetype.startsWith('text/') || 
           mimetype === 'application/json' || 
           mimetype.includes('javascript') || 
           mimetype.includes('xml')) {
    // For text content, we'll add a placeholder and let the system
    // load the actual content via a fetch operation
    const preElement = document.createElement('pre');
    preElement.className = 'text-preview';
    
    const codeElement = document.createElement('code');
    codeElement.textContent = 'Loading content...';
    preElement.appendChild(codeElement);
    
    container.appendChild(preElement);
    
    // In a real implementation, we would fetch the content here
    // For this example, we'll just simulate it with a timeout
    setTimeout(() => {
      if (options.textContentLoader) {
        options.textContentLoader(content.cid, (text) => {
          codeElement.textContent = text;
        });
      } else {
        codeElement.textContent = 'Text preview not available. Configure a text content loader.';
      }
    }, 500);
  }
  // Default placeholder for other types
  else {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    
    const icon = document.createElement('i');
    icon.className = getIconClassForMimetype(mimetype);
    placeholder.appendChild(icon);
    
    const text = document.createElement('p');
    text.textContent = `Preview not available for ${mimetype || 'unknown'} content type`;
    placeholder.appendChild(text);
    
    container.appendChild(placeholder);
  }

  return container;
}

/**
 * Creates a metadata table for the content
 * 
 * @param {Object} content - The content object
 * @returns {HTMLElement} The metadata table
 */
function createMetadataTable(content) {
  const table = document.createElement('table');
  table.className = 'metadata-table';

  // Add rows for each metadata field
  const fields = [
    { label: 'Content ID (CID)', value: content.cid },
    { label: 'Path', value: content.path },
    { label: 'MIME Type', value: content.mimetype || 'Unknown' },
    { label: 'Size', value: formatSize(content.size || 0) },
    { label: 'Added Date', value: content.timestamp ? new Date(content.timestamp).toLocaleString() : 'Unknown' },
    { label: 'Pinned', value: content.pinned ? 'Yes' : 'No' },
    { label: 'Pin Status', value: content.pinStatus || 'Unknown' }
  ];

  // Add multi-hash information if available
  if (content.multiHash) {
    fields.push(
      { label: 'Hash Type', value: content.multiHash.hashType || 'Unknown' },
      { label: 'Hash Function', value: content.multiHash.hashFunction || 'Unknown' },
      { label: 'Hash Length', value: content.multiHash.hashLength || 'Unknown' }
    );
  }
  
  // Add block information if available
  if (content.blocks !== undefined) {
    fields.push({ label: 'Block Count', value: content.blocks });
  }

  // Create table body
  const tbody = document.createElement('tbody');
  
  fields.forEach(field => {
    if (field.value !== undefined && field.value !== null) {
      const row = document.createElement('tr');
      
      const labelCell = document.createElement('td');
      labelCell.className = 'metadata-label';
      labelCell.textContent = field.label;
      row.appendChild(labelCell);
      
      const valueCell = document.createElement('td');
      valueCell.className = 'metadata-value';
      
      // For CID, add copy functionality
      if (field.label === 'Content ID (CID)') {
        const cidContainer = document.createElement('div');
        cidContainer.className = 'cid-container';
        
        const cidValue = document.createElement('span');
        cidValue.textContent = field.value;
        cidContainer.appendChild(cidValue);
        
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-cid-btn';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.title = 'Copy CID';
        copyButton.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(field.value);
          
          // Show success indicator
          copyButton.innerHTML = '<i class="fas fa-check"></i>';
          setTimeout(() => {
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
          }, 2000);
        });
        
        cidContainer.appendChild(copyButton);
        valueCell.appendChild(cidContainer);
      } else {
        valueCell.textContent = field.value;
      }
      
      row.appendChild(valueCell);
      tbody.appendChild(row);
    }
  });

  // Add custom metadata if available
  if (content.metadata && typeof content.metadata === 'object') {
    Object.entries(content.metadata).forEach(([key, value]) => {
      // Skip complex objects for direct display
      if (value !== null && typeof value === 'object') {
        return;
      }
      
      const row = document.createElement('tr');
      
      const labelCell = document.createElement('td');
      labelCell.className = 'metadata-label';
      labelCell.textContent = key;
      row.appendChild(labelCell);
      
      const valueCell = document.createElement('td');
      valueCell.className = 'metadata-value';
      valueCell.textContent = value;
      row.appendChild(valueCell);
      
      tbody.appendChild(row);
    });
  }

  table.appendChild(tbody);
  return table;
}

/**
 * Creates a locations panel for the content
 * 
 * @param {Object} content - The content object
 * @returns {HTMLElement} The locations panel
 */
function createLocationsPanel(content) {
  const panel = document.createElement('div');
  panel.className = 'locations-panel';

  // Handle case with no locations
  if (!content.locations || Object.keys(content.locations).length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'no-locations-message';
    emptyMessage.textContent = 'No location information available for this content.';
    panel.appendChild(emptyMessage);
    return panel;
  }

  // Create location entries
  Object.entries(content.locations).forEach(([locationName, locationInfo]) => {
    const locationCard = document.createElement('div');
    locationCard.className = 'location-card';
    
    // Location header
    const locationHeader = document.createElement('div');
    locationHeader.className = 'location-header';
    
    const locationIcon = document.createElement('i');
    locationIcon.className = getLocationIconClass(locationName);
    locationHeader.appendChild(locationIcon);
    
    const locationTitle = document.createElement('h4');
    locationTitle.textContent = formatLocationName(locationName);
    locationHeader.appendChild(locationTitle);
    
    locationCard.appendChild(locationHeader);
    
    // Location details
    const locationDetails = document.createElement('div');
    locationDetails.className = 'location-details';
    
    if (typeof locationInfo === 'object') {
      // Handle structured location data
      Object.entries(locationInfo).forEach(([key, value]) => {
        const detailRow = document.createElement('div');
        detailRow.className = 'location-detail-row';
        
        const detailLabel = document.createElement('span');
        detailLabel.className = 'detail-label';
        detailLabel.textContent = formatDetailLabel(key);
        detailRow.appendChild(detailLabel);
        
        const detailValue = document.createElement('span');
        detailValue.className = 'detail-value';
        
        // Handle different value types
        if (typeof value === 'object') {
          detailValue.textContent = JSON.stringify(value);
        } else {
          detailValue.textContent = value;
        }
        
        detailRow.appendChild(detailValue);
        locationDetails.appendChild(detailRow);
      });
    } else {
      // Handle simple location string
      const detailRow = document.createElement('div');
      detailRow.className = 'location-detail-row';
      
      const detailValue = document.createElement('span');
      detailValue.className = 'detail-value';
      detailValue.textContent = locationInfo;
      
      detailRow.appendChild(detailValue);
      locationDetails.appendChild(detailRow);
    }
    
    locationCard.appendChild(locationDetails);
    
    // Add buttons based on location type
    const locationActions = document.createElement('div');
    locationActions.className = 'location-actions';
    
    if (locationName === 'ipfs' || locationName === 'ipfs-cluster') {
      const gatewayButton = document.createElement('button');
      gatewayButton.className = 'location-action-btn';
      gatewayButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Open in Gateway';
      gatewayButton.addEventListener('click', () => {
        const gateway = 'https://ipfs.io/ipfs/';
        window.open(`${gateway}${content.cid}`, '_blank');
      });
      locationActions.appendChild(gatewayButton);
    }
    
    if (locationName === 'huggingface') {
      const repoId = locationInfo.repo_id;
      const path = locationInfo.path;
      
      if (repoId) {
        const hfButton = document.createElement('button');
        hfButton.className = 'location-action-btn';
        hfButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Open on HuggingFace';
        hfButton.addEventListener('click', () => {
          const url = path 
            ? `https://huggingface.co/${repoId}/blob/main/${path}`
            : `https://huggingface.co/${repoId}`;
          window.open(url, '_blank');
        });
        locationActions.appendChild(hfButton);
      }
    }
    
    if (locationName === 's3') {
      const s3Button = document.createElement('button');
      s3Button.className = 'location-action-btn';
      s3Button.innerHTML = '<i class="fas fa-info-circle"></i> View S3 Details';
      s3Button.addEventListener('click', () => {
        // Here you would add functionality to view S3 details
        // For demo purposes, we'll just show an alert
        alert('S3 location details: ' + JSON.stringify(locationInfo));
      });
      locationActions.appendChild(s3Button);
    }
    
    if (locationActions.children.length > 0) {
      locationCard.appendChild(locationActions);
    }
    
    panel.appendChild(locationCard);
  });

  return panel;
}

/**
 * Creates a preview options panel
 * 
 * @param {Object} content - The content object
 * @param {Object} options - Current preview options
 * @returns {HTMLElement} The preview options panel
 */
function createPreviewOptionsPanel(content, options = {}) {
  const panel = document.createElement('div');
  panel.className = 'preview-options-panel';

  // Gateway selection
  const gatewaySection = document.createElement('div');
  gatewaySection.className = 'option-section';
  
  const gatewayLabel = document.createElement('label');
  gatewayLabel.textContent = 'IPFS Gateway:';
  gatewayLabel.setAttribute('for', 'ipfs-gateway-select');
  gatewaySection.appendChild(gatewayLabel);
  
  const gatewaySelect = document.createElement('select');
  gatewaySelect.id = 'ipfs-gateway-select';
  gatewaySelect.className = 'option-select';
  
  const gateways = [
    { value: 'https://ipfs.io/ipfs/', label: 'ipfs.io' },
    { value: 'https://gateway.pinata.cloud/ipfs/', label: 'Pinata' },
    { value: 'https://dweb.link/ipfs/', label: 'dweb.link' },
    { value: 'https://cloudflare-ipfs.com/ipfs/', label: 'Cloudflare' },
    { value: 'https://gateway.ipfs.io/ipfs/', label: 'gateway.ipfs.io' }
  ];
  
  gateways.forEach(gateway => {
    const option = document.createElement('option');
    option.value = gateway.value;
    option.textContent = gateway.label;
    
    if (gateway.value === (options.ipfsGateway || 'https://ipfs.io/ipfs/')) {
      option.selected = true;
    }
    
    gatewaySelect.appendChild(option);
  });
  
  // Add custom gateway option
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom Gateway...';
  gatewaySelect.appendChild(customOption);
  
  gatewaySection.appendChild(gatewaySelect);
  
  // Custom gateway input (hidden by default)
  const customGatewayInput = document.createElement('input');
  customGatewayInput.type = 'text';
  customGatewayInput.id = 'custom-gateway-input';
  customGatewayInput.className = 'custom-gateway-input';
  customGatewayInput.placeholder = 'Enter custom gateway URL';
  customGatewayInput.style.display = 'none';
  gatewaySection.appendChild(customGatewayInput);
  
  // Add gateway change event handler
  gatewaySelect.addEventListener('change', () => {
    if (gatewaySelect.value === 'custom') {
      customGatewayInput.style.display = 'block';
      customGatewayInput.focus();
    } else {
      customGatewayInput.style.display = 'none';
      
      // Trigger gateway change
      if (options.onGatewayChange) {
        options.onGatewayChange(gatewaySelect.value);
      }
    }
  });
  
  // Add custom gateway input change handler
  customGatewayInput.addEventListener('change', () => {
    let url = customGatewayInput.value.trim();
    
    // Make sure the URL ends with /ipfs/
    if (!url.endsWith('/ipfs/')) {
      url = url.endsWith('/') ? url + 'ipfs/' : url + '/ipfs/';
    }
    
    // Trigger gateway change
    if (options.onGatewayChange) {
      options.onGatewayChange(url);
    }
  });
  
  panel.appendChild(gatewaySection);

  // Preview size options (for images/videos)
  if (content.mimetype && (content.mimetype.startsWith('image/') || content.mimetype.startsWith('video/'))) {
    const sizeSection = document.createElement('div');
    sizeSection.className = 'option-section';
    
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Preview Size:';
    sizeLabel.setAttribute('for', 'preview-size-select');
    sizeSection.appendChild(sizeLabel);
    
    const sizeSelect = document.createElement('select');
    sizeSelect.id = 'preview-size-select';
    sizeSelect.className = 'option-select';
    
    const sizes = [
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' }
    ];
    
    sizes.forEach(size => {
      const option = document.createElement('option');
      option.value = size.value;
      option.textContent = size.label;
      
      if (size.value === (options.previewSize || 'medium')) {
        option.selected = true;
      }
      
      sizeSelect.appendChild(option);
    });
    
    sizeSelect.addEventListener('change', () => {
      if (options.onPreviewSizeChange) {
        options.onPreviewSizeChange(sizeSelect.value);
      }
    });
    
    sizeSection.appendChild(sizeSelect);
    panel.appendChild(sizeSection);
  }

  // Quality options for images
  if (content.mimetype && content.mimetype.startsWith('image/')) {
    const qualitySection = document.createElement('div');
    qualitySection.className = 'option-section';
    
    const qualityLabel = document.createElement('label');
    qualityLabel.textContent = 'Image Quality:';
    qualityLabel.setAttribute('for', 'quality-slider');
    qualitySection.appendChild(qualityLabel);
    
    const qualityValue = document.createElement('span');
    qualityValue.id = 'quality-value';
    qualityValue.className = 'quality-value';
    qualityValue.textContent = options.imageQuality || '90%';
    qualitySection.appendChild(qualityValue);
    
    const qualitySlider = document.createElement('input');
    qualitySlider.type = 'range';
    qualitySlider.id = 'quality-slider';
    qualitySlider.className = 'quality-slider';
    qualitySlider.min = '10';
    qualitySlider.max = '100';
    qualitySlider.step = '5';
    qualitySlider.value = options.imageQuality?.replace('%', '') || '90';
    
    qualitySlider.addEventListener('input', () => {
      qualityValue.textContent = `${qualitySlider.value}%`;
      
      if (options.onImageQualityChange) {
        options.onImageQualityChange(`${qualitySlider.value}%`);
      }
    });
    
    qualitySection.appendChild(qualitySlider);
    panel.appendChild(qualitySection);
  }

  // Auto-play options for videos and audio
  if (content.mimetype && (content.mimetype.startsWith('video/') || content.mimetype.startsWith('audio/'))) {
    const autoplaySection = document.createElement('div');
    autoplaySection.className = 'option-section checkbox-option';
    
    const autoplayCheckbox = document.createElement('input');
    autoplayCheckbox.type = 'checkbox';
    autoplayCheckbox.id = 'autoplay-checkbox';
    autoplayCheckbox.checked = options.autoPlay || false;
    
    autoplayCheckbox.addEventListener('change', () => {
      if (options.onAutoPlayChange) {
        options.onAutoPlayChange(autoplayCheckbox.checked);
      }
    });
    
    autoplaySection.appendChild(autoplayCheckbox);
    
    const autoplayLabel = document.createElement('label');
    autoplayLabel.setAttribute('for', 'autoplay-checkbox');
    autoplayLabel.textContent = 'Auto-play media';
    autoplaySection.appendChild(autoplayLabel);
    
    panel.appendChild(autoplaySection);
  }

  // Line wrap options for text/code
  if (content.mimetype && (content.mimetype.startsWith('text/') || content.mimetype === 'application/json')) {
    const wrapSection = document.createElement('div');
    wrapSection.className = 'option-section checkbox-option';
    
    const wrapCheckbox = document.createElement('input');
    wrapCheckbox.type = 'checkbox';
    wrapCheckbox.id = 'wrap-checkbox';
    wrapCheckbox.checked = options.wrapText || false;
    
    wrapCheckbox.addEventListener('change', () => {
      if (options.onWrapTextChange) {
        options.onWrapTextChange(wrapCheckbox.checked);
      }
    });
    
    wrapSection.appendChild(wrapCheckbox);
    
    const wrapLabel = document.createElement('label');
    wrapLabel.setAttribute('for', 'wrap-checkbox');
    wrapLabel.textContent = 'Wrap text lines';
    wrapSection.appendChild(wrapLabel);
    
    panel.appendChild(wrapSection);
  }

  // Add apply button
  const buttonSection = document.createElement('div');
  buttonSection.className = 'option-section button-section';
  
  const applyButton = document.createElement('button');
  applyButton.className = 'apply-options-btn';
  applyButton.textContent = 'Apply Options';
  applyButton.addEventListener('click', () => {
    // If custom gateway is selected, use that value
    if (gatewaySelect.value === 'custom') {
      let customUrl = customGatewayInput.value.trim();
      
      // Make sure the URL ends with /ipfs/
      if (!customUrl.endsWith('/ipfs/')) {
        customUrl = customUrl.endsWith('/') ? customUrl + 'ipfs/' : customUrl + '/ipfs/';
      }
      
      if (options.onApplyOptions) {
        options.onApplyOptions({
          ipfsGateway: customUrl,
          ...collectPreviewOptions(panel, content, options)
        });
      }
    } else {
      if (options.onApplyOptions) {
        options.onApplyOptions({
          ipfsGateway: gatewaySelect.value,
          ...collectPreviewOptions(panel, content, options)
        });
      }
    }
  });
  
  buttonSection.appendChild(applyButton);
  panel.appendChild(buttonSection);

  return panel;
}

/**
 * Collects preview options from the panel
 * 
 * @param {HTMLElement} panel - The options panel
 * @param {Object} content - The content object
 * @param {Object} currentOptions - Current options
 * @returns {Object} The collected options
 */
function collectPreviewOptions(panel, content, currentOptions) {
  const options = {};

  // Preview size
  const sizeSelect = panel.querySelector('#preview-size-select');
  if (sizeSelect) {
    options.previewSize = sizeSelect.value;
  }

  // Image quality
  const qualitySlider = panel.querySelector('#quality-slider');
  if (qualitySlider) {
    options.imageQuality = `${qualitySlider.value}%`;
  }

  // Auto-play
  const autoplayCheckbox = panel.querySelector('#autoplay-checkbox');
  if (autoplayCheckbox) {
    options.autoPlay = autoplayCheckbox.checked;
  }

  // Text wrap
  const wrapCheckbox = panel.querySelector('#wrap-checkbox');
  if (wrapCheckbox) {
    options.wrapText = wrapCheckbox.checked;
  }

  return options;
}

/**
 * Creates a tags panel for the content
 * 
 * @param {Array} tags - The tags array
 * @returns {HTMLElement} The tags panel
 */
function createTagsPanel(tags) {
  const panel = document.createElement('div');
  panel.className = 'tags-panel';

  if (!tags || tags.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'no-tags-message';
    emptyMessage.textContent = 'No tags available for this content.';
    panel.appendChild(emptyMessage);
    return panel;
  }

  const tagsList = document.createElement('div');
  tagsList.className = 'tags-list';

  tags.forEach(tag => {
    const tagElement = document.createElement('div');
    tagElement.className = 'tag-item';
    tagElement.textContent = tag;
    tagsList.appendChild(tagElement);
  });

  panel.appendChild(tagsList);
  return panel;
}

/**
 * Gets the icon class for a specific MIME type
 * 
 * @param {string} mimetype - The MIME type
 * @returns {string} The Font Awesome icon class
 */
function getIconClassForMimetype(mimetype) {
  if (!mimetype) {
    return 'fas fa-file';
  }

  if (mimetype.startsWith('image/')) {
    return 'fas fa-file-image';
  } else if (mimetype.startsWith('video/')) {
    return 'fas fa-file-video';
  } else if (mimetype.startsWith('audio/')) {
    return 'fas fa-file-audio';
  } else if (mimetype === 'application/pdf') {
    return 'fas fa-file-pdf';
  } else if (mimetype === 'application/json') {
    return 'fas fa-file-code';
  } else if (mimetype.startsWith('text/')) {
    if (mimetype.includes('html')) {
      return 'fas fa-file-code';
    } else {
      return 'fas fa-file-alt';
    }
  } else if (mimetype.includes('javascript')) {
    return 'fas fa-file-code';
  } else if (mimetype.includes('xml')) {
    return 'fas fa-file-code';
  } else if (mimetype.includes('zip') || mimetype.includes('compressed')) {
    return 'fas fa-file-archive';
  } else if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) {
    return 'fas fa-file-excel';
  } else if (mimetype.includes('word') || mimetype.includes('document')) {
    return 'fas fa-file-word';
  } else if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) {
    return 'fas fa-file-powerpoint';
  } else {
    return 'fas fa-file';
  }
}

/**
 * Gets the icon class for a specific location type
 * 
 * @param {string} locationName - The location name
 * @returns {string} The Font Awesome icon class
 */
function getLocationIconClass(locationName) {
  switch (locationName.toLowerCase()) {
    case 'ipfs':
    case 'ipfs-cluster':
      return 'fas fa-network-wired';
    case 'huggingface':
      return 'fas fa-robot';
    case 's3':
    case 'aws':
    case 'amazon s3':
      return 'fab fa-aws';
    case 'gcs':
    case 'google cloud storage':
      return 'fab fa-google';
    case 'azure':
    case 'azure storage':
      return 'fab fa-microsoft';
    case 'local':
      return 'fas fa-hdd';
    case 'pinata':
      return 'fas fa-thumbtack';
    case 'web3.storage':
      return 'fas fa-cube';
    case 'filecoin':
      return 'fas fa-database';
    case 'arweave':
      return 'fas fa-archive';
    default:
      return 'fas fa-server';
  }
}

/**
 * Formats a location name for display
 * 
 * @param {string} name - The location name
 * @returns {string} The formatted name
 */
function formatLocationName(name) {
  if (!name) return 'Unknown';

  // Handle special cases
  switch (name.toLowerCase()) {
    case 'ipfs':
      return 'IPFS';
    case 'ipfs-cluster':
      return 'IPFS Cluster';
    case 's3':
      return 'Amazon S3';
    case 'gcs':
      return 'Google Cloud Storage';
    case 'huggingface':
      return 'HuggingFace';
    case 'web3.storage':
      return 'Web3.Storage';
    default:
      // Capitalize first letter of each word
      return name.split(/[._-]/).map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
  }
}

/**
 * Formats a detail label for display
 * 
 * @param {string} label - The detail label
 * @returns {string} The formatted label
 */
function formatDetailLabel(label) {
  if (!label) return '';

  // Convert camelCase or snake_case to Title Case
  const formatted = label
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/_/g, ' ') // Replace underscores with spaces
    .trim();

  // Capitalize first letter of each word
  return formatted.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

// Export the module functions
module.exports = {
  createAdvancedSearchPanel,
  createSavedSearchesModal,
  createSearchHistoryModal,
  createActiveFiltersIndicator,
  collectSearchCriteria,
  applySearchCriteria,
  showSaveSearchDialog,
  enhanceSearchResultsWithThumbnails,
  createEnhancedSearchResultsView,
  createContentDetailPanel,
  createEmptyDetailPanel
};