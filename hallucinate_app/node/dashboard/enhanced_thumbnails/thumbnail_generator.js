/**
 * Enhanced Thumbnail Generator for PyArrow Content Index Dashboard
 * 
 * This module provides thumbnail generation and preview capabilities for different
 * content types including images, videos, PDFs, and other file types.
 */

/**
 * Check if content has a visual type that can have a thumbnail
 * 
 * @param {string} mimeType - The content MIME type
 * @returns {boolean} - Whether content is visual and can have a thumbnail
 */
function isVisualContent(mimeType) {
  if (!mimeType) return false;
  
  const lowerMimeType = mimeType.toLowerCase();
  
  // Check for image types
  if (lowerMimeType.startsWith('image/')) {
    return true;
  }
  
  // Check for PDF documents
  if (lowerMimeType === 'application/pdf') {
    return true;
  }
  
  // Check for video types
  if (lowerMimeType.startsWith('video/')) {
    return true;
  }
  
  // Check for specific document types that can have previews
  const previewableDocuments = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.oasis.opendocument.text', // ODT
    'application/vnd.oasis.opendocument.spreadsheet', // ODS
    'application/vnd.oasis.opendocument.presentation', // ODP
    'application/msword', // DOC
    'application/vnd.ms-excel', // XLS
    'application/vnd.ms-powerpoint' // PPT
  ];
  
  if (previewableDocuments.includes(lowerMimeType)) {
    return true;
  }
  
  return false;
}

/**
 * Get the appropriate icon for a content type
 * 
 * @param {string} mimeType - The content MIME type
 * @returns {Object} - Icon class and color information
 */
function getTypeIcon(mimeType) {
  if (!mimeType) {
    return { icon: 'fa-file', color: '#6c757d' };
  }
  
  const lowerMimeType = mimeType.toLowerCase();
  
  // Image types
  if (lowerMimeType.startsWith('image/')) {
    return { icon: 'fa-image', color: '#28a745' };
  }
  
  // Video types
  if (lowerMimeType.startsWith('video/')) {
    return { icon: 'fa-video', color: '#dc3545' };
  }
  
  // Audio types
  if (lowerMimeType.startsWith('audio/')) {
    return { icon: 'fa-music', color: '#fd7e14' };
  }
  
  // Text types
  if (lowerMimeType.startsWith('text/')) {
    if (lowerMimeType === 'text/html') {
      return { icon: 'fa-code', color: '#e83e8c' };
    }
    if (lowerMimeType === 'text/markdown' || lowerMimeType === 'text/x-markdown') {
      return { icon: 'fa-markdown', color: '#6f42c1' };
    }
    if (lowerMimeType === 'text/csv') {
      return { icon: 'fa-file-csv', color: '#17a2b8' };
    }
    return { icon: 'fa-file-alt', color: '#6c757d' };
  }
  
  // PDF
  if (lowerMimeType === 'application/pdf') {
    return { icon: 'fa-file-pdf', color: '#dc3545' };
  }
  
  // Archives
  const archiveTypes = ['application/zip', 'application/x-rar-compressed', 'application/x-tar', 'application/gzip'];
  if (archiveTypes.includes(lowerMimeType)) {
    return { icon: 'fa-file-archive', color: '#ffc107' };
  }
  
  // Office documents
  if (lowerMimeType.includes('wordprocessing') || lowerMimeType === 'application/msword') {
    return { icon: 'fa-file-word', color: '#007bff' };
  }
  if (lowerMimeType.includes('spreadsheet') || lowerMimeType.includes('excel')) {
    return { icon: 'fa-file-excel', color: '#28a745' };
  }
  if (lowerMimeType.includes('presentation') || lowerMimeType.includes('powerpoint')) {
    return { icon: 'fa-file-powerpoint', color: '#fd7e14' };
  }
  
  // Code files
  const codeTypes = ['application/json', 'application/javascript', 'application/xml'];
  if (codeTypes.includes(lowerMimeType)) {
    return { icon: 'fa-file-code', color: '#17a2b8' };
  }
  
  // IPFS specific
  if (lowerMimeType === 'application/x-ipfs-dir' || lowerMimeType === 'application/x-directory') {
    return { icon: 'fa-folder', color: '#ffc107' };
  }
  
  // Default
  return { icon: 'fa-file', color: '#6c757d' };
}

/**
 * Generate a thumbnail URL for content based on its CID and MIME type
 * 
 * @param {string} cid - The content identifier
 * @param {string} mimeType - The content MIME type
 * @param {string} path - The content path (optional)
 * @param {Object} options - Additional options for thumbnail generation
 * @returns {Object} - Thumbnail information including URL, loading status, and type
 */
