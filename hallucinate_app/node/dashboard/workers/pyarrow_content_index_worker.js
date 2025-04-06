/**
 * Web Worker for PyArrow Content Index Dashboard
 * Handles data processing tasks in a separate thread to avoid blocking the UI
 */

// Process messages from the main thread
self.onmessage = function(event) {
  const { task, data, id } = event.data;
  
  try {
    let result;
    
    switch (task) {
      case 'processVisualizationData':
        result = processVisualizationData(data);
        break;
      case 'filterEntries':
        result = filterEntries(data.entries, data.query, data.filter);
        break;
      case 'sortEntries':
        result = sortEntries(data.entries, data.sortField, data.sortDirection);
        break;
      case 'processThumbnailData':
        result = processThumbnailData(data);
        break;
      case 'searchAndFilter':
        result = searchAndFilter(data.entries, data.query, data.filter);
        break;
      case 'generateStats':
        result = generateStats(data.entries);
        break;
      default:
        throw new Error(`Unknown task: ${task}`);
    }
    
    // Send successful result back to main thread
    self.postMessage({ 
      id, 
      result, 
      success: true 
    });
  } catch (error) {
    // Send error back to main thread
    self.postMessage({ 
      id, 
      error: { 
        message: error.message, 
        stack: error.stack 
      }, 
      success: false 
    });
  }
};

/**
 * Process statistics data for visualizations
 * 
 * @param {Object} data - Statistics data
 * @returns {Object} Processed visualization data
 */
function processVisualizationData(data) {
  if (!data) return {};
  
  const result = {};
  
  // Process content type distribution
  if (data.type_counts) {
    result.contentTypeDistribution = Object.entries(data.type_counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  } else {
    result.contentTypeDistribution = [];
  }
  
  // Process size distribution
  if (data.size_ranges) {
    const sizeOrder = {
      '< 1KB': 0,
      '1KB - 10KB': 1,
      '10KB - 100KB': 2,
      '100KB - 1MB': 3,
      '1MB - 10MB': 4,
      '10MB - 100MB': 5,
      '100MB - 1GB': 6,
      '> 1GB': 7
    };
    
    result.sizeDistribution = Object.entries(data.size_ranges)
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => sizeOrder[a.range] - sizeOrder[b.range]);
  } else {
    result.sizeDistribution = [];
  }
  
  // Process storage location distribution
  if (data.location_counts) {
    result.storageDistribution = Object.entries(data.location_counts)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count);
  } else {
    result.storageDistribution = [];
  }
  
  return result;
}

/**
 * Filter entries based on query and filter criteria
 * 
 * @param {Array} entries - Content index entries
 * @param {string} query - Search query
 * @param {Object} filter - Filter criteria
 * @returns {Array} Filtered entries
 */
