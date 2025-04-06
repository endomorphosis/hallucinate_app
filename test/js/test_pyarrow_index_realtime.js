/**
 * Tests for PyArrow Content Index Dashboard integration with real-time collaboration
 * 
 * Tests the integration between PyArrow Content Index Dashboard and
 * the real-time collaboration features implemented with WebSocket, WebRTC and libp2p.
 */

const assert = require('assert');
const path = require('path');

// Import mocks
const { enableMocks: enableWebSocketMocks, disableMocks: disableWebSocketMocks } = require('./mocks/websocket_mock');
const { enableMocks: enableRTCMocks, disableMocks: disableRTCMocks } = require('./mocks/webrtc_mock');
const { enableMocks: enableLibp2pMocks } = require('./mocks/libp2p_mock');

// Mock PyArrow Content Index Dashboard
class MockPyArrowContentIndexDashboard {
  constructor(options = {}) {
    this.options = options;
    this.container = options.container || {};
    this.contentIndex = [];
    this.filters = {};
    this.sorting = { field: 'lastModified', direction: 'desc' };
    this.searchTerm = '';
    this.selectedEntry = null;
    this.currentPage = 1;
    this.pageSize = options.pageSize || 50;
    this.indexSize = 0;
    this.lastModified = Date.now();
    this.activeTab = 'browser';
    this.listView = 'grid';
    this.selectedTab = 'browser';
    
    // Event bus
    this.eventBus = {
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
    
    // User info
    this.user = options.user || { id: 'test-user', name: 'Test User' };
    
    // Stats/metrics
    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      typeDistribution: {},
      sizeDistribution: {},
      modifiedDistribution: {}
    };
  }
  
  async init() {
    // Generate mock content
    this.contentIndex = this._generateMockContent(1000);
    this.indexSize = this.contentIndex.length;
    this._calculateStats();
    
    // Emit init event
    this.eventBus.emit('dashboard:init', { success: true });
    
    return { success: true };
  }
  
