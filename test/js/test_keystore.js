import { expect } from 'chai';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Keystore } from '../../hallucinate_app/node/keystore.js';

describe('Keystore Module', function() {
  // Test data
  const testMasterKey = 'test_master_key_do_not_use_in_production';
  const testStorageLocation = path.join(os.tmpdir(), 'hallucinate_app_test_keystore');
  const testProvider = 'test_provider';
  const testKey = 'test_api_key_' + Date.now();
  
  // Create a clean instance for testing
  let keystore;
  
  // Clean up test directory before tests
  before(function() {
    if (fs.existsSync(testStorageLocation)) {
      fs.rmSync(testStorageLocation, { recursive: true, force: true });
    }
  });
  
  it('should create a new keystore instance', async function() {
    keystore = new Keystore({
      encryptionKey: testMasterKey,
      storageLocation: testStorageLocation
    });
    
    expect(keystore).to.be.an.instanceOf(Keystore);
    expect(keystore.initialized).to.equal(false);
  });
  
  it('should initialize the keystore', async function() {
    const result = await keystore.init();
    expect(result).to.be.true;
    expect(keystore.initialized).to.be.true;
  });
  
  it('should create the storage directory if it does not exist', function() {
    expect(fs.existsSync(testStorageLocation)).to.be.true;
  });
  
  it('should store a key in the keystore', async function() {
    const result = await keystore.setKey(testProvider, testKey);
    expect(result).to.be.true;
  });
  
  it('should retrieve a key from the keystore', async function() {
    const key = await keystore.getKey(testProvider);
    expect(key).to.equal(testKey);
  });
  
  it('should get key info without exposing the key', async function() {
    const keyInfo = await keystore.getKeyInfo(testProvider);
    expect(keyInfo).to.be.an('object');
    expect(keyInfo.provider).to.equal(testProvider);
    expect(keyInfo).to.not.have.property('key');
  });
  
  it('should rotate a key', async function() {
    const newKey = 'rotated_key_' + Date.now();
    const result = await keystore.rotateKey(testProvider, newKey);
    expect(result).to.be.true;
    
    // Verify the key was rotated
    const key = await keystore.getKey(testProvider);
    expect(key).to.equal(newKey);
  });
  
  it('should list all providers with stored keys', async function() {
    const providers = await keystore.listProviders();
    expect(providers).to.be.an('array');
    expect(providers).to.include(testProvider);
  });
  
  it('should delete a key from the keystore', async function() {
    const result = await keystore.deleteKey(testProvider);
    expect(result).to.be.true;
    
    // Verify the key was deleted
    const key = await keystore.getKey(testProvider);
    expect(key).to.be.null;
  });
  
  it('should persist keys across instances', async function() {
    // Store a key in the first instance
    const testProvider2 = 'test_provider_2';
    const testKey2 = 'test_key_2_' + Date.now();
    await keystore.setKey(testProvider2, testKey2);
    
    // Create a new instance
    const keystore2 = new Keystore({
      encryptionKey: testMasterKey,
      storageLocation: testStorageLocation
    });
    await keystore2.init();
    
    // Verify the key is present
    const key = await keystore2.getKey(testProvider2);
    expect(key).to.equal(testKey2);
    
    // Clean up
    await keystore2.deleteKey(testProvider2);
  });
  
  it('should handle expired keys', async function() {
    // Store a key with expiration in the past
    const expiredProvider = 'expired_provider';
    const expiredKey = 'expired_key';
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await keystore.setKey(expiredProvider, expiredKey, {
      expiresAt: yesterday
    });
    
    // Try to get the expired key
    const key = await keystore.getKey(expiredProvider);
    expect(key).to.be.null;
    
    // Check key info
    const keyInfo = await keystore.getKeyInfo(expiredProvider);
    expect(keyInfo.isExpired).to.be.true;
    
    // Clean up
    await keystore.deleteKey(expiredProvider);
  });
  
  it('should run comprehensive self-tests', async function() {
    const testResults = await keystore.test();
    expect(testResults.success).to.be.true;
    expect(testResults.module).to.equal('keystore');
    expect(testResults.initialization).to.be.true;
    expect(testResults.persistence).to.be.true;
  });
  
  // Clean up after all tests
  after(function() {
    if (fs.existsSync(testStorageLocation)) {
      fs.rmSync(testStorageLocation, { recursive: true, force: true });
    }
  });
});

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Create Mocha instance and run tests
  const Mocha = await import('mocha');
  const mocha = new Mocha.default();
  mocha.addFile(process.argv[1]);
  mocha.run(function(failures) {
    process.exit(failures ? 1 : 0);
  });
}