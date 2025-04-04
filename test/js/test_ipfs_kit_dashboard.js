/**
 * Test file for the IPFS Kit Dashboard
 * 
 * This script tests the IPFS Kit Dashboard functionality
 * including the metadata index integration.
 */

const { IPFSKitClient } = require('../../hallucinate_app/node/ipfs_kit_client.js');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Custom assert that logs the error
function assertWithLog(condition, message) {
  try {
    assert(condition, message);
    console.log(`✅ Passed: ${message || ''}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    return false;
  }
}

// Test the IPFS Kit Client and Dashboard
async function testIPFSKitDashboard() {
  console.log('=== Testing IPFS Kit Dashboard Integration ===');
  
  // Create client instance
  console.log('Creating IPFS Kit Client...');
  const client = new IPFSKitClient({
    debug: true,
    autoStart: false
  });
  
  try {
    // Start client
    console.log('Starting IPFS Kit Client...');
    await client.start();
    
    // Test ping
    console.log('Testing ping...');
    const ping = await client.ping();
    assertWithLog(ping && ping.status === 'ok', 'Ping successful');
    
    // Get status
    console.log('Getting status...');
    const status = await client.getStatus();
    console.log('IPFS Kit status:', JSON.stringify(status, null, 2));
    
    // Check if IPFS Kit is available
    const ipfsKitAvailable = status.has_ipfs_kit && status.initialized;
    console.log(`IPFS Kit available: ${ipfsKitAvailable ? 'Yes ✅' : 'No ❌'}`);
    
    if (!ipfsKitAvailable) {
      console.log('IPFS Kit not available, skipping IPFS-specific tests');
    } else {
      // Get node info
      try {
        console.log('Getting node info...');
        const nodeInfo = await client.getNodeInfo();
        console.log('Node ID:', nodeInfo.id);
        console.log('Node peer count:', nodeInfo.peers?.length || 0);
      } catch (error) {
        console.error('Failed to get node info:', error.message);
      }
      
      // Try some IPFS operations
      try {
        // Add a test file
        console.log('Adding test content to IPFS...');
        const content = Buffer.from('Hello, IPFS Kit Dashboard!');
        const addResult = await client.add(content, { pin: true });
        console.log('Added content with CID:', addResult.cid);
        
        // Get the content back
        console.log('Getting content from IPFS...');
        const retrievedContent = await client.get(addResult.cid);
        assertWithLog(
          Buffer.from(retrievedContent).toString() === 'Hello, IPFS Kit Dashboard!',
          'Retrieved content matches original'
        );
        
        // Pin content
        console.log('Pinning content...');
        const pinResult = await client.pin(addResult.cid);
        assertWithLog(pinResult, 'Content pinned successfully');
        
        // Add sample metadata for testing
        if (status.metadata_index_enabled) {
          console.log('Metadata index available, testing metadata operations...');
          
          // Add metadata entry
          console.log('Adding metadata entry...');
          const metadataEntry = {
            cid: addResult.cid,
            path: '/test/hello.txt',
            mimetype: 'text/plain',
            size: content.length,
            locations: {
              ipfs: ['local']
            },
            metadata: {
              description: 'Test file for IPFS Kit Dashboard',
              created: new Date().toISOString()
            }
          };
          
          const addMetadataResult = await client.addMetadataEntry(metadataEntry);
          assertWithLog(
            addMetadataResult.success,
            'Metadata entry added successfully'
          );
          
          // Query metadata by CID
          console.log('Getting metadata by CID...');
          const metadataByCid = await client.getMetadataForCid(addResult.cid);
          assertWithLog(
            metadataByCid.success && metadataByCid.cid === addResult.cid,
            'Retrieved metadata by CID'
          );
          
          // Query metadata by path
          console.log('Getting metadata by path...');
          const metadataByPath = await client.getMetadataForPath('/test/hello.txt');
          assertWithLog(
            metadataByPath.success && metadataByPath.metadata?.cid === addResult.cid,
            'Retrieved metadata by path'
          );
          
          // Update metadata
          console.log('Updating metadata entry...');
          const updateResult = await client.updateMetadataEntry(addResult.cid, {
            metadata: {
              ...metadataEntry.metadata,
              updated: new Date().toISOString()
            }
          });
          assertWithLog(
            updateResult.success,
            'Metadata entry updated successfully'
          );
          
          // Get metadata stats
          console.log('Getting metadata stats...');
          const statsResult = await client.getMetadataStats();
          if (statsResult.success) {
            console.log('Metadata index stats:', statsResult.stats);
          } else {
            console.error('Failed to get metadata stats:', statsResult.error);
          }
          
          // Export metadata index
          console.log('Exporting metadata index...');
          const exportResult = await client.exportMetadataIndex('json');
          if (exportResult.success) {
            console.log('Metadata index exported to:', exportResult.path);
          } else {
            console.error('Failed to export metadata index:', exportResult.error);
          }
          
          // Delete metadata
          console.log('Deleting metadata entry...');
          const deleteResult = await client.deleteMetadataEntry(addResult.cid);
          assertWithLog(
            deleteResult.success,
            'Metadata entry deleted successfully'
          );
        } else {
          console.log('Metadata index not available, skipping metadata tests');
        }
        
        // Run tests for modules
        console.log('Running tests for the "ipfs_kit" module...');
        const testResults = await client.runTests('ipfs_kit');
        console.log('Test results:', JSON.stringify(testResults, null, 2));
        
      } catch (error) {
        console.error('Error during IPFS operations:', error);
      }
    }
    
    console.log('All tests completed!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Stop client
    console.log('Stopping IPFS Kit Client...');
    await client.stop();
  }
}

// Run the tests
testIPFSKitDashboard()
  .then(() => console.log('Tests completed'))
  .catch(error => console.error('Tests failed:', error));