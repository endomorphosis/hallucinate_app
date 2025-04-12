/**
 * libp2p mock for testing real-time collaboration features
 */

class MockLibp2p {
  constructor(options = {}) {
    this.options = options;
    this.isStarted = false;
    this.peerId = {
      toString: () => options.peerId || `mock-peer-${Math.random().toString(36).substring(7)}`,
      toB58String: function() { return this.toString(); }
    };
    
    // Mock libp2p components
    this.pubsub = new MockPubSub(this);
    this.connectionManager = new MockConnectionManager(this);
    this.peerStore = new MockPeerStore(this);
    this.contentRouting = new MockContentRouting(this);
    this.peerRouting = new MockPeerRouting(this);
    
    // Expose event emitter interface
    this.eventEmitter = new EventEmitter();
    this.on = this.eventEmitter.on.bind(this.eventEmitter);
    this.off = this.eventEmitter.off.bind(this.eventEmitter);
    this.once = this.eventEmitter.once.bind(this.eventEmitter);
    this.removeListener = this.eventEmitter.removeListener.bind(this.eventEmitter);
    this.removeAllListeners = this.eventEmitter.removeAllListeners.bind(this.eventEmitter);
    this.emit = this.eventEmitter.emit.bind(this.eventEmitter);
  }
  
  async start() {
    if (this.isStarted) return;
    this.isStarted = true;
    this.emit('start');
    return Promise.resolve();
  }
  
  async stop() {
    if (!this.isStarted) return;
    this.isStarted = false;
    this.emit('stop');
    return Promise.resolve();
  }
  
  // Mock-specific methods
  mockConnectToPeer(peerId) {
    const peer = this.peerStore.getPeer(peerId) || {
      id: {
        toString: () => peerId,
        toB58String: () => peerId
      }
    };
    
    this.connectionManager.connections.set(peerId, {
      remotePeer: peer,
      status: 'open'
    });
    
    this.emit('peer:connect', peer);
    return Promise.resolve();
  }
  
  mockDisconnectFromPeer(peerId) {
    if (this.connectionManager.connections.has(peerId)) {
      const conn = this.connectionManager.connections.get(peerId);
      this.connectionManager.connections.delete(peerId);
      this.emit('peer:disconnect', conn.remotePeer);
    }
    return Promise.resolve();
  }
  
  mockDiscoverPeer(peerId, multiaddrs = ['/ip4/127.0.0.1/tcp/4001']) {
    const peer = {
      id: {
        toString: () => peerId,
        toB58String: () => peerId
      },
      multiaddrs
    };
    
    this.peerStore.addressBook.set(peerId, multiaddrs);
    this.emit('peer:discovery', peer);
    return peer;
  }
}

class MockPubSub {
  constructor(node) {
    this.node = node;
    this.subscriptions = new Map();
    this.handlers = new Map();
  }
  
  subscribe(topic, handler) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic).add(handler);
    this.handlers.set(handler, topic);
    return Promise.resolve();
  }
  
  unsubscribe(topic, handler) {
    if (this.subscriptions.has(topic)) {
      this.subscriptions.get(topic).delete(handler);
      if (this.subscriptions.get(topic).size === 0) {
        this.subscriptions.delete(topic);
      }
    }
    this.handlers.delete(handler);
    return Promise.resolve();
  }
  
  publish(topic, data) {
    if (!this.node.isStarted) {
      return Promise.reject(new Error('Node is not started'));
    }
    
    const message = {
      from: this.node.peerId.toString(),
      data: data,
      seqno: Date.now(),
      topicIDs: [topic]
    };
    
    // Let the global mock network handle message distribution
    mockLibp2pNetwork.distributePubSubMessage(topic, message, this.node);
    
    return Promise.resolve();
  }
  
  getTopics() {
    return Array.from(this.subscriptions.keys());
  }
  
  // Mock method to receive a message from the network
  mockReceive(topic, message) {
    if (!this.subscriptions.has(topic)) return;
    
    for (const handler of this.subscriptions.get(topic)) {
      handler(message);
    }
  }
}

class MockConnectionManager {
  constructor(node) {
    this.node = node;
    this.connections = new Map();
  }
  
