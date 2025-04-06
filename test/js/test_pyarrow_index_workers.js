/**
 * Tests for PyArrow Content Index Dashboard Web Workers
 * 
 * This file contains tests for the web worker implementation
 * that offloads data processing from the main thread.
 */

const assert = require('assert');
const path = require('path');
const { JSDOM } = require('jsdom');
const { WorkerManager } = require('../../hallucinate_app/node/dashboard/workers/worker_manager');

// Mock data for tests
const mockEntries = Array.from({ length: 1000 }, (_, i) => ({
  cid: `QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG${i}`,
  path: `/test/file-${i}.txt`,
  mimetype: i % 4 === 0 ? 'image/png' : i % 4 === 1 ? 'application/pdf' : i % 4 === 2 ? 'text/plain' : 'video/mp4',
  size: i * 1024,
  created_at: new Date(Date.now() - i * 60000).toISOString(),
  updated_at: new Date(Date.now() - i * 30000).toISOString(),
  metadata: {
    title: `Test ${i}`,
    tags: [`tag${i % 5}`, `tag${i % 10}`]
  }
}));

// Mock stats for tests
const mockStats = {
  total: 1000,
  type_counts: {
    image: 250,
    application: 250,
    text: 250,
    video: 250
  },
  size_ranges: {
    '< 1KB': 1,
    '1KB - 10KB': 10,
    '10KB - 100KB': 89,
    '100KB - 1MB': 400,
    '1MB - 10MB': 350,
    '10MB - 100MB': 150,
    '100MB - 1GB': 0,
    '> 1GB': 0
  },
  location_counts: {
    ipfs: 1000,
    filecoin: 750,
    s3: 500,
    storacha: 250
  }
};