function generateThumbnail(cid, mimeType, path = '', options = {}) {
  const defaultOptions = {
    ipfsGateway: 'https://ipfs.io/ipfs/',
    thumbnailSize: 'small', // 'small' or 'large'
    useDirectGateway: true,
    thumbnailService: null, // Optional external thumbnail service URL
    fallbackIconClass: 'fa-file'
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  // Initialize thumbnail result
  const result = {
    url: null,
    isLoading: true,
    isIcon: false,
    iconClass: null,
    iconColor: null,
    mimeType: mimeType,
    cid: cid
  };
  
  if (!cid || !mimeType) {
    result.isLoading = false;
    result.isIcon = true;
    const typeIcon = getTypeIcon(mimeType);
    result.iconClass = typeIcon.icon;
    result.iconColor = typeIcon.color;
    return result;
  }
  
  const lowerMimeType = mimeType.toLowerCase();
  
  // Handle image types directly
  if (lowerMimeType.startsWith('image/')) {
    if (mergedOptions.useDirectGateway) {
      result.url = `${mergedOptions.ipfsGateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
    } else if (mergedOptions.thumbnailService) {
      // Use an external thumbnail service for images
      result.url = `${mergedOptions.thumbnailService}/thumbnail?cid=${cid}&type=image&size=${mergedOptions.thumbnailSize}`;
    }
    result.isLoading = false;
    return result;
  }
  
  // Handle PDF files
  if (lowerMimeType === 'application/pdf') {
    if (mergedOptions.thumbnailService) {
      // Use thumbnail service for PDF preview
      result.url = `${mergedOptions.thumbnailService}/thumbnail?cid=${cid}&type=pdf&size=${mergedOptions.thumbnailSize}`;
      result.isLoading = false;
    } else {
      // Fallback to PDF icon
      result.isLoading = false;
      result.isIcon = true;
      result.iconClass = 'fa-file-pdf';
      result.iconColor = '#dc3545';
    }
    return result;
  }
  
  // Handle video files
  if (lowerMimeType.startsWith('video/')) {
    if (mergedOptions.thumbnailService) {
      // Use thumbnail service for video preview
      result.url = `${mergedOptions.thumbnailService}/thumbnail?cid=${cid}&type=video&size=${mergedOptions.thumbnailSize}`;
      result.isLoading = false;
    } else {
      // Fallback to video icon
      result.isLoading = false;
      result.isIcon = true;
      result.iconClass = 'fa-video';
      result.iconColor = '#dc3545';
    }
    return result;
  }
  
  // For other document types, rely on thumbnail service if available
  const previewableDocuments = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.oasis.opendocument.text', // ODT
    'application/vnd.oasis.opendocument.spreadsheet', // ODS
    'application/vnd.oasis.opendocument.presentation', // ODP
    'application/msword', // DOC
    'application/vnd.ms-excel', // XLS
    'application/vnd.ms-powerpoint' // PPT
  ];
  
  if (previewableDocuments.includes(lowerMimeType) && mergedOptions.thumbnailService) {
    result.url = `${mergedOptions.thumbnailService}/thumbnail?cid=${cid}&type=document&mime=${encodeURIComponent(lowerMimeType)}&size=${mergedOptions.thumbnailSize}`;
    result.isLoading = false;
    return result;
  }
  
  // For all other types, use appropriate icon
  result.isLoading = false;
  result.isIcon = true;
  const typeIcon = getTypeIcon(mimeType);
  result.iconClass = typeIcon.icon;
  result.iconColor = typeIcon.color;
  
  return result;
}

/**
 * Create a thumbnail element for the list view
 * 
 * @param {string} cid - The content identifier
 * @param {string} mimeType - The content MIME type
 * @param {string} path - The content path (optional)
 * @param {Object} options - Additional options for thumbnail generation
 * @returns {HTMLElement} - The thumbnail element
 */
function createThumbnailElement(cid, mimeType, path = '', options = {}) {
  const cell = document.createElement('div');
  cell.className = 'thumbnail-cell';
  
  const thumbnail = generateThumbnail(cid, mimeType, path, {
    thumbnailSize: 'small',
    ...options
  });
  
  if (thumbnail.isLoading) {
    // Create loading spinner
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'thumbnail-small-loading';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner-small';
    loadingDiv.appendChild(spinner);
    
    cell.appendChild(loadingDiv);
  } else if (thumbnail.isIcon) {
    // Create icon-based thumbnail
    const icon = document.createElement('i');
    icon.className = `fas ${thumbnail.iconClass} thumbnail-icon`;
    if (thumbnail.iconColor) {
      icon.style.color = thumbnail.iconColor;
    }
    cell.appendChild(icon);
  } else if (thumbnail.url) {
    // Create image thumbnail
    const img = document.createElement('img');
    img.className = 'thumbnail-small';
    img.src = thumbnail.url;
    img.alt = path || cid;
    img.onerror = () => {
      // Replace with icon on error
      img.style.display = 'none';
      const icon = document.createElement('i');
      icon.className = `fas ${getTypeIcon(mimeType).icon} thumbnail-icon`;
      icon.style.color = getTypeIcon(mimeType).color;
      cell.appendChild(icon);
    };
    cell.appendChild(img);
  }
  
  return cell;
}

/**
 * Create a preview element for the detail view
 * 
 * @param {string} cid - The content identifier
 * @param {string} mimeType - The content MIME type
 * @param {string} path - The content path (optional)
 * @param {Object} options - Additional options for preview generation
 * @returns {HTMLElement} - The preview element
 */
function createPreviewElement(cid, mimeType, path = '', options = {}) {
  const container = document.createElement('div');
  container.className = 'thumbnail-container';
  
  const lowerMimeType = mimeType ? mimeType.toLowerCase() : '';
  
  if (!isVisualContent(mimeType)) {
    // Not a previewable content type, show generic icon
    const iconInfo = getTypeIcon(mimeType);
    
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'file-icon-large';
    
    const icon = document.createElement('i');
    icon.className = `fas ${iconInfo.icon}`;
    icon.style.fontSize = '64px';
    icon.style.color = iconInfo.color;
    
    iconWrapper.appendChild(icon);
    container.appendChild(iconWrapper);
    
    // Add file type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'file-type-label';
    typeLabel.textContent = mimeType || 'Unknown type';
    container.appendChild(typeLabel);
    
    return container;
  }
  
  // Handle image previews
  if (lowerMimeType.startsWith('image/')) {
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'thumbnail-preview';
    
    // Create loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'thumbnail-loading';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    loadingDiv.appendChild(spinner);
    
    const loadingText = document.createElement('p');
    loadingText.textContent = 'Loading preview...';
    loadingDiv.appendChild(loadingText);
    
    previewWrapper.appendChild(loadingDiv);
    
    // Create image element (initially hidden)
    const img = document.createElement('img');
    img.style.display = 'none';
    
    // Set gateway URL
    const gateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
    img.src = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
    
    img.onload = () => {
      // Hide loading, show image
      loadingDiv.style.display = 'none';
      img.style.display = 'block';
    };
    
    img.onerror = () => {
      // Show error message
      loadingText.textContent = 'Failed to load image preview';
      spinner.style.display = 'none';
      
      const retryButton = document.createElement('button');
      retryButton.textContent = 'Retry';
      retryButton.className = 'secondary-btn';
      retryButton.style.marginTop = '10px';
      retryButton.onclick = () => {
        loadingText.textContent = 'Loading preview...';
        spinner.style.display = 'block';
        img.src = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
      };
      
      loadingDiv.appendChild(retryButton);
    };
    
    previewWrapper.appendChild(img);
    container.appendChild(previewWrapper);
    
    return container;
  }
  
  // Handle PDF previews
  if (lowerMimeType === 'application/pdf') {
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'pdf-preview';
    
    if (options.embed) {
      // Create PDF embed
      const embed = document.createElement('embed');
      embed.className = 'pdf-embed';
      embed.style.width = '100%';
      embed.style.height = '500px';
      embed.type = 'application/pdf';
      
      const gateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
      embed.src = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
      
      previewWrapper.appendChild(embed);
    } else {
      // Create PDF icon and download link
      const iconWrapper = document.createElement('div');
      iconWrapper.className = 'file-icon-large';
      
      const icon = document.createElement('i');
      icon.className = 'fas fa-file-pdf';
      icon.style.fontSize = '64px';
      icon.style.color = '#dc3545';
      
      iconWrapper.appendChild(icon);
      previewWrapper.appendChild(iconWrapper);
      
      const label = document.createElement('p');
      label.textContent = 'PDF Document';
      label.style.marginTop = '10px';
      previewWrapper.appendChild(label);
      
      const gateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
      const viewLink = document.createElement('a');
      viewLink.href = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
      viewLink.target = '_blank';
      viewLink.className = 'primary-btn';
      viewLink.textContent = 'View PDF';
      viewLink.style.marginTop = '10px';
      viewLink.style.display = 'inline-block';
      
      previewWrapper.appendChild(viewLink);
    }
    
    container.appendChild(previewWrapper);
    return container;
  }
  
  // Handle video previews
  if (lowerMimeType.startsWith('video/')) {
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'video-preview';
    
    if (options.embed) {
      // Create video player
      const video = document.createElement('video');
      video.className = 'video-player';
      video.controls = true;
      video.style.maxWidth = '100%';
      video.style.maxHeight = '400px';
      
      const gateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
      video.src = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
      
      const sourceEl = document.createElement('source');
      sourceEl.src = video.src;
      sourceEl.type = mimeType;
      video.appendChild(sourceEl);
      
      video.onerror = () => {
        // Replace with icon on error
        previewWrapper.removeChild(video);
        
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'file-icon-large';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-video';
        icon.style.fontSize = '64px';
        icon.style.color = '#dc3545';
        
        iconWrapper.appendChild(icon);
        previewWrapper.appendChild(iconWrapper);
        
        const errorText = document.createElement('p');
        errorText.className = 'error-text';
        errorText.textContent = 'Video preview not available';
        errorText.style.marginTop = '10px';
        previewWrapper.appendChild(errorText);
        
        const viewLink = document.createElement('a');
        viewLink.href = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
        viewLink.target = '_blank';
        viewLink.className = 'primary-btn';
        viewLink.textContent = 'Download Video';
        viewLink.style.marginTop = '10px';
        viewLink.style.display = 'inline-block';
        
        previewWrapper.appendChild(viewLink);
      };
      
      previewWrapper.appendChild(video);
    } else {
      // Create video thumbnail
      const iconWrapper = document.createElement('div');
      iconWrapper.className = 'file-icon-large';
      
      const icon = document.createElement('i');
      icon.className = 'fas fa-video';
      icon.style.fontSize = '64px';
      icon.style.color = '#dc3545';
      
      iconWrapper.appendChild(icon);
      previewWrapper.appendChild(iconWrapper);
      
      const label = document.createElement('p');
      label.textContent = 'Video File';
      label.style.marginTop = '10px';
      previewWrapper.appendChild(label);
      
      const gateway = options.ipfsGateway || 'https://ipfs.io/ipfs/';
      const viewLink = document.createElement('a');
      viewLink.href = `${gateway}${cid}${path ? `?filename=${encodeURIComponent(path)}` : ''}`;
      viewLink.target = '_blank';
      viewLink.className = 'primary-btn';
      viewLink.textContent = 'View Video';
      viewLink.style.marginTop = '10px';
      viewLink.style.display = 'inline-block';
      
      previewWrapper.appendChild(viewLink);
    }
    
    container.appendChild(previewWrapper);
    return container;
  }
  
  // For other types, show default icon
  const iconInfo = getTypeIcon(mimeType);
  
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'file-icon-large';
  
  const icon = document.createElement('i');
  icon.className = `fas ${iconInfo.icon}`;
  icon.style.fontSize = '64px';
  icon.style.color = iconInfo.color;
  
  iconWrapper.appendChild(icon);
  container.appendChild(iconWrapper);
  
  // Add file type label
  const typeLabel = document.createElement('div');
  typeLabel.className = 'file-type-label';
  typeLabel.textContent = mimeType || 'Unknown type';
  container.appendChild(typeLabel);
  
  return container;
}

/**
 * Create a thumbnail cache to prevent redundant thumbnail generation
 * 
 * @returns {Object} - The thumbnail cache methods
 */
function createThumbnailCache() {
  const cache = new Map();
  
  return {
    /**
     * Get a thumbnail from the cache
     * 
     * @param {string} cid - The content identifier
     * @param {string} mimeType - The content MIME type
     * @param {string} size - The thumbnail size ('small' or 'large')
     * @returns {Object|null} - The cached thumbnail or null if not found
     */
    get: (cid, mimeType, size = 'small') => {
      const key = `${cid}:${mimeType}:${size}`;
      return cache.has(key) ? cache.get(key) : null;
    },
    
    /**
     * Set a thumbnail in the cache
     * 
     * @param {string} cid - The content identifier
     * @param {string} mimeType - The content MIME type
     * @param {string} size - The thumbnail size ('small' or 'large')
     * @param {Object} thumbnailData - The thumbnail data to cache
     */
    set: (cid, mimeType, size, thumbnailData) => {
      const key = `${cid}:${mimeType}:${size}`;
      cache.set(key, thumbnailData);
      
      // Simple cache size management - remove oldest entries if too many
      if (cache.size > 200) {
        const keysIterator = cache.keys();
        // Remove oldest 50 entries
        for (let i = 0; i < 50; i++) {
          const oldestKey = keysIterator.next().value;
          if (oldestKey) {
            cache.delete(oldestKey);
          }
        }
      }
    },
    
    /**
     * Clear the thumbnail cache
     */
    clear: () => {
      cache.clear();
    },
    
    /**
     * Get the size of the cache
     * 
     * @returns {number} - The number of items in the cache
     */
    size: () => {
      return cache.size;
    }
  };
}

// Create a global thumbnail cache
const thumbnailCache = createThumbnailCache();

// Export module functions
module.exports = {
  isVisualContent,
  getTypeIcon,
  generateThumbnail,
  createThumbnailElement,
  createPreviewElement,
  thumbnailCache
};