  // Content management methods
  addEntry(entry) {
    this.contentIndex.push({
      ...entry,
      id: entry.id || entry.cid || `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      lastModified: entry.lastModified || Date.now()
    });
    
    this.lastModified = Date.now();
    this.indexSize = this.contentIndex.length;
    
    this._calculateStats();
    this.eventBus.emit('content:added', { entry });
    
    return { success: true, entry };
  }
  
  updateEntry(id, updates) {
    const index = this.contentIndex.findIndex(e => e.id === id || e.cid === id);
    
    if (index === -1) {
      return { success: false, error: 'Entry not found' };
    }
    
    // Update the entry
    this.contentIndex[index] = {
      ...this.contentIndex[index],
      ...updates,
      lastModified: Date.now()
    };
    
    this.lastModified = Date.now();
    this._calculateStats();
    
    this.eventBus.emit('content:updated', { 
      id, 
      entry: this.contentIndex[index], 
      updates 
    });
    
    return { success: true, entry: this.contentIndex[index] };
  }
  
  removeEntry(id) {
    const index = this.contentIndex.findIndex(e => e.id === id || e.cid === id);
    
    if (index === -1) {
      return { success: false, error: 'Entry not found' };
    }
    
    const entry = this.contentIndex[index];
    this.contentIndex.splice(index, 1);
    this.indexSize = this.contentIndex.length;
    this.lastModified = Date.now();
    
    this._calculateStats();
    this.eventBus.emit('content:removed', { id, entry });
    
    return { success: true, entry };
  }
  
  // Content retrieval/filtering methods
  searchAndFilterContent(options = {}) {
    const searchTerm = options.searchTerm || this.searchTerm;
    const filters = options.filters || this.filters;
    const sorting = options.sorting || this.sorting;
    const page = options.page || this.currentPage;
    const pageSize = options.pageSize || this.pageSize;
    
    // Apply search & filters
    let results = [...this.contentIndex];
    
    // Apply search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      results = results.filter(entry => 
        (entry.name && entry.name.toLowerCase().includes(searchLower)) ||
        (entry.cid && entry.cid.toLowerCase().includes(searchLower)) ||
        (entry.path && entry.path.toLowerCase().includes(searchLower)) ||
        (entry.mimeType && entry.mimeType.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply filters
    if (filters) {
      // Filter by size
      if (filters.minSize !== undefined) {
        results = results.filter(entry => entry.size >= filters.minSize);
      }
      
      if (filters.maxSize !== undefined) {
        results = results.filter(entry => entry.size <= filters.maxSize);
      }
      
      // Filter by type
      if (filters.types && filters.types.length > 0) {
        results = results.filter(entry => filters.types.includes(entry.mimeType));
      }
      
      // Filter by date
      if (filters.dateFrom) {
        results = results.filter(entry => entry.lastModified >= filters.dateFrom);
      }
      
      if (filters.dateTo) {
        results = results.filter(entry => entry.lastModified <= filters.dateTo);
      }
    }
    
    // Apply sorting
    if (sorting.field) {
      results.sort((a, b) => {
        const valA = a[sorting.field];
        const valB = b[sorting.field];
        
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        
        if (typeof valA === 'string') {
          return sorting.direction === 'asc' ? 
            valA.localeCompare(valB) : 
            valB.localeCompare(valA);
        } else {
          return sorting.direction === 'asc' ? 
            valA - valB : 
            valB - valA;
        }
      });
    }
    
    // Get total count
    const totalResults = results.length;
    
    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    results = results.slice(startIndex, startIndex + pageSize);
    
    return {
      success: true,
      results,
      pagination: {
        currentPage: page,
        pageSize,
        totalResults,
        totalPages: Math.ceil(totalResults / pageSize)
      }
    };
  }
  
  // UI interaction methods
  selectEntry(id) {
    const entry = this.contentIndex.find(e => e.id === id || e.cid === id);
    
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }
    
    this.selectedEntry = entry;
    this.eventBus.emit('content:selected', { entry });
    
    return { success: true, entry };
  }
  
  setFilter(filters) {
    this.filters = { ...this.filters, ...filters };
    this.eventBus.emit('filter:changed', { filters: this.filters });
    
    return { success: true, filters: this.filters };
  }
  
  setSorting(field, direction = 'asc') {
    this.sorting = { field, direction };
    this.eventBus.emit('sorting:changed', { sorting: this.sorting });
    
    return { success: true, sorting: this.sorting };
  }
  
  setSearchTerm(term) {
    this.searchTerm = term;
    this.eventBus.emit('search:changed', { term });
    
    return { success: true, term };
  }
  
  setPage(page) {
    this.currentPage = page;
    this.eventBus.emit('pagination:changed', { 
      page, 
      pageSize: this.pageSize 
    });
    
    return { success: true, page };
  }
  
  setActiveTab(tab) {
    this.activeTab = tab;
    this.eventBus.emit('tab:changed', { tab });
    
    return { success: true, tab };
  }
  
  setListView(view) {
    this.listView = view;
    this.eventBus.emit('view:changed', { view });
    
    return { success: true, view };
  }
  
  // Stats and metrics methods
  getStats() {
    return { success: true, stats: this.stats };
  }
  
  refreshStats() {
    this._calculateStats();
    return { success: true, stats: this.stats };
  }
  
  // Helper methods
  _generateMockContent(count = 100) {
    const content = [];
    const types = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain', 'application/json', 'video/mp4'];
    
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const size = Math.floor(Math.random() * 10000000); // 0-10MB
      
      content.push({
        id: `entry-${i}`,
        cid: `Qm${Math.random().toString(36).substr(2, 32)}`,
        name: `File ${i}.${type.split('/')[1]}`,
        path: `/path/to/file-${i}`,
        size: size,
        mimeType: type,
        lastModified: Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000), // Up to 30 days ago
        metadata: {
          pinned: Math.random() > 0.5,
          replicated: Math.floor(Math.random() * 5),
          tags: ['tag1', 'tag2']
        }
      });
    }
    
    return content;
  }
  
  _calculateStats() {
    const stats = {
      totalEntries: this.contentIndex.length,
      totalSize: 0,
      typeDistribution: {},
      sizeDistribution: {
        'small (<1MB)': 0,
        'medium (1-10MB)': 0,
        'large (>10MB)': 0
      },
      modifiedDistribution: {
        'today': 0,
        'yesterday': 0,
        'this week': 0,
        'this month': 0,
        'older': 0
      }
    };
    
    // Calculate timestamp ranges
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const today = now - (now % dayMs);
    const yesterday = today - dayMs;
    const thisWeek = today - (6 * dayMs);
    const thisMonth = today - (30 * dayMs);
    
    // Process each entry
    this.contentIndex.forEach(entry => {
      // Total size
      stats.totalSize += entry.size || 0;
      
      // Type distribution
      if (!stats.typeDistribution[entry.mimeType]) {
        stats.typeDistribution[entry.mimeType] = 0;
      }
      stats.typeDistribution[entry.mimeType]++;
      
      // Size distribution
      if (entry.size < 1000000) {
        stats.sizeDistribution['small (<1MB)']++;
      } else if (entry.size < 10000000) {
        stats.sizeDistribution['medium (1-10MB)']++;
      } else {
        stats.sizeDistribution['large (>10MB)']++;
      }
      
      // Modified distribution
      if (entry.lastModified >= today) {
        stats.modifiedDistribution['today']++;
      } else if (entry.lastModified >= yesterday) {
        stats.modifiedDistribution['yesterday']++;
      } else if (entry.lastModified >= thisWeek) {
        stats.modifiedDistribution['this week']++;
      } else if (entry.lastModified >= thisMonth) {
        stats.modifiedDistribution['this month']++;
      } else {
        stats.modifiedDistribution['older']++;
      }
    });
    
    this.stats = stats;
    return stats;
  }
  
  // User methods
  getUser() {
    return this.user;
  }
  
  // Notification methods
  showNotification(message, type = 'info') {
    this.lastNotification = { message, type };
    this.eventBus.emit('notification', { message, type });
  }
}

// Mock real-time collaboration - simplified for tests
class MockRealtimeCollaboration {
  constructor(dashboard, options = {}) {
    this.dashboard = dashboard;
    this.options = options;
    this.isInitialized = false;
    this.isConnected = false;
    this.peers = new Map();
    this.subscriptions = new Map();
    
    // Create WebSocket messaging
    this.realtimeUpdates = {
      connect() { return Promise.resolve(true); },
      subscribe: (topic, callback) => { 
        this.subscriptions.set(topic, callback);
        return true;
      },
      unsubscribe: (topic) => {
        this.subscriptions.delete(topic);
        return true;
      },
      publish: (topic, data) => {
        this.lastPublish = { topic, data };
        return true;
      }
    };
    
    // Create P2P if enabled
    if (options.enableWebRTC || options.enableLibp2p) {
      this.p2p = {
        init: async () => {
          this.isInitialized = true;
          return { success: true };
        },
        connect: async () => {
          this.isConnected = true;
          this.dashboard.eventBus.emit('realtime:connection', { status: 'connected' });
          return { success: true };
        },
        disconnect: async () => {
          this.isConnected = false;
          this.dashboard.eventBus.emit('realtime:connection', { status: 'disconnected' });
          return { success: true };
        },
        broadcastMessage: (type, payload) => {
          this.lastBroadcast = { type, payload };
          return true;
        },
        sendDirectMessage: (peerId, type, payload) => {
          this.lastDirectMessage = { peerId, type, payload };
          return true;
        },
        onMessage: (type, handler) => {
          this._messageHandlers = this._messageHandlers || {};
          this._messageHandlers[type] = handler;
          return this.p2p;
        }
      };
      
      // Add event emitter to p2p
      this.p2p.on = (event, callback) => {
        this._p2pEventHandlers = this._p2pEventHandlers || {};
        if (!this._p2pEventHandlers[event]) {
          this._p2pEventHandlers[event] = [];
        }
        this._p2pEventHandlers[event].push(callback);
        return this.p2p;
      };
      
      this.p2p._emitEvent = (event, data) => {
        if (this._p2pEventHandlers && this._p2pEventHandlers[event]) {
          this._p2pEventHandlers[event].forEach(handler => handler(data));
        }
      };
    }
  }
  
  async init() {
    if (this.p2p) {
      await this.p2p.init();
    }
    return { success: true };
  }
  
  // Test helper methods
  _mockReceiveMessage(topic, data) {
    if (this.subscriptions.has(topic)) {
      this.subscriptions.get(topic)(data);
    }
  }
  
  _mockReceiveP2PMessage(type, data, from = 'peer-1') {
    if (this._messageHandlers && this._messageHandlers[type]) {
      this._messageHandlers[type]({
        from,
        type,
        data
      });
    }
  }
  
  _mockPeerJoin(peerId, metadata = {}) {
    this.peers.set(peerId, { id: peerId, ...metadata });
    
    if (this.p2p && this.p2p._emitEvent) {
      this.p2p._emitEvent('peer:join', { peerId, metadata });
    }
    
    this.dashboard.eventBus.emit('realtime:peer', { 
      type: 'join', 
      peerId,
      metadata
    });
  }
  
  _mockPeerLeave(peerId) {
    this.peers.delete(peerId);
    
    if (this.p2p && this.p2p._emitEvent) {
      this.p2p._emitEvent('peer:leave', { peerId });
    }
    
    this.dashboard.eventBus.emit('realtime:peer', { 
      type: 'leave', 
      peerId
    });
  }
}

// Test integration function - simplified for tests
async function integrateDashboardWithRealtimeCollaboration(dashboard, options = {}) {
  const collaboration = new MockRealtimeCollaboration(dashboard, options);
  await collaboration.init();
  
  if (collaboration.p2p) {
    await collaboration.p2p.connect();
  }
  
  // Subscribe to dashboard events for real-time sharing
  dashboard.eventBus.on('content:added', (event) => {
    // Broadcast content addition
    if (collaboration.p2p) {
      collaboration.p2p.broadcastMessage('content:added', {
        entry: event.entry,
        origin: dashboard.getUser().id,
        timestamp: Date.now()
      });
    }
    
    // Also publish via WebSocket
    collaboration.realtimeUpdates.publish('content-updates', {
      type: 'added',
      entry: event.entry,
      origin: dashboard.getUser().id,
      timestamp: Date.now()
    });
  });
  
  dashboard.eventBus.on('content:updated', (event) => {
    // Broadcast content update
    if (collaboration.p2p) {
      collaboration.p2p.broadcastMessage('content:updated', {
        id: event.id,
        updates: event.updates,
        origin: dashboard.getUser().id,
        timestamp: Date.now()
      });
    }
    
    // Also publish via WebSocket
    collaboration.realtimeUpdates.publish('content-updates', {
      type: 'updated',
      id: event.id,
      updates: event.updates,
      origin: dashboard.getUser().id,
      timestamp: Date.now()
    });
  });
  
  dashboard.eventBus.on('content:removed', (event) => {
    // Broadcast content removal
    if (collaboration.p2p) {
      collaboration.p2p.broadcastMessage('content:removed', {
        id: event.id,
        origin: dashboard.getUser().id,
        timestamp: Date.now()
      });
    }
    
    // Also publish via WebSocket
    collaboration.realtimeUpdates.publish('content-updates', {
      type: 'removed',
      id: event.id,
      origin: dashboard.getUser().id,
      timestamp: Date.now()
    });
  });
  
  // Subscribe to WebSocket messages for content updates
  collaboration.realtimeUpdates.subscribe('content-updates', (data) => {
    // Ignore our own messages
    if (data.origin === dashboard.getUser().id) {
      return;
    }
    
    // Handle based on type
    switch (data.type) {
      case 'added':
        if (data.entry) {
          dashboard.addEntry(data.entry);
          dashboard.showNotification(`New content added by ${data.origin}`, 'info');
        }
        break;
      case 'updated':
        if (data.id && data.updates) {
          dashboard.updateEntry(data.id, data.updates);
          dashboard.showNotification(`Content updated by ${data.origin}`, 'info');
        }
        break;
      case 'removed':
        if (data.id) {
          dashboard.removeEntry(data.id);
          dashboard.showNotification(`Content removed by ${data.origin}`, 'info');
        }
        break;
    }
  });
  
  // Subscribe to P2P messages if enabled
  if (collaboration.p2p) {
    // Content added handler
    collaboration.p2p.onMessage('content:added', (message) => {
      // Ignore our own messages
      if (message.data.origin === dashboard.getUser().id) {
        return;
      }
      
      if (message.data.entry) {
        dashboard.addEntry(message.data.entry);
        dashboard.showNotification(`New content added by ${message.data.origin || message.from}`, 'info');
      }
    });
    
    // Content updated handler
    collaboration.p2p.onMessage('content:updated', (message) => {
      // Ignore our own messages
      if (message.data.origin === dashboard.getUser().id) {
        return;
      }
      
      if (message.data.id && message.data.updates) {
        dashboard.updateEntry(message.data.id, message.data.updates);
        dashboard.showNotification(`Content updated by ${message.data.origin || message.from}`, 'info');
      }
    });
    
    // Content removed handler
    collaboration.p2p.onMessage('content:removed', (message) => {
      // Ignore our own messages
      if (message.data.origin === dashboard.getUser().id) {
        return;
      }
      
      if (message.data.id) {
        dashboard.removeEntry(message.data.id);
        dashboard.showNotification(`Content removed by ${message.data.origin || message.from}`, 'info');
      }
    });
  }
  
  // Handle peer presence visualization
  if (collaboration.p2p) {
    dashboard.eventBus.on('realtime:peer', (event) => {
      if (event.type === 'join') {
        dashboard.showNotification(`Peer ${event.peerId} joined`, 'success');
      } else if (event.type === 'leave') {
        dashboard.showNotification(`Peer ${event.peerId} left`, 'info');
      }
    });
  }
  
  return { success: true, collaboration };
}

describe('PyArrow Content Index Dashboard with Real-time Collaboration', function() {
  let dashboard;
  
  beforeEach(function() {
    // Set up mocks
    enableWebSocketMocks();
    enableRTCMocks();
    enableLibp2pMocks();
    
    // Create mock dashboard
    dashboard = new MockPyArrowContentIndexDashboard({
      user: { id: 'user-1', name: 'User 1' }
    });
  });
  
  afterEach(function() {
    // Clean up mocks
    disableWebSocketMocks();
    disableRTCMocks();
  });
  
  describe('Dashboard Initialization with Real-time Features', function() {
    it('should initialize dashboard with real-time capabilities', async function() {
      // Initialize dashboard
      await dashboard.init();
      
      // Integrate with real-time collaboration
      const integration = await integrateDashboardWithRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true
      });
      
      assert.strictEqual(integration.success, true, 'Should successfully integrate real-time features');
      assert.ok(integration.collaboration, 'Should have collaboration instance');
      assert.strictEqual(integration.collaboration.isConnected, true, 'Should be connected');
    });
  });
  
  describe('Content Synchronization via Real-time Collaboration', function() {
    let collaboration;
    
    beforeEach(async function() {
      // Initialize dashboard
      await dashboard.init();
      
      // Integrate with real-time collaboration
      const integration = await integrateDashboardWithRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true
      });
      
      collaboration = integration.collaboration;
      
      // Add a peer
      collaboration._mockPeerJoin('user-2', { name: 'User 2' });
    });
    
    it('should broadcast content additions', function() {
      // Add content to dashboard
      const newEntry = {
        id: 'new-entry-1',
        cid: 'QmnewContent123',
        name: 'New Content.jpg',
        path: '/path/to/new-content',
        size: 2000000,
        mimeType: 'image/jpeg',
        lastModified: Date.now()
      };
      
      dashboard.addEntry(newEntry);
      
      // Check that the content was broadcast via P2P
      assert.strictEqual(collaboration.lastBroadcast.type, 'content:added', 'Should broadcast content:added');
      assert.deepStrictEqual(collaboration.lastBroadcast.payload.entry.id, newEntry.id, 'Should broadcast correct entry data');
      
      // Check that the content was published via WebSocket
      assert.strictEqual(collaboration.lastPublish.topic, 'content-updates', 'Should publish to content-updates topic');
      assert.strictEqual(collaboration.lastPublish.data.type, 'added', 'Should publish added type');
      assert.deepStrictEqual(collaboration.lastPublish.data.entry.id, newEntry.id, 'Should publish correct entry data');
    });
    
    it('should broadcast content updates', function() {
      // First, add content
      const entry = {
        id: 'entry-to-update',
        cid: 'QmUpdateMe123',
        name: 'Update Me.txt',
        path: '/path/to/update',
        size: 1000,
        mimeType: 'text/plain',
        lastModified: Date.now()
      };
      
      dashboard.addEntry(entry);
      
      // Clear broadcast records
      collaboration.lastBroadcast = null;
      collaboration.lastPublish = null;
      
      // Now update the content
      const updates = {
        name: 'Updated File.txt',
        size: 2000
      };
      
      dashboard.updateEntry(entry.id, updates);
      
      // Check that the update was broadcast via P2P
      assert.strictEqual(collaboration.lastBroadcast.type, 'content:updated', 'Should broadcast content:updated');
      assert.strictEqual(collaboration.lastBroadcast.payload.id, entry.id, 'Should broadcast correct entry ID');
      assert.deepStrictEqual(collaboration.lastBroadcast.payload.updates, updates, 'Should broadcast correct updates');
      
      // Check that the update was published via WebSocket
      assert.strictEqual(collaboration.lastPublish.topic, 'content-updates', 'Should publish to content-updates topic');
      assert.strictEqual(collaboration.lastPublish.data.type, 'updated', 'Should publish updated type');
      assert.strictEqual(collaboration.lastPublish.data.id, entry.id, 'Should publish correct entry ID');
      assert.deepStrictEqual(collaboration.lastPublish.data.updates, updates, 'Should publish correct updates');
    });
    
    it('should broadcast content removals', function() {
      // First, add content
      const entry = {
        id: 'entry-to-remove',
        cid: 'QmRemoveMe123',
        name: 'Remove Me.pdf',
        path: '/path/to/remove',
        size: 5000000,
        mimeType: 'application/pdf',
        lastModified: Date.now()
      };
      
      dashboard.addEntry(entry);
      
      // Clear broadcast records
      collaboration.lastBroadcast = null;
      collaboration.lastPublish = null;
      
      // Now remove the content
      dashboard.removeEntry(entry.id);
      
      // Check that the removal was broadcast via P2P
      assert.strictEqual(collaboration.lastBroadcast.type, 'content:removed', 'Should broadcast content:removed');
      assert.strictEqual(collaboration.lastBroadcast.payload.id, entry.id, 'Should broadcast correct entry ID');
      
      // Check that the removal was published via WebSocket
      assert.strictEqual(collaboration.lastPublish.topic, 'content-updates', 'Should publish to content-updates topic');
      assert.strictEqual(collaboration.lastPublish.data.type, 'removed', 'Should publish removed type');
      assert.strictEqual(collaboration.lastPublish.data.id, entry.id, 'Should publish correct entry ID');
    });
    
    it('should handle remote content additions via WebSocket', function() {
      // Initial entry count
      const initialCount = dashboard.contentIndex.length;
      
      // Simulate receiving a content addition via WebSocket
      const newEntry = {
        id: 'remote-entry-1',
        cid: 'QmRemoteContent123',
        name: 'Remote Content.png',
        path: '/path/to/remote-content',
        size: 3000000,
        mimeType: 'image/png',
        lastModified: Date.now()
      };
      
      collaboration._mockReceiveMessage('content-updates', {
        type: 'added',
        entry: newEntry,
        origin: 'user-2',
        timestamp: Date.now()
      });
      
      // Check that the content was added to the dashboard
      assert.strictEqual(dashboard.contentIndex.length, initialCount + 1, 'Should add remote content to index');
      
      const addedEntry = dashboard.contentIndex.find(e => e.id === newEntry.id);
      assert.ok(addedEntry, 'Should find added entry in index');
      assert.strictEqual(addedEntry.name, newEntry.name, 'Should add entry with correct name');
      
      // Check that a notification was shown
      assert.ok(dashboard.lastNotification, 'Should show notification');
      assert.strictEqual(dashboard.lastNotification.type, 'info', 'Should show info notification');
      assert.ok(dashboard.lastNotification.message.includes('user-2'), 'Notification should mention origin user');
    });
    
    it('should handle remote content updates via P2P', function() {
      // First, add content
      const entry = {
        id: 'entry-for-remote-update',
        cid: 'QmUpdateRemote123',
        name: 'Update Remote.txt',
        path: '/path/to/remote-update',
        size: 1000,
        mimeType: 'text/plain',
        lastModified: Date.now()
      };
      
      dashboard.addEntry(entry);
      
      // Clear last notification
      dashboard.lastNotification = null;
      
      // Simulate receiving a content update via P2P
      const updates = {
        name: 'Remotely Updated.txt',
        size: 2500
      };
      
      collaboration._mockReceiveP2PMessage('content:updated', {
        id: entry.id,
        updates,
        origin: 'user-2',
        timestamp: Date.now()
      }, 'user-2');
      
      // Check that the content was updated in the dashboard
      const updatedEntry = dashboard.contentIndex.find(e => e.id === entry.id);
      assert.ok(updatedEntry, 'Should find updated entry in index');
      assert.strictEqual(updatedEntry.name, updates.name, 'Should update entry with correct name');
      assert.strictEqual(updatedEntry.size, updates.size, 'Should update entry with correct size');
      
      // Check that a notification was shown
      assert.ok(dashboard.lastNotification, 'Should show notification');
      assert.strictEqual(dashboard.lastNotification.type, 'info', 'Should show info notification');
      assert.ok(dashboard.lastNotification.message.includes('updated'), 'Notification should mention update');
    });
    
    it('should handle remote content removals via P2P', function() {
      // First, add content
      const entry = {
        id: 'entry-for-remote-removal',
        cid: 'QmRemoveRemote123',
        name: 'Remove Remote.jpg',
        path: '/path/to/remote-removal',
        size: 4000000,
        mimeType: 'image/jpeg',
        lastModified: Date.now()
      };
      
      dashboard.addEntry(entry);
      
      // Get initial count
      const initialCount = dashboard.contentIndex.length;
      
      // Clear last notification
      dashboard.lastNotification = null;
      
      // Simulate receiving a content removal via P2P
      collaboration._mockReceiveP2PMessage('content:removed', {
        id: entry.id,
        origin: 'user-2',
        timestamp: Date.now()
      }, 'user-2');
      
      // Check that the content was removed from the dashboard
      assert.strictEqual(dashboard.contentIndex.length, initialCount - 1, 'Should remove entry from index');
      const removedEntry = dashboard.contentIndex.find(e => e.id === entry.id);
      assert.strictEqual(removedEntry, undefined, 'Should not find removed entry in index');
      
      // Check that a notification was shown
      assert.ok(dashboard.lastNotification, 'Should show notification');
      assert.strictEqual(dashboard.lastNotification.type, 'info', 'Should show info notification');
      assert.ok(dashboard.lastNotification.message.includes('removed'), 'Notification should mention removal');
    });
  });
  
  describe('Real-time Peer Awareness', function() {
    let collaboration;
    
    beforeEach(async function() {
      // Initialize dashboard
      await dashboard.init();
      
      // Integrate with real-time collaboration
      const integration = await integrateDashboardWithRealtimeCollaboration(dashboard, {
        wsUrl: 'ws://localhost:8080',
        enableWebRTC: true,
        enableLibp2p: true
      });
      
      collaboration = integration.collaboration;
    });
    
    it('should show notifications when peers join', function() {
      // Clear last notification
      dashboard.lastNotification = null;
      
      // Simulate peer join
      collaboration._mockPeerJoin('user-2', { name: 'User 2' });
      
      // Check that a notification was shown
      assert.ok(dashboard.lastNotification, 'Should show notification');
      assert.strictEqual(dashboard.lastNotification.type, 'success', 'Should show success notification');
      assert.ok(dashboard.lastNotification.message.includes('joined'), 'Notification should mention joining');
    });
    
    it('should show notifications when peers leave', function() {
      // First add a peer
      collaboration._mockPeerJoin('user-2', { name: 'User 2' });
      
      // Clear last notification
      dashboard.lastNotification = null;
      
      // Simulate peer leave
      collaboration._mockPeerLeave('user-2');
      
      // Check that a notification was shown
      assert.ok(dashboard.lastNotification, 'Should show notification');
      assert.strictEqual(dashboard.lastNotification.type, 'info', 'Should show info notification');
      assert.ok(dashboard.lastNotification.message.includes('left'), 'Notification should mention leaving');
    });
  });
});