  getConnections() {
    return Array.from(this.connections.values());
  }
  
  getConnection(peerId) {
    return this.connections.get(peerId) || null;
  }
}

class MockPeerStore {
  constructor(node) {
    this.node = node;
    this.peers = new Map();
    this.addressBook = new Map();
    this.keyBook = new Map();
    this.metadataBook = new Map();
    this.protoBook = new Map();
  }
  
  getPeer(peerId) {
    return this.peers.get(peerId);
  }
  
  getMultiaddrsForPeer(peerId) {
    return this.addressBook.get(peerId) || [];
  }
}

class MockContentRouting {
  constructor(node) {
    this.node = node;
    this.providers = new Map();
  }
  
  provide(cid) {
    if (!this.providers.has(cid)) {
      this.providers.set(cid, new Set());
    }
    this.providers.get(cid).add(this.node.peerId.toString());
    return Promise.resolve();
  }
  
  unprovide(cid) {
    if (this.providers.has(cid)) {
      this.providers.get(cid).delete(this.node.peerId.toString());
      if (this.providers.get(cid).size === 0) {
        this.providers.delete(cid);
      }
    }
    return Promise.resolve();
  }
  
  findProviders(cid, options = {}) {
    const providers = this.providers.has(cid) 
      ? Array.from(this.providers.get(cid)).map(id => ({ id }))
      : [];
    return Promise.resolve(providers);
  }
}

class MockPeerRouting {
  constructor(node) {
    this.node = node;
    this.routes = new Map();
  }
  
  findPeer(peerId) {
    if (this.routes.has(peerId)) {
      return Promise.resolve(this.routes.get(peerId));
    }
    return Promise.reject(new Error('Peer not found'));
  }
}

// Very simple event emitter for testing
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }
  
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);
    return this;
  }
  
  off(event, listener) {
    return this.removeListener(event, listener);
  }
  
  once(event, listener) {
    const onceListener = (...args) => {
      this.removeListener(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }
  
  removeListener(event, listener) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(listener);
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }
  
  removeAllListeners(event) {
    if (event === undefined) {
      this.listeners.clear();
    } else if (this.listeners.has(event)) {
      this.listeners.delete(event);
    }
    return this;
  }
  
  emit(event, ...args) {
    if (this.listeners.has(event)) {
      for (const listener of this.listeners.get(event)) {
        listener(...args);
      }
      return true;
    }
    return false;
  }
}

// Global mock network for testing libp2p
class MockLibp2pNetwork {
  constructor() {
    this.nodes = new Map();
    this.peerRoutes = new Map();
    this.contentProviders = new Map();
  }
  
  addNode(node) {
    this.nodes.set(node.peerId.toString(), node);
  }
  
  removeNode(node) {
    this.nodes.delete(node.peerId.toString());
  }
  
  distributePubSubMessage(topic, message, sourceNode) {
    for (const [peerId, node] of this.nodes.entries()) {
      if (peerId !== sourceNode.peerId.toString() && node.isStarted) {
        // Check if this node is subscribed to the topic
        if (node.pubsub.subscriptions.has(topic)) {
          // Deliver the message after a simulated network delay
          setTimeout(() => node.pubsub.mockReceive(topic, message), Math.random() * 50);
        }
      }
    }
  }
  
  reset() {
    this.nodes.clear();
    this.peerRoutes.clear();
    this.contentProviders.clear();
  }
}

// Initialize global mock network
const mockLibp2pNetwork = new MockLibp2pNetwork();

// Factory function for creating a mock libp2p node
function createMockLibp2p(options = {}) {
  const node = new MockLibp2p(options);
  mockLibp2pNetwork.addNode(node);
  return node;
}

module.exports = {
  MockLibp2p,
  createMockLibp2p,
  mockLibp2pNetwork,
  // Helper for mocking the entire library
  enableMocks() {
    // Reset the network state
    mockLibp2pNetwork.reset();
    
    // This might be injected elsewhere, but we're returning the factory
    return {
      createLibp2p: createMockLibp2p
    };
  },
  // Helper to get the global network state for testing
  getNetwork() {
    return mockLibp2pNetwork;
  }
};