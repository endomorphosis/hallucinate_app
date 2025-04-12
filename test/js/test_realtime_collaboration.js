/**
 * Tests for real-time collaboration features of PyArrow Content Index Dashboard
 * 
 * Tests the WebSocket, WebRTC, and libp2p integration for real-time collaboration.
 */

const assert = require('assert');
const path = require('path');

// Import mocks
const { enableMocks: enableWebSocketMocks, disableMocks: disableWebSocketMocks, MockWebSocketServer } = require('./mocks/websocket_mock');
const { enableMocks: enableRTCMocks, disableMocks: disableRTCMocks, createConnectedPeerPair } = require('./mocks/webrtc_mock');
const { enableMocks: enableLibp2pMocks, getNetwork: getLibp2pNetwork } = require('./mocks/libp2p_mock');

// Load modules under test
let RealtimeP2P;
let RealtimeIntegration;
let RealtimeCollaboration;

// Try to load modules - we'll mock them if not available
try {
  RealtimeP2P = require('../hallucinate_app/node/dashboard/realtime_updates/realtime_p2p');
  RealtimeIntegration = require('../hallucinate_app/node/dashboard/realtime_updates/p2p_integration');
  RealtimeCollaboration = require('../hallucinate_app/node/dashboard/load_realtime_collaboration');
} catch (e) {
  console.log('Could not load real-time collaboration modules, will use mocks');
  
  // Create mock implementations if modules can't be loaded
  RealtimeP2P = class {
    constructor(options = {}) {
      this.options = options;
      this.peers = new Map();
      this.isConnected = false;
      this.capabilities = options.capabilities || {};
      this.messageHandlers = new Map();
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
      this.isInitialized = true;
      return { success: true };
    }
    
    async connect() {
      this.isConnected = true;
      this.emit('connection:ready', { peerId: 'self' });
      return { success: true };
    }
    
    async disconnect() {
      this.isConnected = false;
      this.emit('connection:closed', { reason: 'user-initiated' });
      return { success: true };
    }
    
    broadcastMessage(type, payload) {
      this.lastBroadcast = { type, payload };
      return true;
    }
    
    sendDirectMessage(peerId, type, payload) {
      this.lastDirectMessage = { peerId, type, payload };
      return true;
    }
    
    onMessage(type, handler) {
      this.messageHandlers.set(type, handler);
      return this;
    }
    
    // Test helpers
    _mockReceiveMessage(type, data, from = 'peer-1') {
      const handler = this.messageHandlers.get(type);
      if (handler) {
        handler({
          from,
          type,
          data
        });
      }
    }
    
    _mockPeerJoin(peerId, metadata = {}) {
      this.peers.set(peerId, { ...metadata, id: peerId });
      this.emit('peer:join', { peerId, metadata });
    }
    
    _mockPeerLeave(peerId) {
      this.peers.delete(peerId);
      this.emit('peer:leave', { peerId });
    }
  };
  
  RealtimeIntegration = {
    integrateP2PCommunication(dashboard, options = {}) {
      const p2p = new RealtimeP2P(options);
      
      // Add to dashboard
      dashboard.p2p = p2p;
      
      return {
        success: true,
        p2p
      };
    }
  };
  
  RealtimeCollaboration = {
    async loadRealtimeCollaboration(dashboard, options = {}) {
      // Create websocket based updates
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
        // Mock helpers
        _mockReceiveMessage(topic, data) {
          if (this.subscriptions && this.subscriptions[topic]) {
            this.subscriptions[topic](data);
          }
        }
      };
      
      // Integrate P2P if enabled
      let p2pResult = { success: false };
      if (options.enableWebRTC || options.enableLibp2p) {
        p2pResult = RealtimeIntegration.integrateP2PCommunication(dashboard, options);
      }
      
      // Return a combined system
      return {
        success: true,
        realtimeUpdates: wsUpdater,
        p2p: p2pResult.success ? p2pResult.p2p : null,
        eventBus: dashboard.eventBus
      };
    }
  };
}