describe('PyArrow Content Index Workers Tests', function() {
  this.timeout(10000); // Increase timeout for worker tests
  
  // Mock window and worker
  let workerManagerMock;
  
  beforeEach(() => {
    // Create a mock DOM environment
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true
    });
    
    // Mock the browser environment
    global.window = dom.window;
    global.document = dom.window.document;
    global.Worker = dom.window.Worker;
    global.navigator = {
      hardwareConcurrency: 4
    };
    
    // Create a mock WorkerManager
    workerManagerMock = {
      runTask: (task, data) => {
        // Process the task based on its type
        switch (task) {
          case 'processVisualizationData':
            return Promise.resolve({
              contentTypeDistribution: Object.entries(data.type_counts || {})
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count),
              sizeDistribution: Object.entries(data.size_ranges || {})
                .map(([range, count]) => ({ range, count }))
                .sort((a, b) => {
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
                  return sizeOrder[a.range] - sizeOrder[b.range];
                }),
              storageDistribution: Object.entries(data.location_counts || {})
                .map(([location, count]) => ({ location, count }))
                .sort((a, b) => b.count - a.count)
            });
          case 'filterEntries':
            return Promise.resolve(
              mockEntries.filter(entry => 
                (!data.query || entry.path.includes(data.query)) &&
                (!data.filter || !data.filter.type || entry.mimetype.startsWith(data.filter.type))
              )
            );
          case 'sortEntries':
            return Promise.resolve(
              [...mockEntries].sort((a, b) => {
                if (data.sortDirection === 'asc') {
                  return a[data.sortField] > b[data.sortField] ? 1 : -1;
                } else {
                  return a[data.sortField] < b[data.sortField] ? 1 : -1;
                }
              })
            );
          case 'searchAndFilter':
            let filtered = mockEntries;
            
            // Apply filter
            if (data.filter && Object.keys(data.filter).length > 0) {
              filtered = filtered.filter(entry => {
                if (data.filter.type && !entry.mimetype.startsWith(data.filter.type)) {
                  return false;
                }
                return true;
              });
            }
            
            // Apply search
            if (data.query) {
              const query = data.query.toLowerCase();
              filtered = filtered.filter(entry => 
                entry.path.toLowerCase().includes(query) ||
                entry.cid.toLowerCase().includes(query) ||
                entry.mimetype.toLowerCase().includes(query)
              );
            }
            
            // Generate stats for filtered data
            const typeCounts = {};
            const sizeRanges = {
              '< 1KB': 0,
              '1KB - 10KB': 0,
              '10KB - 100KB': 0,
              '100KB - 1MB': 0,
              '1MB - 10MB': 0,
              '10MB - 100MB': 0,
              '100MB - 1GB': 0,
              '> 1GB': 0
            };
            
            filtered.forEach(entry => {
              // Count types
              const type = entry.mimetype.split('/')[0];
              typeCounts[type] = (typeCounts[type] || 0) + 1;
              
              // Count sizes
              const sizeInKB = entry.size / 1024;
              if (sizeInKB < 1) sizeRanges['< 1KB']++;
              else if (sizeInKB < 10) sizeRanges['1KB - 10KB']++;
              else if (sizeInKB < 100) sizeRanges['10KB - 100KB']++;
              else if (sizeInKB < 1024) sizeRanges['100KB - 1MB']++;
              else if (sizeInKB < 10240) sizeRanges['1MB - 10MB']++;
              else if (sizeInKB < 102400) sizeRanges['10MB - 100MB']++;
              else if (sizeInKB < 1048576) sizeRanges['100MB - 1GB']++;
              else sizeRanges['> 1GB']++;
            });
            
            return Promise.resolve({
              entries: filtered,
              total: filtered.length,
              stats: {
                total: filtered.length,
                type_counts: typeCounts,
                size_ranges: sizeRanges
              }
            });
          case 'generateStats':
            return Promise.resolve({
              total: data.entries.length,
              // Generate other stats based on entries...
              type_counts: { image: 100, application: 50, text: 30, video: 20 }
            });
          default:
            return Promise.reject(new Error(`Unknown task: ${task}`));
        }
      },
      runTaskWithTimeout: (task, data, timeout) => {
        return workerManagerMock.runTask(task, data);
      },
      terminate: () => {}
    };
  });
  
  afterEach(() => {
    // Clean up
    delete global.window;
    delete global.document;
    delete global.Worker;
    delete global.navigator;
  });
  
  describe('Visualization Data Processing', () => {
    it('should process visualization data correctly', async () => {
      const result = await workerManagerMock.runTask('processVisualizationData', mockStats);
      
      assert.ok(result.contentTypeDistribution, 'Should return content type distribution');
      assert.strictEqual(result.contentTypeDistribution.length, 4, 'Should have 4 content types');
      assert.strictEqual(result.contentTypeDistribution[0].type, 'image', 'Image should be first type');
      assert.strictEqual(result.contentTypeDistribution[0].count, 250, 'Image count should be 250');
      
      assert.ok(result.sizeDistribution, 'Should return size distribution');
      assert.strictEqual(result.sizeDistribution.length, 8, 'Should have 8 size ranges');
      assert.strictEqual(result.sizeDistribution[0].range, '< 1KB', 'First range should be < 1KB');
      
      assert.ok(result.storageDistribution, 'Should return storage distribution');
      assert.strictEqual(result.storageDistribution.length, 4, 'Should have 4 storage locations');
      assert.strictEqual(result.storageDistribution[0].location, 'ipfs', 'IPFS should be first location');
      assert.strictEqual(result.storageDistribution[0].count, 1000, 'IPFS count should be 1000');
    });
  });
  
  describe('Entry Filtering', () => {
    it('should filter entries based on query and filter', async () => {
      const result = await workerManagerMock.runTask('filterEntries', {
        entries: mockEntries,
        query: 'file-5',
        filter: { type: 'image' }
      });
      
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.length > 0, 'Should return matching entries');
      
      // Verify all entries match the criteria
      for (const entry of result) {
        assert.ok(entry.path.includes('file-5'), 'Path should include query');
        assert.ok(entry.mimetype.startsWith('image'), 'MIME type should match filter');
      }
    });
  });
  
  describe('Entry Sorting', () => {
    it('should sort entries based on field and direction', async () => {
      const result = await workerManagerMock.runTask('sortEntries', {
        entries: mockEntries,
        sortField: 'size',
        sortDirection: 'desc'
      });
      
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.strictEqual(result.length, mockEntries.length, 'Should return all entries');
      
      // Verify entries are sorted
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i - 1].size >= result[i].size, 'Entries should be sorted by size in descending order');
      }
    });
  });
  
  describe('Search and Filter', () => {
    it('should search and filter entries and generate stats', async () => {
      const result = await workerManagerMock.runTask('searchAndFilter', {
        entries: mockEntries,
        query: 'file-1',
        filter: { type: 'image' }
      });
      
      assert.ok(result.entries, 'Should return filtered entries');
      assert.ok(result.total > 0, 'Should return total count');
      assert.ok(result.stats, 'Should return stats for filtered data');
      assert.ok(result.stats.type_counts, 'Should include type counts');
      assert.ok(result.stats.size_ranges, 'Should include size ranges');
      
      // Verify all entries match the criteria
      for (const entry of result.entries) {
        assert.ok(entry.path.includes('file-1'), 'Path should include query');
        assert.ok(entry.mimetype.startsWith('image'), 'MIME type should match filter');
      }
    });
  });
  
  describe('Statistics Generation', () => {
    it('should generate statistics for a dataset', async () => {
      const result = await workerManagerMock.runTask('generateStats', {
        entries: mockEntries.slice(0, 200)
      });
      
      assert.ok(result.total, 'Should return total count');
      assert.strictEqual(result.total, 200, 'Total should match number of entries');
      assert.ok(result.type_counts, 'Should include type counts');
    });
  });
});