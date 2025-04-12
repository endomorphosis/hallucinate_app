/**
 * Tests for the Database Backup PyArrow Adapter
 * 
 * Verifies the functionality of the database backup PyArrow adapter
 * for enhancing database backups with PyArrow Content Index integration.
 */

import assert from 'assert';
import { 
  DatabaseBackupPyArrowAdapter, 
  databaseBackupPyArrowAdapter 
} from '../../hallucinate_app/node/database_backup_pyarrow_adapter.js';
import { databaseBackupBridge } from '../../hallucinate_app/node/database_backup_bridge.js';
import PyArrowIndexBridge from '../../hallucinate_app/node/pyarrow_index_bridge.js';

// Mock Objects
const mockPyArrowIndexBridge = {
  initialized: true,
  init: async () => true,
  query: async (query) => {
    if (query.count_only) {
      return { count: 5 };
    }
    
    // Return mock backups based on filter
    if (query.filter && query.filter.includes("orbitdb")) {
      return [
        {
          cid: 'QmTest1',
          backup_id: 'orbit-backup-1',
          db_type: 'orbitdb',
          created_at: new Date().toISOString(),
          path: '/backups/databases/orbitdb/backup-1',
          metadata: {
            restore_count: 2,
            last_restored: new Date().toISOString()
          },
          size: 1024 * 1024,
          document_count: 150,
          collections: ['users', 'posts']
        }
      ];
    }
    
    return [
      {
        cid: 'QmTest1',
        backup_id: 'orbit-backup-1',
        db_type: 'orbitdb',
        created_at: new Date().toISOString(),
        path: '/backups/databases/orbitdb/backup-1',
        metadata: { 
          restore_count: 2,
          last_restored: new Date().toISOString()
        },
        size: 1024 * 1024,
        document_count: 150,
        collections: ['users', 'posts']
      },
      {
        cid: 'QmTest2',
        backup_id: 'fireproof-backup-1',
        db_type: 'fireproofdb',
        created_at: new Date().toISOString(),
        path: '/backups/databases/fireproofdb/backup-1',
        metadata: { restore_count: 0 },
        size: 2048 * 1024,
        document_count: 300,
        collections: ['documents', 'settings']
      }
    ];
  },
  lookupByCid: async (cid) => {
    return {
      cid,
      backup_id: 'test-backup-' + cid.substring(cid.length - 3),
      db_type: 'orbitdb',
      created_at: new Date().toISOString(),
      path: '/backups/databases/orbitdb/test-backup',
      metadata: { restore_count: 1 },
      size: 1024 * 1024,
      document_count: 150
    };
  },
  addEntry: async (entry) => {
    return { ...entry, id: 'test-id-' + Date.now() };
  },
  updateEntry: async (cid, updateData) => {
    return { 
      cid,
      backup_id: 'test-backup-' + cid.substring(cid.length - 3),
      db_type: 'orbitdb',
      metadata: {
        ...updateData.metadata
      }
    };
  }
};

const mockBackupBridge = {
  listBackups: async () => ({
    backups: [
      { backup_id: 'orbit-backup-1', cid: 'QmTest1' },
      { backup_id: 'orbit-backup-2', cid: 'QmTest2' }
    ]
  }),
  getBackupInfo: async () => ({
    backup_id: 'orbit-backup-1',
    cid: 'QmTest1',
    created_at: new Date().toISOString(),
    size: 1024 * 1024,
    document_count: 150,
    collections: ['users', 'posts']
  })
};

