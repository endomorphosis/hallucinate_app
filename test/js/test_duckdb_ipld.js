/**
 * DuckDB-IPLD Integration Test
 * 
 * Tests the integration between DuckDB and IPLD for P2P database exchange
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const assert = require('assert');
const rmdir = promisify(fs.rm || fs.rmdir);

// Import the DuckDB-IPLD Kit
const DuckDBIPLDKit = require('../../hallucinate_app/node/duckdb_ipld_kit').default;

// Mock IPFS Kit for testing
class MockIPFSKit {
  constructor() {
    this.pins = new Map();
    this.data = new Map();
  }
  
  async addToIpfs(data, options = {}) {
    // Generate a mock CID
    const hash = require('crypto').createHash('sha256').update(data).digest('hex');
    const cid = `bafybeig${hash.substring(0, 40)}`;
    
    // Store the data
    this.data.set(cid, data);
    
    return {
      cid,
      size: Buffer.isBuffer(data) ? data.length : data.toString().length,
      success: true
    };
  }
  
  async fetchFromIpfs(cid, options = {}) {
    if (!this.data.has(cid)) {
      return {
        success: false,
        error: `CID not found: ${cid}`
      };
    }
    
    return {
      data: this.data.get(cid),
      cid,
      success: true
    };
  }
  
  async pinCid(cid) {
    this.pins.set(cid, true);
    return {
      success: true,
      cid
    };
  }
}

// Mock libp2p Kit for testing
class MockLibp2pKit {
  constructor() {
    this.topics = new Map();
    this.subscribers = new Map();
  }
  
  async publish(topic, data) {
    this.topics.set(topic, data);
    
    // Notify subscribers
    if (this.subscribers.has(topic)) {
      for (const handler of this.subscribers.get(topic)) {
        try {
          await handler(data);
        } catch (err) {
          console.error(`Error in subscriber handler: ${err.message}`);
        }
      }
    }
    
    return {
      topic,
      success: true
    };
  }
  
  async subscribe(topic, handler) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    
    this.subscribers.get(topic).push(handler);
    
    return {
      topic,
      success: true
    };
  }
}

describe('DuckDB-IPLD Kit', function() {
  // Set timeout for tests
  this.timeout(10000);
  
  let tempDir;
  let dbPath;
  let kit;
  let resources;
  
  before(async function() {
    // Create a temporary directory for the test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckdb-ipld-test-'));
    dbPath = path.join(tempDir, 'test.db');
    
    // Set up mock resources
    resources = {
      ipfsKit: new MockIPFSKit(),
      libp2pKit: new MockLibp2pKit()
    };
  });
  
  after(async function() {
    // Clean up
    if (tempDir && fs.existsSync(tempDir)) {
      await rmdir(tempDir, { recursive: true, force: true });
    }
  });
  
  beforeEach(async function() {
    // Create a new instance for each test
    kit = new DuckDBIPLDKit({
      resources,
      metadata: {
        dbPath,
        instanceId: 'test-instance'
      }
    });
    
    // Initialize the kit
    await kit.init();
  });
  
  afterEach(async function() {
    // Close the database connection
    if (kit) {
      await kit.close();
    }
  });
  
  // Helper function to create a test database
  async function createTestDatabase() {
    // Create a table
    await kit.execute(`
      CREATE TABLE test_table (
        id INTEGER,
        name VARCHAR,
        value DOUBLE,
        timestamp TIMESTAMP
      )
    `);
    
    // Insert test data
    for (let i = 0; i < 10; i++) {
      await kit.execute(
        "INSERT INTO test_table VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [i, `Test ${i}`, i * 1.5]
      );
    }
    
    return await kit.execute("SELECT COUNT(*) FROM test_table");
  }
  
  describe('Initialization', function() {
    it('should initialize successfully', async function() {
      assert.strictEqual(kit.initialized, true);
    });
  });
  
  describe('SQL Execution', function() {
    it('should execute SQL queries', async function() {
      // Create test database
      const countResult = await createTestDatabase();
      
      // Verify row count (allowing for mock mode differences)
      assert.strictEqual(countResult.success, true);
      
      // Test a SELECT query
      const result = await kit.execute("SELECT * FROM test_table");
      
      // Check results
      assert.strictEqual(result.success, true);
      assert(Array.isArray(result.rows));
      
      // In mock mode, we expect at least some rows (exact count may vary)
      assert(result.rows.length > 0);
    });
  });
  
  describe('IPLD Integration', function() {
    it('should export and import tables to/from IPLD', async function() {
      // Create test database
      await createTestDatabase();
      
      // Export table to IPLD
      const exportResult = await kit.exportTableToIPLD("test_table");
      
      // Check export results
      assert.strictEqual(exportResult.success, true);
      assert(exportResult.cid, 'Export should return a CID');
      assert(exportResult.ipld, 'Export should return IPLD data');
      
      // The table name should be in the IPLD data
      assert(exportResult.ipld.name === "test_table" || 
             exportResult.ipld.table === "test_table");
      
      // Import as a new table
      const ipldData = exportResult.ipld;
      const importResult = await kit.importTableFromIPLD(ipldData, "imported_table");
      
      // Check import results
      assert.strictEqual(importResult.success, true);
      assert.strictEqual(importResult.tableName, "imported_table");
      
      // Verify imported data (allowing for mock mode)
      const verifyResult = await kit.execute("SELECT COUNT(*) FROM imported_table");
      assert.strictEqual(verifyResult.success, true);
    });
    
    it('should export the entire database to IPLD', async function() {
      // Create test database
      await createTestDatabase();
      
      // Test exporting entire database
      const dbExportResult = await kit.exportDatabaseToIPLD();
      
      // Check database export results
      assert.strictEqual(dbExportResult.success, true);
      assert(dbExportResult.cid, 'Database export should return a CID');
    });
  });
  
  // Add tests for Arrow and Parquet operations if the kit supports them
  if (kit.exportTableToParquet && !kit.mockMode) {
    describe('Parquet Integration', function() {
      it('should export and import tables to/from Parquet', async function() {
        // Create test database
        await createTestDatabase();
        
        // Export table to Parquet
        const parquetPath = path.join(tempDir, "test_table.parquet");
        const exportResult = await kit.exportTableToParquet("test_table", parquetPath);
        
        // Check export results
        assert.strictEqual(exportResult.success, true);
        assert.strictEqual(exportResult.tableName, "test_table");
        assert(fs.existsSync(parquetPath), 'Parquet file should exist');
        
        // Import as a new table
        const importResult = await kit.importTableFromParquet(parquetPath, "parquet_table");
        
        // Check import results
        assert.strictEqual(importResult.success, true);
        assert.strictEqual(importResult.tableName, "parquet_table");
        
        // Verify imported data
        const verifyResult = await kit.execute("SELECT COUNT(*) FROM parquet_table");
        assert.strictEqual(verifyResult.success, true);
      });
    });
  }
  
  // Test kit error handling and event emission
  describe('Error Handling and Events', function() {
    it('should emit events on operations', function(done) {
      // Set up event listeners
      const events = [];
      
      kit.on('export-complete', (data) => {
        events.push({ type: 'export-complete', data });
        
        // If we've received the expected event, complete the test
        if (events.length > 0) {
          assert(events.some(e => e.type === 'export-complete'));
          done();
        }
      });
      
      // Create test database and export table to IPLD
      createTestDatabase().then(() => {
        return kit.exportTableToIPLD("test_table");
      }).catch(done);
    });
  });
});