function filterEntries(entries, query, filter) {
  if (!entries || !Array.isArray(entries)) return [];
  
  // Make a copy of entries to avoid modifying the original
  let filteredEntries = [...entries];
  
  // Apply filter if present
  if (filter && Object.keys(filter).length > 0) {
    filteredEntries = filteredEntries.filter(entry => {
      // Check all filter criteria
      for (const [key, value] of Object.entries(filter)) {
        // Handle complex filters
        if (typeof value === 'object') {
          // Handle special case for metadata
          if (key === 'metadata') {
            for (const [metaKey, metaValue] of Object.entries(value)) {
              if (!entry.metadata) return false;
              
              if (typeof metaValue === 'object' && metaValue.$exists) {
                // Check if the metadata key exists
                if (!(metaKey in entry.metadata)) return false;
              } else {
                // Check if the metadata value matches
                if (entry.metadata[metaKey] !== metaValue) return false;
              }
            }
          } else if (typeof value.$exists === 'boolean') {
            // Exists check
            const exists = key in entry && entry[key] !== null && entry[key] !== undefined;
            if (value.$exists !== exists) return false;
          } else if (value.$in && Array.isArray(value.$in)) {
            // In check
            if (!value.$in.includes(entry[key])) return false;
          } else if (value.$gt !== undefined) {
            // Greater than check
            if (!(entry[key] > value.$gt)) return false;
          } else if (value.$lt !== undefined) {
            // Less than check
            if (!(entry[key] < value.$lt)) return false;
          } else if (value.$regex) {
            // Regex check
            if (!new RegExp(value.$regex).test(entry[key])) return false;
          }
        } else {
          // Simple equality check
          if (entry[key] !== value) return false;
        }
      }
      
      return true;
    });
  }
  
  // Apply search query if present
  if (query && query.trim()) {
    const normalizedQuery = query.trim().toLowerCase();
    
    filteredEntries = filteredEntries.filter(entry => {
      // Check if query matches CID
      if (entry.cid && entry.cid.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      
      // Check if query matches path
      if (entry.path && entry.path.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      
      // Check if query matches MIME type
      if (entry.mimetype && entry.mimetype.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      
      // Check if query matches metadata
      if (entry.metadata) {
        for (const [key, value] of Object.entries(entry.metadata)) {
          if (
            key.toLowerCase().includes(normalizedQuery) || 
            (typeof value === 'string' && value.toLowerCase().includes(normalizedQuery)) ||
            (typeof value === 'number' && value.toString().includes(normalizedQuery))
          ) {
            return true;
          }
        }
      }
      
      return false;
    });
  }
  
  return filteredEntries;
}

/**
 * Sort entries based on sort field and direction
 * 
 * @param {Array} entries - Content index entries
 * @param {string} sortField - Field to sort by
 * @param {string} sortDirection - Sort direction ('asc' or 'desc')
 * @returns {Array} Sorted entries
 */
function sortEntries(entries, sortField, sortDirection) {
  if (!entries || !Array.isArray(entries)) return [];
  
  // Make a copy of entries to avoid modifying the original
  const sortedEntries = [...entries];
  
  // Define sort function based on field and direction
  const sortFn = (a, b) => {
    // Handle missing values (treat as "lowest")
    if (a[sortField] === null || a[sortField] === undefined) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (b[sortField] === null || b[sortField] === undefined) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    
    // Special handling for different data types
    if (typeof a[sortField] === 'string' && typeof b[sortField] === 'string') {
      // Case-insensitive string comparison
      const result = a[sortField].localeCompare(b[sortField]);
      return sortDirection === 'asc' ? result : -result;
    } else if (sortField.includes('date') || sortField.includes('time') || sortField.includes('_at')) {
      // Date comparison
      const dateA = new Date(a[sortField]);
      const dateB = new Date(b[sortField]);
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    } else {
      // Default numeric comparison
      return sortDirection === 'asc' ? a[sortField] - b[sortField] : b[sortField] - a[sortField];
    }
  };
  
  // Apply sort
  return sortedEntries.sort(sortFn);
}

/**
 * Process data for thumbnail generation
 * Performs initial processing for thumbnail data before rendering
 * 
 * @param {Object} data - Thumbnail data
 * @returns {Object} Processed thumbnail data
 */
function processThumbnailData(data) {
  // This function would be expanded based on specific thumbnail processing needs
  // For now, it's a placeholder for the worker's capability
  return data;
}

/**
 * Combined search and filter operation for better performance
 * 
 * @param {Array} entries - Content index entries
 * @param {string} query - Search query
 * @param {Object} filter - Filter criteria
 * @returns {Object} Results with filtered entries and stats
 */
function searchAndFilter(entries, query, filter) {
  const filteredEntries = filterEntries(entries, query, filter);
  const stats = generateStats(filteredEntries);
  
  return {
    entries: filteredEntries,
    total: filteredEntries.length,
    stats
  };
}

/**
 * Generate statistics from entries
 * 
 * @param {Array} entries - Content index entries
 * @returns {Object} Statistics
 */
function generateStats(entries) {
  if (!entries || !Array.isArray(entries)) return {};
  
  const stats = {
    total: entries.length,
    type_counts: {},
    size_ranges: {
      '< 1KB': 0,
      '1KB - 10KB': 0,
      '10KB - 100KB': 0,
      '100KB - 1MB': 0,
      '1MB - 10MB': 0,
      '10MB - 100MB': 0,
      '100MB - 1GB': 0,
      '> 1GB': 0
    },
    location_counts: {},
    updated_range: {
      oldest: null,
      newest: null
    }
  };
  
  // Process each entry
  for (const entry of entries) {
    // Count MIME types
    if (entry.mimetype) {
      const type = entry.mimetype.split('/')[0] || 'unknown';
      stats.type_counts[type] = (stats.type_counts[type] || 0) + 1;
    } else {
      stats.type_counts.unknown = (stats.type_counts.unknown || 0) + 1;
    }
    
    // Count size ranges
    if (entry.size) {
      const sizeInKB = entry.size / 1024;
      
      if (sizeInKB < 1) {
        stats.size_ranges['< 1KB']++;
      } else if (sizeInKB < 10) {
        stats.size_ranges['1KB - 10KB']++;
      } else if (sizeInKB < 100) {
        stats.size_ranges['10KB - 100KB']++;
      } else if (sizeInKB < 1024) {
        stats.size_ranges['100KB - 1MB']++;
      } else if (sizeInKB < 10240) {
        stats.size_ranges['1MB - 10MB']++;
      } else if (sizeInKB < 102400) {
        stats.size_ranges['10MB - 100MB']++;
      } else if (sizeInKB < 1048576) {
        stats.size_ranges['100MB - 1GB']++;
      } else {
        stats.size_ranges['> 1GB']++;
      }
    }
    
    // Count storage locations
    if (entry.locations) {
      for (const location in entry.locations) {
        if (Array.isArray(entry.locations[location]) && entry.locations[location].length) {
          stats.location_counts[location] = (stats.location_counts[location] || 0) + 1;
        } else if (entry.locations[location] && typeof entry.locations[location] === 'object') {
          stats.location_counts[location] = (stats.location_counts[location] || 0) + 1;
        } else if (entry.locations[location]) {
          stats.location_counts[location] = (stats.location_counts[location] || 0) + 1;
        }
      }
    }
    
    // Track update time range
    if (entry.updated_at) {
      const updateTime = new Date(entry.updated_at).getTime();
      
      if (!stats.updated_range.newest || updateTime > stats.updated_range.newest) {
        stats.updated_range.newest = updateTime;
      }
      
      if (!stats.updated_range.oldest || updateTime < stats.updated_range.oldest) {
        stats.updated_range.oldest = updateTime;
      }
    }
  }
  
  return stats;
}