// Test suite for DatabaseBackupPyArrowAdapter
describe('DatabaseBackupPyArrowAdapter', function() {
  let adapter;
  
  before(async function() {
    // Create adapter instance with mock dependencies
    adapter = new DatabaseBackupPyArrowAdapter({
      resources: {
        pyarrowIndexBridge: mockPyArrowIndexBridge,
        databaseBackupBridge: mockBackupBridge
      }
    });
    
    // Wait for initialization to finish
    await adapter.init();
  });
  
  describe('Basic Functionality', function() {
    it('should initialize successfully', function() {
      assert.strictEqual(adapter.resources.pyarrowIndexBridge.initialized, true);
    });
    
    it('should have metrics collector set up', function() {
      assert.ok(adapter.metricsCollector);
      assert.equal(typeof adapter.metricsCollector.createCounter, 'function');
    });
  });
  
  describe('Backup Operations', function() {
    it('should register a backup in the index', async function() {
      const backupData = {
        backup_id: 'test-backup-123',
        cid: 'QmTestCid123',
        db_type: 'orbitdb',
        size: 1024 * 1024,
        document_count: 150,
        collections: ['users', 'posts']
      };
      
      const result = await adapter._registerBackupInIndex(backupData);
      
      assert.ok(result);
      assert.strictEqual(result.cid, backupData.cid);
      assert.strictEqual(result.db_type, backupData.db_type);
      assert.ok(result.virtual_path);
      assert.ok(result.virtual_path.includes(backupData.db_type));
    });
    
    it('should update backup restore metadata', async function() {
      const restoreData = {
        backup_id: 'test-backup-123',
        cid: 'QmTestCid123',
        db_type: 'orbitdb',
        collections_restored: ['users', 'posts'],
        document_count: 150
      };
      
      const result = await adapter._updateBackupRestoreMetadata(restoreData);
      
      assert.ok(result);
      assert.strictEqual(result.cid, restoreData.cid);
      assert.ok(result.metadata);
      assert.ok(result.metadata.restore_count >= 1);
      assert.ok(result.metadata.last_restored);
    });
  });
  
  describe('Search Functionality', function() {
    it('should search for backups with filters', async function() {
      const searchOptions = {
        db_type: 'orbitdb',
        text: '',
        filter: {
          date_from: '2023-01-01'
        },
        sort: { field: 'created_at', direction: 'desc' },
        limit: 10
      };
      
      const results = await adapter.searchBackups(searchOptions);
      
      assert.ok(results);
      assert.ok(Array.isArray(results.backups));
      assert.ok(results.backups.length > 0);
      assert.strictEqual(results.backups[0].db_type, 'orbitdb');
    });
    
    it('should get details for a specific backup', async function() {
      const result = await adapter.getBackupDetails({ 
        cid: 'QmTestCid123'
      });
      
      assert.ok(result);
      assert.strictEqual(result.cid, 'QmTestCid123');
      assert.ok(result.enhanced_metadata);
    });
    
    it('should get aggregated backup statistics', async function() {
      const stats = await adapter.getBackupStats();
      
      assert.ok(stats);
      assert.ok(stats.total_count >= 0);
      assert.ok(stats.by_db_type);
      assert.ok(stats.restore_metrics);
      assert.ok(stats.size_metrics);
    });
  });
  
  describe('Sync Operations', function() {
    it('should sync backups to the index', async function() {
      const syncResults = await adapter.syncBackupsToIndex({
        db_type: 'orbitdb'
      });
      
      assert.ok(syncResults);
      assert.ok(syncResults.total >= 0);
      assert.ok(syncResults.indexed >= 0);
      assert.ok('newly_indexed' in syncResults);
      assert.ok('errors' in syncResults);
    });
  });
  
  describe('Testing Interface', function() {
    it('should run tests successfully', async function() {
      const testResult = await adapter.test();
      
      assert.ok(testResult);
      assert.equal(testResult.module, 'DatabaseBackupPyArrowAdapter');
      assert.ok('operations' in testResult);
      assert.ok('diagnostics' in testResult);
    });
  });
});

// Run tests
if (typeof require !== 'undefined' && require.main === module) {
  describe('DatabaseBackupPyArrowAdapter', function() {
    it('should run tests successfully from command line', async function() {
      console.log('Running tests for DatabaseBackupPyArrowAdapter...');
      
      // Create test instance with mocks
      const testAdapter = new DatabaseBackupPyArrowAdapter({
        resources: {
          pyarrowIndexBridge: mockPyArrowIndexBridge,
          databaseBackupBridge: mockBackupBridge
        }
      });
      
      // Run the test method
      const result = await testAdapter.test();
      console.log('Test result:', JSON.stringify(result, null, 2));
      
      assert.ok(result);
      assert.equal(result.module, 'DatabaseBackupPyArrowAdapter');
    });
  });
}