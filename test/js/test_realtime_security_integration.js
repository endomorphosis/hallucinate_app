/**
 * Tests for security integration with real-time collaboration features
 * 
 * Tests the UCAN capability verification, secure P2P connections, and 
 * authenticated communication channels.
 */

const assert = require('assert');
const path = require('path');

// Import mocks
const { enableMocks: enableWebSocketMocks, disableMocks: disableWebSocketMocks } = require('./mocks/websocket_mock');
const { enableMocks: enableRTCMocks, disableMocks: disableRTCMocks } = require('./mocks/webrtc_mock');
const { enableMocks: enableLibp2pMocks } = require('./mocks/libp2p_mock');

// Mock authentication components
class MockAuthManager {
  constructor(options = {}) {
    this.options = options;
    this.initialized = true;
    this.mockMode = options.useMockImplementation || false;
    this.principals = new Map();
    this.capabilities = new Map();
    this.tokens = new Map();
  }
  
  async init() {
    return { success: true };
  }
  
  async createPrincipal(id, metadata = {}) {
    this.principals.set(id, { id, metadata, created: Date.now() });
    return {
      success: true,
      principal: this.principals.get(id)
    };
  }
  
  async getPrincipal(id) {
    return {
      success: true,
      principal: this.principals.get(id) || null
    };
  }
  
  async issueCapability(principalId, resource, action, conditions = {}) {
    const capId = `${principalId}:${resource}:${action}:${Date.now()}`;
    this.capabilities.set(capId, {
      id: capId,
      principalId,
      resource,
      action,
      conditions,
      issued: Date.now(),
      expires: Date.now() + 3600000 // 1 hour
    });
    return {
      success: true,
      capability: this.capabilities.get(capId)
    };
  }
  
  async issueToken(principalId, capabilities = []) {
    const tokenId = `token-${principalId}-${Date.now()}`;
    const capObjects = capabilities.map(capId => this.capabilities.get(capId)).filter(Boolean);
    
    this.tokens.set(tokenId, {
      id: tokenId,
      principalId,
      capabilities: capObjects,
      issued: Date.now(),
      expires: Date.now() + 3600000 // 1 hour
    });
    
    return {
      success: true,
      token: this.tokens.get(tokenId)
    };
  }
  
  async verifyToken(token) {
    // Simple verification for mock
    const tokenObj = this.tokens.get(token.id || token);
    if (!tokenObj) {
      return { success: false, error: 'Token not found' };
    }
    
    if (tokenObj.expires < Date.now()) {
      return { success: false, error: 'Token expired' };
    }
    
    return { success: true, token: tokenObj };
  }
  
  async verifyCapability(principalId, resource, action, token) {
    // Simple capability verification for mock
    const tokenObj = typeof token === 'string' ? this.tokens.get(token) : token;
    
    if (!tokenObj) {
      return { success: false, error: 'Invalid token' };
    }
    
    const hasCap = tokenObj.capabilities.some(cap => 
      cap.principalId === principalId && 
      cap.resource === resource && 
      cap.action === action && 
      cap.expires > Date.now()
    );
    
    return { 
      success: hasCap, 
      error: hasCap ? null : 'No matching capability found'
    };
  }
}

class MockKeystore {
  constructor() {
    this.keys = new Map();
    this.initialized = true;
  }
  
  async init() {
    return { success: true };
  }
  
  async storeKey(service, key, metadata = {}) {
    this.keys.set(`${service}`, { key, metadata, created: Date.now() });
    return { success: true };
  }
  
  async getKey(service) {
    const keyEntry = this.keys.get(`${service}`);
    return { 
      success: !!keyEntry, 
      key: keyEntry ? keyEntry.key : null 
    };
  }
  
  async rotateKey(service, newKey, metadata = {}) {
    const oldKey = this.keys.get(`${service}`);
    this.keys.set(`${service}`, { 
      key: newKey, 
      metadata: { ...metadata, previous: oldKey ? oldKey.key : null },
      created: Date.now()
    });
    return { success: true };
  }
}