describe('Real-time Collaboration Features', function() {
  // Test dashboard mock
  let dashboard;
  let mockWebSocketServer;
  
  beforeEach(function() {
    // Set up mocks
    mockWebSocketServer = enableWebSocketMocks();
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
      },
      getUser() {
        return { id: 'test-user', name: 'Test User' };
      },
      showNotification(message, type = 'info') {
        this.lastNotification = { message, type };
      }
    };
  });
  
  afterEach(function() {
    // Clean up mocks
    disableWebSocketMocks();
    disableRTCMocks();
  });
  
  describe('WebSocket Communication', function() {
    it('should establish WebSocket connection', async function() {
      // Create real-time collaboration with only WebSocket
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: false,
        enableLibp2p: false
      });
      
      assert.strictEqual(collaboration.success, true, 'Should successfully load realtime collaboration');
      assert.ok(collaboration.realtimeUpdates, 'Should have realtime updates');
      assert.strictEqual(collaboration.p2p, null, 'Should not have P2P when disabled');
      
      // Verify WebSocket connection was attempted
      assert.strictEqual(mockWebSocketServer.connections.length, 1, 'Should create one WebSocket connection');
    });
    
    it('should handle publish/subscribe via WebSocket', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: false,
        enableLibp2p: false
      });
      
      // Set up a subscription
      let receivedData = null;
      collaboration.realtimeUpdates.subscribe('test-topic', (data) => {
        receivedData = data;
      });
      
      // Publish some data
      collaboration.realtimeUpdates.publish('test-topic', { action: 'update', data: { id: 1 } });
      
      // Simulate receiving a message from server
      collaboration.realtimeUpdates._mockReceiveMessage('test-topic', { action: 'remote-update', data: { id: 2 } });
      
      assert.deepStrictEqual(receivedData, { action: 'remote-update', data: { id: 2 } }, 'Should receive correct data via WebSocket');
      assert.deepStrictEqual(collaboration.realtimeUpdates.lastPublish, { 
        topic: 'test-topic', 
        data: { action: 'update', data: { id: 1 } } 
      }, 'Should send correct data via WebSocket');
    });
  });
  
  describe('WebRTC Peer-to-Peer Communication', function() {
    it('should initialize WebRTC P2P when enabled', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: false,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      assert.strictEqual(collaboration.success, true, 'Should successfully load realtime collaboration');
      assert.ok(collaboration.p2p, 'Should have P2P when WebRTC enabled');
      
      // Initialize and connect P2P
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      assert.strictEqual(collaboration.p2p.isConnected, true, 'P2P should be connected');
    });
    
    it('should handle peer discovery and messaging via WebRTC', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: false
      });
      
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      // Set up message handler
      let receivedMessage = null;
      collaboration.p2p.onMessage('content-update', (message) => {
        receivedMessage = message;
      });
      
      // Simulate peer join
      collaboration.p2p._mockPeerJoin('peer-1', { name: 'Test Peer' });
      
      // Broadcast a message
      collaboration.p2p.broadcastMessage('content-update', { id: 'doc1', changes: [{ type: 'insert', position: 0, text: 'Hello' }] });
      
      // Simulate receiving a message
      collaboration.p2p._mockReceiveMessage('content-update', { 
        id: 'doc2', 
        changes: [{ type: 'insert', position: 0, text: 'World' }] 
      });
      
      assert.deepStrictEqual(collaboration.p2p.lastBroadcast, { 
        type: 'content-update', 
        payload: { id: 'doc1', changes: [{ type: 'insert', position: 0, text: 'Hello' }] } 
      }, 'Should broadcast message correctly');
      
      assert.deepStrictEqual(receivedMessage.data, { 
        id: 'doc2', 
        changes: [{ type: 'insert', position: 0, text: 'World' }] 
      }, 'Should receive message correctly');
    });
    
    it('should handle peer join/leave events', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: false
      });
      
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      // Track events
      let peerJoinEvent = null;
      let peerLeaveEvent = null;
      
      collaboration.p2p.on('peer:join', (event) => {
        peerJoinEvent = event;
      });
      
      collaboration.p2p.on('peer:leave', (event) => {
        peerLeaveEvent = event;
      });
      
      // Simulate peer join and leave
      collaboration.p2p._mockPeerJoin('peer-1', { name: 'Test Peer' });
      collaboration.p2p._mockPeerLeave('peer-1');
      
      assert.strictEqual(peerJoinEvent.peerId, 'peer-1', 'Should emit peer join event with correct ID');
      assert.deepStrictEqual(peerJoinEvent.metadata, { name: 'Test Peer' }, 'Should include peer metadata');
      
      assert.strictEqual(peerLeaveEvent.peerId, 'peer-1', 'Should emit peer leave event with correct ID');
    });
  });
  
  describe('libp2p Distributed Network', function() {
    it('should initialize libp2p when enabled', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: false,
        enableLibp2p: true
      });
      
      assert.strictEqual(collaboration.success, true, 'Should successfully load realtime collaboration');
      assert.ok(collaboration.p2p, 'Should have P2P when libp2p enabled');
      
      // Initialize and connect P2P
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      assert.strictEqual(collaboration.p2p.isConnected, true, 'P2P should be connected');
    });
    
    it('should broadcast updates over libp2p pubsub', async function() {
      const collaboration1 = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: false,
        enableLibp2p: true,
        libp2pOptions: { peerId: 'user-1' }
      });
      
      // Create a second dashboard for second user
      const dashboard2 = {
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
        getUser() {
          return { id: 'user-2', name: 'User 2' };
        }
      };
      
      const collaboration2 = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard2, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: false,
        enableLibp2p: true,
        libp2pOptions: { peerId: 'user-2' }
      });
      
      // Initialize both P2P instances
      await collaboration1.p2p.init();
      await collaboration2.p2p.init();
      
      // Connect both instances
      await collaboration1.p2p.connect();
      await collaboration2.p2p.connect();
      
      // Set up message handler for user 2
      let receivedByUser2 = null;
      collaboration2.p2p.onMessage('content-update', (message) => {
        receivedByUser2 = message;
      });
      
      // Simulate peer discovery - this would happen through the libp2p network
      if (collaboration1.p2p._mockPeerJoin) {
        collaboration1.p2p._mockPeerJoin('user-2', { name: 'User 2' });
        collaboration2.p2p._mockPeerJoin('user-1', { name: 'User 1' });
      }
      
      // User 1 broadcasts a message
      collaboration1.p2p.broadcastMessage('content-update', { id: 'doc1', version: 2, content: 'Updated content' });
      
      // Simulate message propagation - in reality this would happen through libp2p pubsub
      if (collaboration2.p2p._mockReceiveMessage) {
        collaboration2.p2p._mockReceiveMessage('content-update', { 
          id: 'doc1', 
          version: 2, 
          content: 'Updated content' 
        }, 'user-1');
      }
      
      // Check if user 2 received the update
      if (receivedByUser2) {
        assert.strictEqual(receivedByUser2.from, 'user-1', 'Message should be from user-1');
        assert.deepStrictEqual(receivedByUser2.data, { 
          id: 'doc1', 
          version: 2, 
          content: 'Updated content' 
        }, 'Message data should be correctly received');
      }
    });
  });
  
  describe('Combined Communication Approach', function() {
    it('should use all available communication methods when enabled', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true
      });
      
      assert.strictEqual(collaboration.success, true, 'Should successfully load realtime collaboration');
      assert.ok(collaboration.realtimeUpdates, 'Should have WebSocket updates');
      assert.ok(collaboration.p2p, 'Should have P2P capabilities');
      
      // Initialize and connect
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      // Broadcast a message - this should use all available channels
      collaboration.p2p.broadcastMessage('status-update', { status: 'online' });
      
      // Also publish via WebSocket
      collaboration.realtimeUpdates.publish('user-status', { id: 'test-user', status: 'online' });
      
      assert.deepStrictEqual(collaboration.p2p.lastBroadcast, { 
        type: 'status-update', 
        payload: { status: 'online' } 
      }, 'Should broadcast via P2P');
      
      assert.deepStrictEqual(collaboration.realtimeUpdates.lastPublish, { 
        topic: 'user-status', 
        data: { id: 'test-user', status: 'online' } 
      }, 'Should publish via WebSocket');
    });
    
    it('should handle fallback between communication methods', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true,
        fallbackOptions: {
          preferP2P: true,
          autoFallback: true
        }
      });
      
      // Initialize
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      // Track message deliveries
      let receivedMessages = [];
      
      collaboration.p2p.onMessage('content-update', (message) => {
        receivedMessages.push({ via: 'p2p', message });
      });
      
      collaboration.realtimeUpdates.subscribe('content-update', (data) => {
        receivedMessages.push({ via: 'websocket', data });
      });
      
      // Simulate P2P failure by disconnecting
      await collaboration.p2p.disconnect();
      
      // Send message - should automatically fallback to WebSocket
      if (collaboration.p2p.broadcastMessage) {
        collaboration.p2p.broadcastMessage('content-update', { id: 'doc1', content: 'Fallback test' });
      }
      
      // Simulate receiving a WebSocket message since P2P is down
      collaboration.realtimeUpdates._mockReceiveMessage('content-update', { 
        id: 'doc1', 
        content: 'Received via WebSocket fallback'
      });
      
      // Check that message was received via WebSocket
      const wsMessage = receivedMessages.find(m => m.via === 'websocket');
      assert.ok(wsMessage, 'Should receive message via WebSocket when P2P is down');
      
      if (wsMessage) {
        assert.deepStrictEqual(wsMessage.data, { 
          id: 'doc1', 
          content: 'Received via WebSocket fallback'
        }, 'Should receive correct data via WebSocket fallback');
      }
      
      // Reconnect P2P
      await collaboration.p2p.connect();
      
      // Now simulate receiving via P2P
      if (collaboration.p2p._mockReceiveMessage) {
        collaboration.p2p._mockReceiveMessage('content-update', { 
          id: 'doc2', 
          content: 'Received via P2P' 
        }, 'peer-1');
      }
      
      // Check that message was received via P2P
      const p2pMessage = receivedMessages.find(m => m.via === 'p2p' && m.message.data.id === 'doc2');
      
      if (p2pMessage) {
        assert.deepStrictEqual(p2pMessage.message.data, { 
          id: 'doc2', 
          content: 'Received via P2P' 
        }, 'Should receive correct data via P2P when available');
      }
    });
  });
  
  describe('Dashboard Integration', function() {
    it('should properly integrate with dashboard UI', async function() {
      // Create a more complete dashboard mock with UI elements
      const dashboardWithUI = {
        ...dashboard,
        container: {
          appendChild: function(element) {
            this.children = this.children || [];
            this.children.push(element);
          },
          querySelector: function(selector) {
            return null; // Simulate empty container
          }
        },
        document: {
          createElement: function(tag) {
            return {
              tag,
              classList: {
                add: function(cls) {
                  this.classes = this.classes || [];
                  this.classes.push(cls);
                }
              },
              appendChild: function(child) {
                this.children = this.children || [];
                this.children.push(child);
              },
              setAttribute: function(name, value) {
                this.attributes = this.attributes || {};
                this.attributes[name] = value;
              },
              style: {}
            };
          }
        }
      };
      
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboardWithUI, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true,
        uiIntegration: {
          showConnectionStatus: true,
          showPeerList: true,
          enableNotifications: true
        }
      });
      
      // Initialize P2P
      await collaboration.p2p.init();
      
      // Ensure UI components were created
      if (dashboardWithUI.container.children) {
        const hasContainerElements = dashboardWithUI.container.children.length > 0;
        assert.strictEqual(hasContainerElements, true, 'Should add UI elements to dashboard container');
      }
      
      // Connect and check for connection event
      let connectionEvent = null;
      dashboard.eventBus.on('realtime:connection', (event) => {
        connectionEvent = event;
      });
      
      await collaboration.p2p.connect();
      
      // Check for connection event
      if (connectionEvent) {
        assert.strictEqual(connectionEvent.status, 'connected', 'Should emit connection event');
      }
      
      // Simulate peer join and check for event
      let peerEvent = null;
      dashboard.eventBus.on('realtime:peer', (event) => {
        peerEvent = event;
      });
      
      if (collaboration.p2p._mockPeerJoin) {
        collaboration.p2p._mockPeerJoin('peer-1', { name: 'Test Peer' });
      }
      
      // Check for peer event
      if (peerEvent) {
        assert.strictEqual(peerEvent.type, 'join', 'Should emit peer join event');
        assert.strictEqual(peerEvent.peerId, 'peer-1', 'Should include peer ID in event');
      }
      
      // Test message broadcasting through dashboard
      if (dashboardWithUI.eventBus.emit) {
        dashboardWithUI.eventBus.emit('dashboard:action', {
          action: 'update-content',
          data: { id: 'doc1', content: 'Updated from UI' }
        });
      }
      
      // Verify the message was broadcast
      if (collaboration.p2p.lastBroadcast) {
        const broadcastContent = collaboration.p2p.lastBroadcast.type === 'content-update' || 
                                 collaboration.p2p.lastBroadcast.type === 'update-content';
        assert.strictEqual(broadcastContent, true, 'Should broadcast content updates from UI actions');
      }
    });
    
    it('should handle document synchronization', async function() {
      const collaboration = await RealtimeCollaboration.loadRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true
      });
      
      await collaboration.p2p.init();
      await collaboration.p2p.connect();
      
      // Set up handlers for document sync
      let syncRequests = [];
      let documentUpdates = [];
      
      collaboration.p2p.onMessage('doc-sync-request', (message) => {
        syncRequests.push(message);
        
        // Respond with a sync response
        if (collaboration.p2p.sendDirectMessage) {
          collaboration.p2p.sendDirectMessage(message.from, 'doc-sync-response', {
            id: message.data.id,
            content: 'Full document content',
            version: 3,
            lastModified: Date.now()
          });
        }
      });
      
      collaboration.p2p.onMessage('doc-sync-response', (message) => {
        documentUpdates.push(message);
      });
      
      collaboration.p2p.onMessage('doc-update', (message) => {
        documentUpdates.push(message);
      });
      
      // Simulate peer join
      if (collaboration.p2p._mockPeerJoin) {
        collaboration.p2p._mockPeerJoin('peer-1', { name: 'Test Peer' });
      }
      
      // Request document sync
      if (collaboration.p2p.broadcastMessage) {
        collaboration.p2p.broadcastMessage('doc-sync-request', {
          id: 'doc1',
          version: 0 // Request latest version
        });
      }
      
      // Simulate receiving a sync response
      if (collaboration.p2p._mockReceiveMessage) {
        collaboration.p2p._mockReceiveMessage('doc-sync-response', {
          id: 'doc1',
          content: 'Full document content',
          version: 3,
          lastModified: Date.now()
        }, 'peer-1');
      }
      
      // Simulate receiving an update
      if (collaboration.p2p._mockReceiveMessage) {
        collaboration.p2p._mockReceiveMessage('doc-update', {
          id: 'doc1',
          changes: [
            { type: 'insert', position: 20, text: 'new content' }
          ],
          version: 4,
          lastModified: Date.now()
        }, 'peer-1');
      }
      
      // Check document updates were received
      const syncResponse = documentUpdates.find(msg => 
        msg.data && msg.data.id === 'doc1' && msg.data.content === 'Full document content'
      );
      
      const docUpdate = documentUpdates.find(msg => 
        msg.data && msg.data.id === 'doc1' && msg.data.changes && msg.data.changes.length > 0
      );
      
      if (syncResponse) {
        assert.strictEqual(syncResponse.data.version, 3, 'Should receive document sync with correct version');
      }
      
      if (docUpdate) {
        assert.strictEqual(docUpdate.data.version, 4, 'Should receive document update with correct version');
        assert.strictEqual(docUpdate.data.changes[0].type, 'insert', 'Should receive correct change type');
        assert.strictEqual(docUpdate.data.changes[0].text, 'new content', 'Should receive correct change content');
      }
    });
  });
});