/**
 * Database Backup Bridge Tests
 *
 * Tests the database backup functionality which integrates with PyArrow Content Index
 * for efficient metadata tracking of database backups on IPFS.
 */

const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

// Import components to test
const { DatabaseBackupBridge } = require('../../hallucinate_app/node/database_backup_bridge');
const { authManager } = require('../../hallucinate_app/node/auth');
const { registerDatabaseBackupDashboard } = require('../../hallucinate_app/node/dashboard/register_database_backup_dashboard');

// Create test environment
describe('Database Backup System Tests', function() {
  // Increase timeout for IPFS operations
  this.timeout(30000);
  
  let databaseBackupBridge;
  let tempDir;
  let mockPythonBridge;
  let mockAuthManager;
  let mockDashboard;
  let sandbox;
  
  before(async function() {
    // Set up temp directory for test data
    tempDir = path.join(os.tmpdir(), `test-backup-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    // Create mock Python bridge
    mockPythonBridge = {
      callMethod: sinon.stub().resolves({ success: true })
    };
    
    // Create mock auth manager
    mockAuthManager = {
      initialized: true,
      init: sinon.stub().resolves(true),
      getCapabilityToken: sinon.stub().resolves('mock-auth-token'),
      checkCapability: sinon.stub().resolves(true)
    };
    
    // Set up sandbox for stubs/spies
    sandbox = sinon.createSandbox();
    
    // Create mock dashboard
    mockDashboard = {
      element: {},
      eventBus: {
        on: sinon.stub(),
        emit: sinon.stub()
      },
      ipc: {
        handle: sinon.stub()
      },
      registerPanel: sinon.stub().returns(true)
    };
    
    // Initialize the bridge with mocks
    databaseBackupBridge = new DatabaseBackupBridge({
      resources: {
        pythonBridge: mockPythonBridge,
        auth: mockAuthManager
      },
      metadata: {
        backup_dir: path.join(tempDir, 'backups'),
        temp_dir: path.join(tempDir, 'temp')
      }
    });
    
    // Initialize the bridge
    await databaseBackupBridge.init();
  });
  
  after(async function() {
    // Clean up temp directories
    await fs.remove(tempDir);
    
    // Reset sandbox
    sandbox.restore();
  });
  
  describe('Bridge Initialization', function() {
    it('should initialize successfully', function() {
      expect(databaseBackupBridge._initialized).to.be.true;
    });
    
    it('should create required directories', function() {
      expect(fs.existsSync(path.join(tempDir, 'backups'))).to.be.true;
      expect(fs.existsSync(path.join(tempDir, 'temp'))).to.be.true;
    });
  });
  
  describe('OrbitDB Backup Operations', function() {
    it('should backup OrbitDB successfully', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'backup_orbitdb',
        sinon.match.any
      ).resolves({
        success: true,
        backup_id: 'test-backup-123',
        timestamp: new Date().toISOString(),
        cid: 'QmTestCid123456789',
        collections: ['users', 'posts'],
        document_count: 42
      });
      
      // Call backup method
      const result = await databaseBackupBridge.backupOrbitDB({
        collections: ['users', 'posts'],
        auth_token: 'test-token',
        metadata: { description: 'Test backup' }
      });
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.backup_id).to.equal('test-backup-123');
      expect(result.cid).to.equal('QmTestCid123456789');
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'backup_orbitdb'
      )).to.be.true;
      
      const callArgs = mockPythonBridge.callMethod.args[0][2];
      expect(callArgs.collections).to.deep.equal(['users', 'posts']);
      expect(callArgs.auth_token).to.equal('test-token');
      expect(callArgs.metadata).to.deep.equal({ description: 'Test backup' });
    });
    
    it('should restore OrbitDB successfully', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'restore_orbitdb',
        sinon.match.any
      ).resolves({
        success: true,
        backup_id: 'test-backup-123',
        restored_collections: ['users', 'posts'],
        document_count: 42
      });
      
      // Call restore method
      const result = await databaseBackupBridge.restoreOrbitDB({
        backup_id: 'test-backup-123',
        auth_token: 'test-token',
        target_collections: ['users']
      });
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.backup_id).to.equal('test-backup-123');
      expect(result.restored_collections).to.deep.equal(['users', 'posts']);
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'restore_orbitdb'
      )).to.be.true;
      
      const callArgs = mockPythonBridge.callMethod.args[1][2];
      expect(callArgs.backup_id).to.equal('test-backup-123');
      expect(callArgs.auth_token).to.equal('test-token');
      expect(callArgs.target_collections).to.deep.equal(['users']);
    });
    
    it('should list OrbitDB backups successfully', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'list_backups',
        sinon.match.any
      ).resolves({
        success: true,
        backups: [
          {
            backup_id: 'test-backup-123',
            timestamp: new Date().toISOString(),
            cid: 'QmTestCid123456789',
            collections: ['users', 'posts'],
            document_count: 42
          },
          {
            backup_id: 'test-backup-456',
            timestamp: new Date().toISOString(),
            cid: 'QmTestCid987654321',
            collections: ['settings'],
            document_count: 5
          }
        ]
      });
      
      // Call list method
      const result = await databaseBackupBridge.listBackups('orbitdb', 'test-token');
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.backups).to.be.an('array').with.lengthOf(2);
      expect(result.backups[0].backup_id).to.equal('test-backup-123');
      expect(result.backups[1].backup_id).to.equal('test-backup-456');
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'list_backups'
      )).to.be.true;
      
      const callArgs = mockPythonBridge.callMethod.args[2][2];
      expect(callArgs.db_type).to.equal('orbitdb');
      expect(callArgs.auth_token).to.equal('test-token');
    });
  });
  
  describe('FireproofDB Backup Operations', function() {
    it('should backup FireproofDB successfully', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'backup_fireproofdb',
        sinon.match.any
      ).resolves({
        success: true,
        backup_id: 'fp-backup-123',
        timestamp: new Date().toISOString(),
        cid: 'QmFpTestCid123456789',
        collections: ['documents', 'contacts'],
        document_count: 25
      });
      
      // Call backup method
      const result = await databaseBackupBridge.backupFireproofDB({
        collections: ['documents', 'contacts'],
        auth_token: 'test-token',
        metadata: { description: 'Test FireproofDB backup' }
      });
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.backup_id).to.equal('fp-backup-123');
      expect(result.cid).to.equal('QmFpTestCid123456789');
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'backup_fireproofdb'
      )).to.be.true;
    });
  });
  
  describe('DuckDB Backup Operations', function() {
    it('should backup DuckDB successfully', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'backup_duckdb',
        sinon.match.any
      ).resolves({
        success: true,
        backup_id: 'duck-backup-123',
        timestamp: new Date().toISOString(),
        cid: 'QmDuckTestCid123456789',
        tables: ['analytics', 'metrics'],
        document_count: {
          analytics: 150,
          metrics: 75
        }
      });
      
      // Call backup method
      const result = await databaseBackupBridge.backupDuckDB({
        tables: ['analytics', 'metrics'],
        auth_token: 'test-token',
        metadata: { description: 'Test DuckDB backup' }
      });
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.backup_id).to.equal('duck-backup-123');
      expect(result.cid).to.equal('QmDuckTestCid123456789');
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'backup_duckdb'
      )).to.be.true;
    });
  });
  
  describe('Backup Scheduling', function() {
    it('should create a scheduled backup', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'schedule_backup',
        sinon.match.any
      ).resolves({
        success: true,
        schedule_id: 123,
        db_type: 'orbitdb',
        interval: 24,
        collections: ['users', 'posts'],
        description: 'Daily backup',
        active: true
      });
      
      // Call schedule method
      const schedule = {
        db_type: 'orbitdb',
        interval: 24,
        collections: ['users', 'posts'],
        description: 'Daily backup',
        active: true
      };
      
      const result = await databaseBackupBridge.scheduleBackup(schedule, 'test-token');
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.schedule_id).to.equal(123);
      expect(result.db_type).to.equal('orbitdb');
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'schedule_backup'
      )).to.be.true;
      
      const callArgs = mockPythonBridge.callMethod.getCall(4).args[2];
      expect(callArgs.schedule).to.deep.equal(schedule);
    });
    
    it('should list scheduled backups', async function() {
      // Setup mock response for Python bridge
      mockPythonBridge.callMethod.withArgs(
        'database_backup_manager',
        'list_schedules',
        sinon.match.any
      ).resolves({
        success: true,
        schedules: [
          {
            id: 123,
            db_type: 'orbitdb',
            interval: 24,
            collections: ['users', 'posts'],
            description: 'Daily backup',
            active: true,
            last_run: null
          },
          {
            id: 456,
            db_type: 'fireproofdb',
            interval: 168, // Weekly
            collections: null, // All collections
            description: 'Weekly full backup',
            active: true,
            last_run: new Date().toISOString()
          }
        ]
      });
      
      // Call list schedules method
      const result = await databaseBackupBridge.listSchedules('test-token');
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.schedules).to.be.an('array').with.lengthOf(2);
      expect(result.schedules[0].id).to.equal(123);
      expect(result.schedules[1].id).to.equal(456);
      
      // Verify Python bridge was called with correct arguments
      expect(mockPythonBridge.callMethod.calledWith(
        'database_backup_manager',
        'list_schedules'
      )).to.be.true;
    });
  });
  
  describe('Dashboard Registration', function() {
    it('should register the dashboard successfully', async function() {
      // Call register function
      const result = await registerDatabaseBackupDashboard(mockDashboard, {
        pythonBridge: mockPythonBridge,
        resources: {
          auth: mockAuthManager
        }
      });
      
      // Verify result
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      
      // Verify dashboard registration
      expect(mockDashboard.registerPanel.called).to.be.true;
      expect(mockDashboard.ipc.handle.called).to.be.true;
      
      // Verify IPC handlers were registered
      const expectedHandlers = [
        'database-backup:backup-orbitdb',
        'database-backup:backup-fireproofdb',
        'database-backup:backup-duckdb',
        'database-backup:restore-orbitdb',
        'database-backup:restore-fireproofdb',
        'database-backup:restore-duckdb',
        'database-backup:list-backups',
        'database-backup:get-backup-info',
        'database-backup:delete-backup',
        'database-backup:schedule-backup',
        'database-backup:list-schedules',
        'database-backup:delete-schedule',
        'database-backup:test'
      ];
      
      // Check that all expected handlers were registered
      for (const handler of expectedHandlers) {
        const registered = mockDashboard.ipc.handle.calledWith(handler);
        expect(registered, `Handler "${handler}" should be registered`).to.be.true;
      }
    });
  });
});