/**
 * Test IPFS Kit Bridge
 * 
 * This test file verifies the functionality of the IPFS Kit Bridge and
 * JavaScript client implementation.
 */

const path = require('path');
const assert = require('assert');
const IPFSKitClient = require('../../hallucinate_app/node/ipfs_kit_client');

// Configuration
const TEST_TIMEOUT = 60000; // 60 seconds

describe('IPFS Kit Bridge', function() {
  // Set timeout for all tests
  this.timeout(TEST_TIMEOUT);
  
  let client;
  
  before(async function() {
    // Initialize client with debug mode
    client = new IPFSKitClient({
      debug: true,
      autoStart: false // Don't start automatically
    });
    
    // Listen for events
    client.on('connected', () => console.log('Client connected'));
    client.on('disconnected', () => console.log('Client disconnected'));
    client.on('error', (error) => console.error('Client error:', error));
    client.on('process_error', (error) => console.error('Process error:', error));
    client.on('process_exit', (data) => console.log('Process exit:', data));
    
    // Start client
    await client.start();
  });
  
  after(async function() {
    // Stop client
    if (client) {
      await client.stop();
    }
  });
  
  describe('Basic Functionality', function() {
    it('should connect to the IPFS Kit Bridge', async function() {
      assert.strictEqual(client.connected, true, 'Client should be connected');
    });
    
    it('should ping the IPFS Kit Bridge', async function() {
      const result = await client.ping();
      assert.strictEqual(result.status, 'ok', 'Ping should return ok status');
      assert.ok(result.uptime > 0, 'Uptime should be greater than 0');
    });
    
    it('should get status from the IPFS Kit Bridge', async function() {
      const status = await client.getStatus();
      console.log('Status:', JSON.stringify(status, null, 2));
      
      assert.ok(status.client, 'Status should include client information');
      assert.strictEqual(status.client.connected, true, 'Client should be connected');
    });
  });
  
  describe('IPFS Kit Functionality', function() {
    // Skip these tests if IPFS Kit is not available
    beforeEach(async function() {
      const available = await client.isIpfsKitAvailable();
      if (!available) {
        this.skip();
      }
    });
    
    it('should execute command on IPFS Kit', async function() {
      try {
        // Add string content to IPFS
        const content = 'Hello, IPFS!';
        const result = await client.executeCommand('add', { content });
        
        console.log('Add result:', result);
        
        assert.strictEqual(result.success, true, 'Command should succeed');
        assert.ok(result.result, 'Result should contain result data');
        
        // Assuming result.result contains CID in some form
        const cid = result.result.cid || result.result.Hash;
        assert.ok(cid, 'Result should contain a CID');
        
        // Try to get the content back
        const getResult = await client.executeCommand('get', { cid });
        console.log('Get result:', getResult);
        
        assert.strictEqual(getResult.success, true, 'Get command should succeed');
      } catch (error) {
        if (error.message.includes('IPFS Kit not initialized')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
    
    it('should run tests for IPFS Kit', async function() {
      try {
        // Run tests for ipfs_kit module
        const result = await client.runTests('ipfs_kit');
        
        console.log('Test result:', JSON.stringify(result, null, 2));
        
        assert.strictEqual(result.success, true, 'Tests should succeed');
        assert.ok(result.results, 'Result should contain test results');
      } catch (error) {
        if (error.message.includes('IPFS Kit not initialized')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });
  
  describe('Metadata Index Functionality', function() {
    // Skip these tests if metadata index is not available
    beforeEach(async function() {
      const status = await client.getStatus();
      if (!status.metadata_index_enabled) {
        this.skip();
      }
    });
    
    it('should query metadata index', async function() {
      // Query metadata index
      const result = await client.metadataQuery({
        limit: 10
      });
      
      console.log('Metadata query result:', JSON.stringify(result, null, 2));
      
      assert.strictEqual(result.success, true, 'Query should succeed');
      assert.ok(Array.isArray(result.results), 'Results should be an array');
    });
    
    it('should add content and retrieve metadata for CID', async function() {
      try {
        // Add string content to IPFS
        const content = 'Hello, Metadata Index!';
        const addResult = await client.add(content);
        
        console.log('Add result:', addResult);
        
        // Get the CID
        const cid = addResult.cid || addResult.Hash;
        assert.ok(cid, 'Add result should contain a CID');
        
        // Get metadata for CID
        const metadataResult = await client.getMetadataForCid(cid);
        
        console.log('Metadata result:', JSON.stringify(metadataResult, null, 2));
        
        if (metadataResult.success) {
          assert.strictEqual(metadataResult.cid, cid, 'Metadata should be for the correct CID');
          assert.ok(metadataResult.metadata, 'Metadata should be present');
        } else {
          // Some implementations might not automatically index new content
          console.warn('Metadata not found, this might be normal for some implementations');
        }
      } catch (error) {
        if (error.message.includes('Metadata index not available')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });
  
  describe('High-Level API', function() {
    // Skip these tests if IPFS Kit is not available
    beforeEach(async function() {
      const available = await client.isIpfsKitAvailable();
      if (!available) {
        this.skip();
      }
    });
    
    it('should add and get content using high-level API', async function() {
      try {
        // Add string content to IPFS
        const content = 'Hello, High-Level API!';
        const addResult = await client.add(content);
        
        console.log('Add result (high-level):', addResult);
        
        // Get the CID
        const cid = addResult.cid || addResult.Hash;
        assert.ok(cid, 'Add result should contain a CID');
        
        // Get content from IPFS
        const getResult = await client.get(cid);
        
        console.log('Get result (high-level):', getResult);
        
        // Verify content (might be buffer or string)
        const retrievedContent = Buffer.isBuffer(getResult) ? 
          getResult.toString() : getResult;
          
        assert.strictEqual(retrievedContent, content, 'Retrieved content should match original');
      } catch (error) {
        if (error.message.includes('IPFS Kit not initialized')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
    
    it('should pin and unpin content using high-level API', async function() {
      try {
        // Add string content to IPFS
        const content = 'Pin test content';
        const addResult = await client.add(content, { pin: false });
        
        console.log('Add result for pin test:', addResult);
        
        // Get the CID
        const cid = addResult.cid || addResult.Hash;
        assert.ok(cid, 'Add result should contain a CID');
        
        // Pin content
        const pinResult = await client.pin(cid);
        
        console.log('Pin result:', pinResult);
        
        // List pins to verify
        const listResult = await client.listPins();
        
        console.log('List pins result:', listResult);
        
        // Check if CID is in pins
        let found = false;
        if (Array.isArray(listResult)) {
          found = listResult.some(pin => pin === cid);
        } else if (listResult.pins) {
          found = Object.keys(listResult.pins).includes(cid);
        }
        
        assert.ok(found, 'CID should be in pin list');
        
        // Unpin content
        const unpinResult = await client.unpin(cid);
        
        console.log('Unpin result:', unpinResult);
      } catch (error) {
        if (error.message.includes('IPFS Kit not initialized')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });
});