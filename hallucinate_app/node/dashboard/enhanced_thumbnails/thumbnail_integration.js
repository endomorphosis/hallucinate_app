/**
 * Thumbnail Integration Module
 * 
 * This module integrates enhanced thumbnail generation into the PyArrow Content Index Dashboard.
 * It adds visual previews to the content list and detail views.
 */

// Import the thumbnail generator
const {
  isVisualContent,
  getTypeIcon,
  generateThumbnail,
  createThumbnailElement,
  createPreviewElement,
  thumbnailCache
} = require('./thumbnail_generator.js');

/**
 * Integrates enhanced thumbnail capabilities into the dashboard
 * 
 * @param {Object} dashboard - The dashboard instance to integrate with
 * @param {Object} options - Configuration options for thumbnail generation
 * @returns {boolean} - Whether the integration was successful
 */
function integrateThumbnails(dashboard, options = {}) {
  if (!dashboard) {
    console.error('Dashboard instance is required for integration');
    return false;
  }

  try {
    // Default configuration options
    const config = {
      ipfsGateway: 'https://ipfs.io/ipfs/',
      thumbnailService: null,
      enableListThumbnails: true,
      enableDetailPreview: true,
      embedPdfPreview: false,
      embedVideoPreview: true,
      maxCacheSize: 200,
      ...options
    };

    // Store reference to original methods
    const originalRenderList = dashboard.renderList;
    const originalRenderDetail = dashboard.renderDetail;
    const originalIsVisualContent = dashboard._isVisualContent;
    const originalGenerateThumbnail = dashboard._generateThumbnail;

    // Add or override the visual content check method
    dashboard._isVisualContent = function(mimeType) {
      if (originalIsVisualContent) {
        return originalIsVisualContent.call(this, mimeType);
      }
      return isVisualContent(mimeType);
    };

    // Add or override the thumbnail generation method
    dashboard._generateThumbnail = function(cid, mimeType, path = '') {
      if (originalGenerateThumbnail) {
        return originalGenerateThumbnail.call(this, cid, mimeType, path);
      }
      return generateThumbnail(cid, mimeType, path, {
        ipfsGateway: config.ipfsGateway,
        thumbnailService: config.thumbnailService
      });
    };

    // Override the list rendering method
    if (config.enableListThumbnails && originalRenderList) {
      dashboard.renderList = function(entries) {
        // Create the list container
        const container = document.createElement('div');
        container.className = 'content-list-container';
        
        if (!entries || entries.length === 0) {
          const emptyState = document.createElement('div');
          emptyState.className = 'empty-state';
          emptyState.innerHTML = `
            <div class="no-results-icon">
              <i class="fas fa-search"></i>
            </div>
            <h3>No entries found</h3>
            <p>Try adjusting your search filters or adding new content.</p>
          `;
          container.appendChild(emptyState);
          return container;
        }
        
        // Create table
        const table = document.createElement('table');
        table.className = 'content-list-table';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
          <tr>
            <th></th>
            <th>Thumbnail</th>
            <th>Path / Name</th>
            <th>CID</th>
            <th>Size</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Add rows for each entry
        entries.forEach(entry => {
          const row = document.createElement('tr');
          
          // Type icon cell
          const typeCell = document.createElement('td');
          typeCell.className = 'type-cell';
          const typeIcon = getTypeIcon(entry.mime_type);
          typeCell.innerHTML = `<i class="fas ${typeIcon.icon}" style="color: ${typeIcon.color};"></i>`;
          row.appendChild(typeCell);
          
          // Thumbnail cell (new)
          const thumbnailCell = document.createElement('td');
          thumbnailCell.className = 'thumbnail-cell';
          
          // Create thumbnail element
          const thumbnailElement = createThumbnailElement(entry.cid, entry.mime_type, entry.path, {
            ipfsGateway: config.ipfsGateway,
            thumbnailService: config.thumbnailService
          });
          
          thumbnailCell.appendChild(thumbnailElement);
          row.appendChild(thumbnailCell);
          
          // Path cell
          const pathCell = document.createElement('td');
          pathCell.className = 'path-cell';
          
          // Format the path/name
          let displayPath = entry.path || entry.name || '(Unnamed)';
          if (displayPath.length > 60) {
            // Truncate long paths
            const parts = displayPath.split('/');
            if (parts.length > 3) {
              displayPath = parts[0] + '/.../' + parts[parts.length - 1];
            } else {
              displayPath = displayPath.substring(0, 30) + '...' + displayPath.substring(displayPath.length - 30);
            }
          }
          
          pathCell.textContent = displayPath;
          row.appendChild(pathCell);
          
          // CID cell
          const cidCell = document.createElement('td');
          cidCell.className = 'cid-cell';
          
          // Format CID display
          const cidDisplay = document.createElement('span');
          cidDisplay.className = 'cid-display';
          cidDisplay.textContent = entry.cid.substring(0, 8) + '...' + entry.cid.substring(entry.cid.length - 6);
          cidDisplay.title = entry.cid;
          cidDisplay.addEventListener('click', () => {
            this._copyToClipboard(entry.cid);
          });
          
          cidCell.appendChild(cidDisplay);
          row.appendChild(cidCell);
          
          // Size cell
          const sizeCell = document.createElement('td');
          sizeCell.className = 'size-cell';
          
          // Format file size
          let sizeText = '';
          if (entry.size !== undefined) {
            const size = parseInt(entry.size);
            if (isNaN(size)) {
              sizeText = 'Unknown';
            } else if (size < 1024) {
              sizeText = size + ' B';
            } else if (size < 1024 * 1024) {
              sizeText = (size / 1024).toFixed(1) + ' KB';
            } else if (size < 1024 * 1024 * 1024) {
              sizeText = (size / (1024 * 1024)).toFixed(1) + ' MB';
            } else {
              sizeText = (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
            }
          } else {
            sizeText = 'Unknown';
          }
          
          sizeCell.textContent = sizeText;
          row.appendChild(sizeCell);
          
          // Updated cell
          const updatedCell = document.createElement('td');
          updatedCell.className = 'updated-cell';
          
          // Format timestamp
          let updatedText = '';
          if (entry.timestamp) {
            const date = new Date(entry.timestamp);
            updatedText = date.toLocaleString();
          } else {
            updatedText = 'Unknown';
          }
          
          updatedCell.textContent = updatedText;
          row.appendChild(updatedCell);
          
          // Actions cell
          const actionsCell = document.createElement('td');
          actionsCell.className = 'actions-cell';
          
          // View button
          const viewButton = document.createElement('button');
          viewButton.innerHTML = '<i class="fas fa-eye"></i>';
          viewButton.title = 'View details';
          viewButton.addEventListener('click', () => {
            this._showContentDetails(entry);
          });
          
          actionsCell.appendChild(viewButton);
          
          // IPFS Gateway button
          const gatewayButton = document.createElement('button');
          gatewayButton.innerHTML = '<i class="fas fa-external-link-alt"></i>';
          gatewayButton.title = 'Open in IPFS Gateway';
          gatewayButton.addEventListener('click', () => {
            window.open(`${config.ipfsGateway}${entry.cid}`, '_blank');
          });
          
          actionsCell.appendChild(gatewayButton);
          
          row.appendChild(actionsCell);
          
          // Make the whole row clickable to show details
          row.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
              this._showContentDetails(entry);
            }
          });
          
          tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        container.appendChild(table);
        
        // Add pagination if needed
        if (this.totalEntries > this.pageSize) {
          const pagination = document.createElement('div');
          pagination.className = 'pagination';
          
          const prevButton = document.createElement('button');
          prevButton.textContent = 'Previous';
          prevButton.disabled = this.currentPage === 0;
          prevButton.addEventListener('click', () => {
            if (this.currentPage > 0) {
              this.currentPage--;
              this._refreshDashboard();
            }
          });
          
          const pageInfo = document.createElement('span');
          const startItem = this.currentPage * this.pageSize + 1;
          const endItem = Math.min(startItem + this.pageSize - 1, this.totalEntries);
          pageInfo.textContent = `${startItem}-${endItem} of ${this.totalEntries}`;
          
          const nextButton = document.createElement('button');
          nextButton.textContent = 'Next';
          nextButton.disabled = (this.currentPage + 1) * this.pageSize >= this.totalEntries;
          nextButton.addEventListener('click', () => {
            if ((this.currentPage + 1) * this.pageSize < this.totalEntries) {
              this.currentPage++;
              this._refreshDashboard();
            }
          });
          
          pagination.appendChild(prevButton);
          pagination.appendChild(pageInfo);
          pagination.appendChild(nextButton);
          
          container.appendChild(pagination);
        }
        
        return container;
      };
    }

    // Override the detail rendering method
    if (config.enableDetailPreview && originalRenderDetail) {
      dashboard.renderDetail = function(entry) {
        // Create the detail container
        const container = document.createElement('div');
        container.className = 'content-detail-container';
        
        // Back button
        const backButton = document.createElement('button');
        backButton.className = 'back-btn';
        backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to List';
        backButton.addEventListener('click', () => {
          this._showContentList();
        });
        container.appendChild(backButton);
        
        if (!entry) {
          const emptyState = document.createElement('div');
          emptyState.className = 'empty-state';
          emptyState.innerHTML = '<p>No content details available</p>';
          container.appendChild(emptyState);
          return container;
        }
        
        // Detail header
        const header = document.createElement('div');
        header.className = 'detail-header';
        
        const heading = document.createElement('h3');
        heading.textContent = entry.name || entry.path || 'Content Details';
        header.appendChild(heading);
        
        const actions = document.createElement('div');
        actions.className = 'detail-actions';
        
        const gatewayButton = document.createElement('button');
        gatewayButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Open in Gateway';
        gatewayButton.addEventListener('click', () => {
          window.open(`${config.ipfsGateway}${entry.cid}`, '_blank');
        });
        actions.appendChild(gatewayButton);
        
        const pinButton = document.createElement('button');
        if (entry.pinned) {
          pinButton.innerHTML = '<i class="fas fa-unlink"></i> Unpin';
          pinButton.addEventListener('click', () => {
            this._unpinContent(entry.cid);
          });
        } else {
          pinButton.innerHTML = '<i class="fas fa-thumbtack"></i> Pin';
          pinButton.addEventListener('click', () => {
            this._pinContent(entry.cid);
          });
        }
        actions.appendChild(pinButton);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'danger-btn';
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
        deleteButton.addEventListener('click', () => {
          this._showDeleteConfirmation(entry);
        });
        actions.appendChild(deleteButton);
        
        header.appendChild(actions);
        container.appendChild(header);
        
        // Preview section (new)
        if (this._isVisualContent(entry.mime_type)) {
          const previewSection = document.createElement('div');
          previewSection.className = 'detail-section preview-section';
          
          const previewHeader = document.createElement('h4');
          previewHeader.textContent = 'Preview';
          previewSection.appendChild(previewHeader);
          
          // Create content preview
          const previewElement = createPreviewElement(entry.cid, entry.mime_type, entry.path, {
            ipfsGateway: config.ipfsGateway,
            thumbnailService: config.thumbnailService,
            embed: true,
            embedPdf: config.embedPdfPreview,
            embedVideo: config.embedVideoPreview
          });
          
          previewSection.appendChild(previewElement);
          container.appendChild(previewSection);
        }
        
        // Basic information section
        const basicInfoSection = document.createElement('div');
        basicInfoSection.className = 'detail-section';
        
        const infoHeader = document.createElement('h4');
        infoHeader.textContent = 'Basic Information';
        basicInfoSection.appendChild(infoHeader);
        
        const infoTable = document.createElement('table');
        infoTable.className = 'detail-table';
        
        // Add rows for each property
        const addInfoRow = (label, value) => {
          const row = document.createElement('tr');
          
          const labelCell = document.createElement('th');
          labelCell.textContent = label;
          row.appendChild(labelCell);
          
          const valueCell = document.createElement('td');
          if (typeof value === 'string' && value.startsWith('Qm') && value.length > 40) {
            // For CIDs, add copy button
            const cidDisplay = document.createElement('div');
            cidDisplay.className = 'cid-display-full';
            
            const cidText = document.createElement('code');
            cidText.textContent = value;
            cidDisplay.appendChild(cidText);
            
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-btn';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.title = 'Copy to clipboard';
            copyButton.addEventListener('click', () => {
              this._copyToClipboard(value);
            });
            cidDisplay.appendChild(copyButton);
            
            valueCell.appendChild(cidDisplay);
          } else {
            valueCell.textContent = value;
          }
          
          row.appendChild(valueCell);
          infoTable.appendChild(row);
        };
        
        addInfoRow('Content ID (CID)', entry.cid);
        addInfoRow('Path', entry.path || 'N/A');
        
        // Format file name from path if not available
        const fileName = entry.name || (entry.path ? entry.path.split('/').pop() : 'Unknown');
        addInfoRow('File Name', fileName);
        
        // Format MIME type
        addInfoRow('MIME Type', entry.mime_type || 'Unknown');
        
        // Format size
        let sizeText = 'Unknown';
        if (entry.size !== undefined) {
          const size = parseInt(entry.size);
          if (!isNaN(size)) {
            if (size < 1024) {
              sizeText = size + ' B';
            } else if (size < 1024 * 1024) {
              sizeText = (size / 1024).toFixed(1) + ' KB';
            } else if (size < 1024 * 1024 * 1024) {
              sizeText = (size / (1024 * 1024)).toFixed(1) + ' MB';
            } else {
              sizeText = (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
            }
          }
        }
        addInfoRow('Size', sizeText);
        
        // Format timestamps
        let createdText = 'Unknown';
        if (entry.timestamp) {
          const date = new Date(entry.timestamp);
          createdText = date.toLocaleString();
        }
        addInfoRow('Created', createdText);
        
        if (entry.last_updated) {
          const date = new Date(entry.last_updated);
          addInfoRow('Last Updated', date.toLocaleString());
        }
        
        // Add pin status
        addInfoRow('Pinned', entry.pinned ? 'Yes' : 'No');
        
        basicInfoSection.appendChild(infoTable);
        container.appendChild(basicInfoSection);
        
        // Additional IPFS metadata section if available
        if (entry.ipfs_metadata) {
          const ipfsMetadataSection = document.createElement('div');
          ipfsMetadataSection.className = 'detail-section';
          
          const metadataHeader = document.createElement('h4');
          metadataHeader.textContent = 'IPFS Metadata';
          ipfsMetadataSection.appendChild(metadataHeader);
          
          const metadataTable = document.createElement('table');
          metadataTable.className = 'detail-table';
          
          // Add metadata rows
          const metadata = entry.ipfs_metadata;
          if (typeof metadata === 'object') {
            Object.entries(metadata).forEach(([key, value]) => {
              if (key !== 'Links') {
                // Regular metadata
                const row = document.createElement('tr');
                
                const labelCell = document.createElement('th');
                labelCell.textContent = key;
                row.appendChild(labelCell);
                
                const valueCell = document.createElement('td');
                
                if (typeof value === 'object') {
                  // For objects, use JSON
                  const pre = document.createElement('pre');
                  pre.textContent = JSON.stringify(value, null, 2);
                  valueCell.appendChild(pre);
                } else {
                  valueCell.textContent = value;
                }
                
                row.appendChild(valueCell);
                metadataTable.appendChild(row);
              }
            });
            
            // Add Links section separately if available
            if (metadata.Links && Array.isArray(metadata.Links) && metadata.Links.length > 0) {
              const linksRow = document.createElement('tr');
              
              const linksLabelCell = document.createElement('th');
              linksLabelCell.textContent = 'Links';
              linksRow.appendChild(linksLabelCell);
              
              const linksValueCell = document.createElement('td');
              
              const linksTable = document.createElement('table');
              linksTable.className = 'nested-table';
              
              // Add header row
              const linksHeaderRow = document.createElement('tr');
              ['Name', 'CID', 'Size'].forEach(colName => {
                const th = document.createElement('th');
                th.textContent = colName;
                linksHeaderRow.appendChild(th);
              });
              linksTable.appendChild(linksHeaderRow);
              
              // Add rows for each link
              metadata.Links.forEach(link => {
                const linkRow = document.createElement('tr');
                
                const nameCell = document.createElement('td');
                nameCell.textContent = link.Name || '';
                linkRow.appendChild(nameCell);
                
                const cidCell = document.createElement('td');
                cidCell.textContent = link.Hash || link.Cid || '';
                linkRow.appendChild(cidCell);
                
                const sizeCell = document.createElement('td');
                const linkSize = link.Size || 0;
                if (linkSize < 1024) {
                  sizeCell.textContent = linkSize + ' B';
                } else if (linkSize < 1024 * 1024) {
                  sizeCell.textContent = (linkSize / 1024).toFixed(1) + ' KB';
                } else if (linkSize < 1024 * 1024 * 1024) {
                  sizeCell.textContent = (linkSize / (1024 * 1024)).toFixed(1) + ' MB';
                } else {
                  sizeCell.textContent = (linkSize / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
                }
                linkRow.appendChild(sizeCell);
                
                linksTable.appendChild(linkRow);
              });
              
              linksValueCell.appendChild(linksTable);
              linksRow.appendChild(linksValueCell);
              metadataTable.appendChild(linksRow);
            }
          } else {
            // If metadata isn't an object, display as is
            const row = document.createElement('tr');
            
            const labelCell = document.createElement('th');
            labelCell.textContent = 'Raw Metadata';
            row.appendChild(labelCell);
            
            const valueCell = document.createElement('td');
            valueCell.textContent = String(metadata);
            
            row.appendChild(valueCell);
            metadataTable.appendChild(row);
          }
          
          ipfsMetadataSection.appendChild(metadataTable);
          container.appendChild(ipfsMetadataSection);
        }
        
        // Custom metadata section if available
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
          const customMetadataSection = document.createElement('div');
          customMetadataSection.className = 'detail-section';
          
          const customHeader = document.createElement('h4');
          customHeader.textContent = 'Custom Metadata';
          customMetadataSection.appendChild(customHeader);
          
          const customTable = document.createElement('table');
          customTable.className = 'detail-table';
          
          // Add custom metadata rows
          Object.entries(entry.metadata).forEach(([key, value]) => {
            const row = document.createElement('tr');
            
            const labelCell = document.createElement('th');
            labelCell.textContent = key;
            row.appendChild(labelCell);
            
            const valueCell = document.createElement('td');
            
            if (typeof value === 'object') {
              // For objects, use JSON
              const pre = document.createElement('pre');
              pre.textContent = JSON.stringify(value, null, 2);
              valueCell.appendChild(pre);
            } else {
              valueCell.textContent = String(value);
            }
            
            row.appendChild(valueCell);
            customTable.appendChild(row);
          });
          
          customMetadataSection.appendChild(customTable);
          container.appendChild(customMetadataSection);
        }
        
        return container;
      };
    }

    console.info('Thumbnail integration successful');
    return true;
  } catch (error) {
    console.error('Failed to integrate thumbnail functionality:', error);
    return false;
  }
}

/**
 * Creates a loader script that can be injected into the dashboard HTML
 * to automatically integrate the thumbnail generation
 * 
 * @param {Object} options - Configuration options for thumbnail generation
 * @returns {string} - The loader script as a string
 */
function createThumbnailIntegrationLoader(options = {}) {
  return `
    // Auto-integration script for thumbnail generation
    (function() {
      try {
        // Wait for dashboard to be initialized
        const checkInterval = setInterval(() => {
          const dashboardInstance = window.contentIndexDashboard;
          if (dashboardInstance && typeof dashboardInstance.renderList === 'function') {
            clearInterval(checkInterval);
            
            // Load the integration module
            const thumbnailIntegration = require('./enhanced_thumbnails/thumbnail_integration.js');
            
            // Integrate the thumbnail functionality
            thumbnailIntegration.integrateThumbnails(dashboardInstance, ${JSON.stringify(options)});
            
            console.info('Enhanced thumbnail generation loaded');
          }
        }, 500);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
      } catch (error) {
        console.error('Failed to auto-integrate thumbnail generation:', error);
      }
    })();
  `;
}

/**
 * Initialize the integration manually
 * 
 * @param {string} dashboardSelector - CSS selector for the dashboard element
 * @param {Object} options - Configuration options for thumbnail generation
 * @returns {Promise<boolean>} - Whether the integration was successful
 */
async function initializeThumbnailIntegration(dashboardSelector = '.pyarrow-content-index-dashboard', options = {}) {
  return new Promise((resolve) => {
    try {
      // Wait for the dashboard to be available in the DOM
      const checkInterval = setInterval(() => {
        const dashboardElement = document.querySelector(dashboardSelector);
        if (dashboardElement && window.contentIndexDashboard) {
          clearInterval(checkInterval);
          
          // Integrate with the dashboard instance
          const result = integrateThumbnails(window.contentIndexDashboard, options);
          resolve(result);
        }
      }, 500);
      
      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 10000);
    } catch (error) {
      console.error('Thumbnail integration initialization failed:', error);
      resolve(false);
    }
  });
}

// Export the module functions
module.exports = {
  integrateThumbnails,
  createThumbnailIntegrationLoader,
  initializeThumbnailIntegration
};