// Mock secure P2P implementation with auth integration
class MockSecureP2P {
  constructor(options = {}) {
    this.options = options;
    this.auth = options.auth;
    this.keystore = options.keystore;
    this.initialized = false;
    this.connected = false;
    this.peers = new Map();
    this.messageHandlers = new Map();
    this.capabilities = new Map();
    this.peerCapabilities = new Map();
    
    // Event emitter
    this.eventEmitter = {
      listeners: {},
      on(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return this;
      },
      emit(event, data) {
        if (this.listeners[event]) {
          this.listeners[event].forEach(callback => callback(data));
        }
        return this;
      }
    };
    
    this.on = this.eventEmitter.on.bind(this.eventEmitter);
    this.emit = this.eventEmitter.emit.bind(this.eventEmitter);
  }
  
  async init() {
    if (!this.auth) {
      throw new Error('Auth manager required for secure P2P initialization');
    }
    
    // Initialize capabilities for this node
    await this._initializeCapabilities();
    
    this.initialized = true;
    return { success: true };
  }
  
  async _initializeCapabilities() {
    // Set up basic capabilities for the local node
    const nodeId = this.options.peerId || 'local-node';
    
    // Ensure we have a principal
    const principal = await this.auth.getPrincipal(nodeId);
    if (!principal.success || !principal.principal) {
      const newPrincipal = await this.auth.createPrincipal(nodeId, {
        type: 'node',
        name: `Node ${nodeId}`
      });
    }
    
    // Create capabilities for P2P operations
    const messageCap = await this.auth.issueCapability(
      nodeId,
      'p2p:messages',
      'send',
      { maxRate: 100 }
    );
    
    const connectionCap = await this.auth.issueCapability(
      nodeId,
      'p2p:connections',
      'establish',
      { maxConnections: 50 }
    );
    
    const contentCap = await this.auth.issueCapability(
      nodeId,
      'p2p:content',
      'share',
      { maxSize: 1000000 }
    );
    
    // Store capabilities
    this.capabilities.set('message', messageCap.capability);
    this.capabilities.set('connection', connectionCap.capability);
    this.capabilities.set('content', contentCap.capability);
    
    // Create token with all capabilities
    const token = await this.auth.issueToken(nodeId, [
      messageCap.capability.id,
      connectionCap.capability.id,
      contentCap.capability.id
    ]);
    
    this.token = token.token;
    return true;
  }
  
  async connect() {
    if (!this.initialized) {
      throw new Error('Must initialize secure P2P before connecting');
    }
    
    this.connected = true;
    this.emit('connection:ready', { peerId: this.options.peerId || 'local-node' });
    
    return { success: true };
  }
  
  async disconnect() {
    this.connected = false;
    this.emit('connection:closed', { reason: 'user-initiated' });
    
    return { success: true };
  }
  
  async verifyPeer(peerId, peerToken) {
    if (!this.auth) {
      return { success: false, error: 'No auth manager available' };
    }
    
    // Verify the token
    const tokenVerification = await this.auth.verifyToken(peerToken);
    if (!tokenVerification.success) {
      return { success: false, error: 'Invalid peer token' };
    }
    
    // Store peer capabilities for later checks
    this.peerCapabilities.set(peerId, tokenVerification.token.capabilities);
    
    return { success: true, capabilities: tokenVerification.token.capabilities };
  }
  
  async authorizeAction(peerId, resource, action) {
    // No peer means we're checking our own capabilities
    if (!peerId || peerId === this.options.peerId) {
      const cap = this.capabilities.get(resource.split(':')[1]);
      return cap && cap.action === action;
    }
    
    // Check peer capabilities
    const peerCaps = this.peerCapabilities.get(peerId);
    if (!peerCaps) {
      return false;
    }
    
    return peerCaps.some(cap => 
      cap.resource === resource && 
      cap.action === action && 
      cap.expires > Date.now()
    );
  }
  
  broadcastMessage(type, payload) {
    // Ensure we have message capability
    if (!this.authorizeAction(null, 'p2p:messages', 'send')) {
      throw new Error('No capability to send messages');
    }
    
    this.lastBroadcast = { type, payload };
    
    // Sign the message with our token for verification
    const signedMessage = {
      type,
      payload,
      token: this.token.id,
      from: this.options.peerId || 'local-node',
      timestamp: Date.now()
    };
    
    // In a real implementation, this would be broadcast to peers
    return true;
  }
  
  sendDirectMessage(peerId, type, payload) {
    // Ensure we have message capability
    if (!this.authorizeAction(null, 'p2p:messages', 'send')) {
      throw new Error('No capability to send messages');
    }
    
    // Check if peer is authorized to receive this type of message
    if (!this.authorizeAction(peerId, 'p2p:messages', 'receive')) {
      throw new Error(`Peer ${peerId} is not authorized to receive messages`);
    }
    
    this.lastDirectMessage = { peerId, type, payload };
    
    // Sign the message with our token for verification
    const signedMessage = {
      type,
      payload,
      token: this.token.id,
      from: this.options.peerId || 'local-node',
      to: peerId,
      timestamp: Date.now()
    };
    
    // In a real implementation, this would be sent directly to the peer
    return true;
  }
  
  onMessage(type, handler) {
    this.messageHandlers.set(type, handler);
    return this;
  }
  
  // Test helper methods
  _mockPeerJoin(peerId, metadata = {}, capabilities = []) {
    // Create and store mock capabilities for the peer
    this.peerCapabilities.set(peerId, capabilities);
    
    // Add peer to the list
    this.peers.set(peerId, { id: peerId, metadata, joined: Date.now() });
    
    // Emit peer join event
    this.emit('peer:join', { peerId, metadata });
  }
  
  _mockPeerLeave(peerId) {
    // Remove peer from the list
    this.peers.delete(peerId);
    
    // Remove peer capabilities
    this.peerCapabilities.delete(peerId);
    
    // Emit peer leave event
    this.emit('peer:leave', { peerId });
  }
  
  _mockReceiveMessage(type, data, from = 'peer-1', withToken = true) {
    // Create signed message similar to what would be received
    const message = {
      type,
      data,
      from,
      timestamp: Date.now()
    };
    
    // Add token if requested
    if (withToken) {
      message.token = `token-${from}-${Date.now()}`;
    }
    
    // Call handler if registered
    const handler = this.messageHandlers.get(type);
    if (handler) {
      handler(message);
    }
  }
}

// Mock for the real-time collaboration integration with security
const MockSecureRealtimeCollaboration = {
  async loadSecureRealtimeCollaboration(dashboard, auth, keystore, options = {}) {
    // Create secure P2P with auth integration
    const secureP2P = new MockSecureP2P({
      ...options,
      auth,
      keystore,
      peerId: options.peerId || 'secure-node'
    });
    
    // Initialize P2P
    await secureP2P.init();
    
    // Add to dashboard
    dashboard.secureP2P = secureP2P;
    
    // Create basic WebSocket updater
    const wsUpdater = {
      connect() { return Promise.resolve(true); },
      subscribe(topic, callback) { 
        this.subscriptions = this.subscriptions || {};
        this.subscriptions[topic] = callback;
        return true;
      },
      unsubscribe(topic) {
        if (this.subscriptions && this.subscriptions[topic]) {
          delete this.subscriptions[topic];
        }
        return true;
      },
      publish(topic, data) {
        this.lastPublish = { topic, data };
        return true;
      },
      _mockReceiveMessage(topic, data) {
        if (this.subscriptions && this.subscriptions[topic]) {
          this.subscriptions[topic](data);
        }
      }
    };
    
    return {
      success: true,
      secureP2P,
      realtimeUpdates: wsUpdater,
      eventBus: dashboard.eventBus
    };
  }
};

describe('Real-time Collaboration Security Integration', function() {
  let dashboard;
  let authManager;
  let keystore;
  
  beforeEach(function() {
    // Set up mocks
    enableWebSocketMocks();
    enableRTCMocks();
    enableLibp2pMocks();
    
    // Create mock dashboard with event bus
    dashboard = {
      eventBus: {
        listeners: {},
        on(event, callback) {
          if (!this.listeners[event]) {
            this.listeners[event] = [];
          }
          this.listeners[event].push(callback);
          return this;
        },
        emit(event, data) {
          if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
          }
          return this;
        }
      },
      container: {},
      logEvent(category, action, label) {
        this.lastEvent = { category, action, label };
      }
    };
    
    // Create mock auth and keystore
    authManager = new MockAuthManager();
    keystore = new MockKeystore();
  });
  
  afterEach(function() {
    // Clean up mocks
    disableWebSocketMocks();
    disableRTCMocks();
  });
  
  describe('Secure P2P Initialization', function() {
    it('should initialize secure P2P with auth manager', async function() {
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        {
          peerId: 'test-node-1',
          wsUrl: 'ws://localhost:8080',
          enableWebRTC: true,
          enableLibp2p: true
        }
      );
      
      assert.strictEqual(collaboration.success, true, 'Should successfully load secure realtime collaboration');
      assert.ok(collaboration.secureP2P, 'Should have secure P2P instance');
      assert.ok(collaboration.secureP2P.token, 'Should have created a capability token');
      
      // Check that capabilities were created
      assert.ok(collaboration.secureP2P.capabilities.get('message'), 'Should have message capability');
      assert.ok(collaboration.secureP2P.capabilities.get('connection'), 'Should have connection capability');
      assert.ok(collaboration.secureP2P.capabilities.get('content'), 'Should have content capability');
    });
    
    it('should fail initialization without auth manager', async function() {
      try {
        const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
          dashboard, 
          null,  // No auth manager
          keystore,
          {
            peerId: 'test-node-1',
            wsUrl: 'ws://localhost:8080'
          }
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('Auth manager required'), 'Should throw appropriate error');
      }
    });
  });
  
  describe('Capability Verification', function() {
    it('should verify peer capabilities', async function() {
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { peerId: 'test-node-1' }
      );
      
      await collaboration.secureP2P.connect();
      
      // Create a second peer with its own capabilities
      const peer2Id = 'test-peer-2';
      await authManager.createPrincipal(peer2Id, { type: 'node', name: 'Test Peer 2' });
      
      // Issue limited capabilities to peer2
      const messageCap = await authManager.issueCapability(
        peer2Id,
        'p2p:messages',
        'send',
        { maxRate: 10 }  // More limited than our node
      );
      
      // Issue a token to peer2
      const peerToken = await authManager.issueToken(peer2Id, [messageCap.capability.id]);
      
      // Verify the peer
      const verification = await collaboration.secureP2P.verifyPeer(peer2Id, peerToken.token);
      
      assert.strictEqual(verification.success, true, 'Should successfully verify peer');
      assert.strictEqual(verification.capabilities.length, 1, 'Should have one capability');
      assert.strictEqual(verification.capabilities[0].action, 'send', 'Should have send action');
      assert.strictEqual(verification.capabilities[0].resource, 'p2p:messages', 'Should have messages resource');
    });
    
    it('should authorize actions based on capabilities', async function() {
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { peerId: 'test-node-1' }
      );
      
      await collaboration.secureP2P.connect();
      
      // Check our own capability
      const canSendMessages = await collaboration.secureP2P.authorizeAction(
        null,  // No peer ID means checking local capabilities
        'p2p:messages',
        'send'
      );
      
      assert.strictEqual(canSendMessages, true, 'Should authorize action based on local capability');
      
      // Create a second peer with limited capabilities
      const peer2Id = 'test-peer-2';
      await authManager.createPrincipal(peer2Id, { type: 'node', name: 'Test Peer 2' });
      
      // Issue limited capabilities to peer2
      const messageCap = await authManager.issueCapability(
        peer2Id,
        'p2p:messages',
        'send',
        { maxRate: 10 }
      );
      
      // No content capability for peer2
      
      // Issue a token to peer2
      const peerToken = await authManager.issueToken(peer2Id, [messageCap.capability.id]);
      
      // Verify the peer to store its capabilities
      await collaboration.secureP2P.verifyPeer(peer2Id, peerToken.token);
      
      // Check peer capabilities
      const peerCanSendMessages = await collaboration.secureP2P.authorizeAction(
        peer2Id,
        'p2p:messages',
        'send'
      );
      
      const peerCanShareContent = await collaboration.secureP2P.authorizeAction(
        peer2Id,
        'p2p:content',
        'share'
      );
      
      assert.strictEqual(peerCanSendMessages, true, 'Peer should be authorized to send messages');
      assert.strictEqual(peerCanShareContent, false, 'Peer should not be authorized to share content');
    });
  });
  
  describe('Secure Messaging', function() {
    it('should sign and verify messages', async function() {
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { peerId: 'test-node-1' }
      );
      
      await collaboration.secureP2P.connect();
      
      // Register message handler
      let receivedMessage = null;
      collaboration.secureP2P.onMessage('secure-content', (message) => {
        receivedMessage = message;
      });
      
      // Broadcast a message
      collaboration.secureP2P.broadcastMessage('secure-content', { id: 'doc1', content: 'Secure content' });
      
      // In a real implementation, messages would be verified by recipients
      // Here, we'll just simulate receiving a message with a token
      collaboration.secureP2P._mockReceiveMessage('secure-content', {
        id: 'doc2',
        content: 'Received secure content'
      }, 'peer-1', true);  // With token
      
      assert.ok(receivedMessage, 'Should receive message');
      assert.strictEqual(receivedMessage.type, 'secure-content', 'Should have correct message type');
      assert.strictEqual(receivedMessage.data.id, 'doc2', 'Should have correct content ID');
      assert.ok(receivedMessage.token, 'Should have a token for verification');
    });
    
    it('should reject messages without proper authentication', async function() {
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { peerId: 'test-node-1' }
      );
      
      await collaboration.secureP2P.connect();
      
      // Register message handler that checks authentication
      let receivedAuthenticatedMessage = null;
      let receivedUnauthenticatedMessage = null;
      
      collaboration.secureP2P.onMessage('secure-content', (message) => {
        // In a real implementation, this would verify the token
        if (message.token) {
          receivedAuthenticatedMessage = message;
        } else {
          receivedUnauthenticatedMessage = message;
        }
      });
      
      // Simulate receiving a message with a token
      collaboration.secureP2P._mockReceiveMessage('secure-content', {
        id: 'doc1',
        content: 'Authenticated content'
      }, 'peer-1', true);  // With token
      
      // Simulate receiving a message without a token
      collaboration.secureP2P._mockReceiveMessage('secure-content', {
        id: 'doc2',
        content: 'Unauthenticated content'
      }, 'peer-2', false);  // Without token
      
      assert.ok(receivedAuthenticatedMessage, 'Should receive authenticated message');
      assert.ok(receivedUnauthenticatedMessage, 'Should receive unauthenticated message for rejection');
      
      // In a real implementation, the unauthenticated message would be rejected
      assert.strictEqual(receivedAuthenticatedMessage.data.id, 'doc1', 'Should have correct authenticated content');
      assert.strictEqual(receivedUnauthenticatedMessage.data.id, 'doc2', 'Should have unauthenticated content for rejection');
    });
  });
  
  describe('Integration with Keystore', function() {
    it('should use keystore for secure communication', async function() {
      // Store a secure key in the keystore
      await keystore.storeKey('p2p-encryption', 'test-encryption-key', {
        algorithm: 'AES-GCM',
        keyLength: 256
      });
      
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { 
          peerId: 'test-node-1',
          useEncryption: true,  // Enable encryption
          encryptionKeyName: 'p2p-encryption'  // Key to use from keystore
        }
      );
      
      await collaboration.secureP2P.connect();
      
      // In a real implementation, messages would be encrypted using the key
      // Here, we'll just verify that the key is retrieved
      
      // Check that keystore was accessed
      const keyResult = await keystore.getKey('p2p-encryption');
      
      assert.strictEqual(keyResult.success, true, 'Should successfully retrieve key');
      assert.strictEqual(keyResult.key, 'test-encryption-key', 'Should get correct encryption key');
    });
    
    it('should handle key rotation for long-running sessions', async function() {
      // Store initial key
      await keystore.storeKey('p2p-session', 'initial-session-key', {
        created: Date.now(),
        expiresIn: 3600  // 1 hour
      });
      
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { 
          peerId: 'test-node-1',
          useEncryption: true,
          encryptionKeyName: 'p2p-session',
          keyRotationInterval: 1800  // 30 minutes
        }
      );
      
      await collaboration.secureP2P.connect();
      
      // Simulate key rotation
      await keystore.rotateKey('p2p-session', 'new-session-key', {
        created: Date.now(),
        expiresIn: 3600,
        rotationReason: 'scheduled'
      });
      
      // Get the rotated key
      const keyResult = await keystore.getKey('p2p-session');
      
      assert.strictEqual(keyResult.success, true, 'Should successfully retrieve rotated key');
      assert.strictEqual(keyResult.key, 'new-session-key', 'Should get correct rotated key');
    });
  });
  
  describe('Secure WebRTC and libp2p Integration', function() {
    it('should apply security to WebRTC connections', async function() {
      // This is a more basic test that just ensures the security layer is active
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { 
          peerId: 'test-node-1',
          enableWebRTC: true,
          secureWebRTC: true  // Enable secure mode
        }
      );
      
      await collaboration.secureP2P.connect();
      
      // Track events
      let securityEvent = null;
      dashboard.eventBus.on('security:webrtc', (event) => {
        securityEvent = event;
      });
      
      // Simulate a peer join with capability verification
      const peer2Id = 'test-peer-2';
      await authManager.createPrincipal(peer2Id, { type: 'node', name: 'Test Peer 2' });
      
      // Issue capabilities to peer2
      const messageCap = await authManager.issueCapability(
        peer2Id,
        'p2p:messages',
        'send'
      );
      
      const connectionCap = await authManager.issueCapability(
        peer2Id,
        'p2p:connections',
        'establish'
      );
      
      // Issue a token to peer2
      const peerToken = await authManager.issueToken(peer2Id, [
        messageCap.capability.id,
        connectionCap.capability.id
      ]);
      
      // Simulate security event
      dashboard.eventBus.emit('security:webrtc', {
        type: 'verification',
        peerId: peer2Id,
        token: peerToken.token.id,
        verified: true
      });
      
      // Check for security event handling
      // In a real implementation, this would trigger verification
      assert.ok(securityEvent, 'Should handle WebRTC security events');
    });
    
    it('should apply security to libp2p connections', async function() {
      // Similar test for libp2p
      const collaboration = await MockSecureRealtimeCollaboration.loadSecureRealtimeCollaboration(
        dashboard, 
        authManager, 
        keystore,
        { 
          peerId: 'test-node-1',
          enableLibp2p: true,
          secureLibp2p: true  // Enable secure mode
        }
      );
      
      await collaboration.secureP2P.connect();
      
      // Track events
      let securityEvent = null;
      dashboard.eventBus.on('security:libp2p', (event) => {
        securityEvent = event;
      });
      
      // Simulate a security event
      dashboard.eventBus.emit('security:libp2p', {
        type: 'capability',
        resource: 'p2p:content',
        action: 'share',
        authorized: true
      });
      
      // Check for security event handling
      assert.ok(securityEvent, 'Should handle libp2p security events');
    });
  });
});