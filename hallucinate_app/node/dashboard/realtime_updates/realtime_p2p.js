/**
 * Real-Time P2P Collaboration Module for PyArrow Content Index Dashboard
 * 
 * This module extends the real-time capabilities with peer-to-peer functionality
 * using WebRTC and libp2p. It enables direct communication between browser instances
 * for real-time collaboration without requiring a central server for all communications.
 */

import { libp2pKit } from '../../libp2p_kit.js';

/**
 * P2P Communication Manager class for real-time collaboration
 */
class RealtimeP2P {
  /**
   * Initialize the P2P communication manager
   * @param {Object} options Configuration options
   * @param {Object} options.eventBus Event bus for communication
   * @param {Object} options.realtimeUpdates RealtimeUpdates instance
   * @param {Object} options.config Configuration options
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.realtimeUpdates = options.realtimeUpdates;
    this.config = {
      // WebRTC configuration
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ],
      // libp2p configuration
      libp2p: {
        enableWebRTC: true,
        relayDiscovery: true,
        pubsub: true,
        topic: 'pyarrow-content-index-updates'
      },
      // General P2P configuration
      maxPeers: 10,
      autoConnect: true,
      enableDiscovery: true,
      ...options.config
    };
    
    // State
    this.initialized = false;
    this.connected = false;
    this.peers = new Map();
    this.peerId = null;
    this.peerStats = {
      messagesReceived: 0,
      messagesSent: 0,
      connectedPeers: 0
    };
    
    // WebRTC connections
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    
    // libp2p node
    this.libp2pNode = null;
    
    // Message buffers
    this.outgoingMessages = [];
    this.recentMessages = [];
    
    // Bind methods
    this._handlePeerConnect = this._handlePeerConnect.bind(this);
    this._handlePeerDisconnect = this._handlePeerDisconnect.bind(this);
    this._handleMessageReceived = this._handleMessageReceived.bind(this);
    this._handleContentUpdate = this._handleContentUpdate.bind(this);
  }
  
  /**
   * Initialize the P2P communication system
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    try {
      console.info('Initializing P2P communication');
      
      // Set up libp2p node
      await this._initLibp2p();
      
      // Set up WebRTC connections
      await this._initWebRTC();
      
      // Register event listeners
      this._registerEventListeners();
      
      this.initialized = true;
      console.info('P2P communication initialized', { peerId: this.peerId });
      
      // Connect if auto-connect is enabled
      if (this.config.autoConnect) {
        this.connect();
      }
      
      // Notify initialization success
      if (this.eventBus) {
        this.eventBus.emit('p2p-initialized', {
          peerId: this.peerId,
          timestamp: new Date().toISOString()
        });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize P2P communication:', error);
      
      // Notify initialization failure
      if (this.eventBus) {
        this.eventBus.emit('p2p-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      return false;
    }
  }
  
  /**
   * Initialize libp2p node
   * @private
   */
  async _initLibp2p() {
    try {
      console.info('Initializing libp2p node');
      
      // Initialize libp2p node using libp2pKit
      this.libp2pNode = await libp2pKit.createNode({
        webrtc: this.config.libp2p.enableWebRTC,
        pubsub: this.config.libp2p.pubsub,
        bootstrap: true,
        relay: true
      });
      
      // Store peer ID
      this.peerId = this.libp2pNode.peerId.toString();
      
      // Start the node
      await this.libp2pNode.start();
      
      // Set up pubsub for content updates
      if (this.config.libp2p.pubsub) {
        await this.libp2pNode.pubsub.subscribe(
          this.config.libp2p.topic,
          this._handlePubsubMessage.bind(this)
        );
      }
      
      // Set up connection handlers
      this.libp2pNode.connectionManager.on('peer:connect', this._handlePeerConnect);
      this.libp2pNode.connectionManager.on('peer:disconnect', this._handlePeerDisconnect);
      
      console.info('libp2p node initialized', {
        peerId: this.peerId,
        pubsub: this.config.libp2p.pubsub
      });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize libp2p:', error);
      throw new Error(`Failed to initialize libp2p: ${error.message}`);
    }
  }
  
  /**
   * Initialize WebRTC connections
   * @private
   */
  async _initWebRTC() {
    if (!window.RTCPeerConnection) {
      console.warn('WebRTC is not supported in this browser');
      return false;
    }
    
    try {
      // Set up connection options
      this.rtcConfig = {
        iceServers: this.config.iceServers
      };
      
      console.info('WebRTC initialized with configuration:', this.rtcConfig);
      return true;
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      return false;
    }
  }
  
  /**
   * Register event listeners
   * @private
   */
  _registerEventListeners() {
    if (this.eventBus) {
      // Listen for content updates from the UI
      this.eventBus.on('content-updated', this._handleContentUpdate);
      
      // Listen for manual refresh
      this.eventBus.on('manual-refresh', () => {
        this._broadcastPresence();
      });
      
      // Handle peer discovery events
      this.eventBus.on('peer-discovered', (data) => {
        this._connectToPeer(data.peerId);
      });
      
      // Handle UI events
      this.eventBus.on('p2p-connect', this.connect.bind(this));
      this.eventBus.on('p2p-disconnect', this.disconnect.bind(this));
      this.eventBus.on('p2p-broadcast', (data) => {
        this.broadcastMessage(data.type, data.payload);
      });
    }
  }
  
  /**
   * Connect to the P2P network
   * @returns {Promise<boolean>} Connection success
   */
  async connect() {
    if (this.connected || !this.initialized) {
      return false;
    }
    
    try {
      console.info('Connecting to P2P network');
      
      // Start discovery if enabled
      if (this.config.enableDiscovery) {
        await this._startDiscovery();
      }
      
      // Broadcast presence to network
      this._broadcastPresence();
      
      this.connected = true;
      
      // Notify connection success
      if (this.eventBus) {
        this.eventBus.emit('p2p-connected', {
          peerId: this.peerId,
          timestamp: new Date().toISOString()
        });
      }
      
      // Start periodic presence announcements
      this.presenceInterval = setInterval(() => {
        this._broadcastPresence();
      }, 60000); // Every minute
      
      return true;
    } catch (error) {
      console.error('Failed to connect to P2P network:', error);
      
      // Notify connection failure
      if (this.eventBus) {
        this.eventBus.emit('p2p-error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      return false;
    }
  }
  
  /**
   * Disconnect from the P2P network
   */
  disconnect() {
    if (!this.connected) {
      return;
    }
    
    console.info('Disconnecting from P2P network');
    
    // Stop presence announcements
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    
    // Close WebRTC connections
    this.peerConnections.forEach((connection, peerId) => {
      this._closePeerConnection(peerId);
    });
    
    this.connected = false;
    
    // Notify disconnection
    if (this.eventBus) {
      this.eventBus.emit('p2p-disconnected', {
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Start peer discovery
   * @private
   */
  async _startDiscovery() {
    if (!this.libp2pNode) {
      throw new Error('libp2p node not initialized');
    }
    
    try {
      // Enable discovery services
      await this.libp2pNode.startDiscovery();
      
      console.info('P2P discovery started');
      return true;
    } catch (error) {
      console.error('Failed to start discovery:', error);
      throw error;
    }
  }
  
  /**
   * Broadcast presence to the network
   * @private
   */
  _broadcastPresence() {
    if (!this.connected || !this.libp2pNode) {
      return;
    }
    
    try {
      // Broadcast presence via pubsub
      if (this.libp2pNode.pubsub) {
        const message = {
          type: 'presence',
          peerId: this.peerId,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          metrics: {
            connectedPeers: this.peerConnections.size,
            messagesProcessed: this.peerStats.messagesReceived
          }
        };
        
        this.libp2pNode.pubsub.publish(
          this.config.libp2p.topic,
          new TextEncoder().encode(JSON.stringify(message))
        );
        
        this.peerStats.messagesSent++;
      }
    } catch (error) {
      console.error('Failed to broadcast presence:', error);
    }
  }
  
  /**
   * Handle peer connect event
   * @param {Object} connection Peer connection
   * @private
   */
  _handlePeerConnect(connection) {
    const peerId = connection.remotePeer.toString();
    console.info('Peer connected:', peerId);
    
    // Store peer information
    this.peers.set(peerId, {
      id: peerId,
      connected: true,
      connectedAt: Date.now(),
      lastSeen: Date.now()
    });
    
    this.peerStats.connectedPeers = this.peers.size;
    
    // Set up WebRTC connection if not already established
    if (!this.peerConnections.has(peerId)) {
      this._setupWebRTCConnection(peerId);
    }
    
    // Notify peer connection
    if (this.eventBus) {
      this.eventBus.emit('peer-connected', {
        peerId,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Handle peer disconnect event
   * @param {Object} connection Peer connection
   * @private
   */
  _handlePeerDisconnect(connection) {
    const peerId = connection.remotePeer.toString();
    console.info('Peer disconnected:', peerId);
    
    // Update peer information
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connected = false;
      peer.disconnectedAt = Date.now();
    }
    
    // Close WebRTC connection if exists
    this._closePeerConnection(peerId);
    
    this.peerStats.connectedPeers = [...this.peers.values()].filter(p => p.connected).length;
    
    // Notify peer disconnection
    if (this.eventBus) {
      this.eventBus.emit('peer-disconnected', {
        peerId,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Handle pubsub message
   * @param {Object} message Message received
   * @private
   */
  _handlePubsubMessage(message) {
    try {
      const decodedMsg = new TextDecoder().decode(message.data);
      const data = JSON.parse(decodedMsg);
      
      // Skip own messages
      if (data.peerId === this.peerId) {
        return;
      }
      
      this.peerStats.messagesReceived++;
      
      // Process based on message type
      switch (data.type) {
        case 'presence':
          this._handlePresenceMessage(data);
          break;
          
        case 'content-update':
          this._handleRemoteContentUpdate(data);
          break;
          
        case 'sync-request':
          this._handleSyncRequest(data);
          break;
          
        default:
          // Handle other message types
          if (this.eventBus) {
            this.eventBus.emit('p2p-message', {
              type: data.type,
              peerId: data.peerId,
              payload: data,
              timestamp: new Date().toISOString()
            });
          }
      }
      
      // Add to recent messages
      this._addToRecentMessages({
        type: data.type,
        peerId: data.peerId,
        timestamp: data.timestamp
      });
      
    } catch (error) {
      console.error('Error processing pubsub message:', error);
    }
  }
  
  /**
   * Handle presence message from peer
   * @param {Object} data Message data
   * @private
   */
  _handlePresenceMessage(data) {
    const peerId = data.peerId;
    
    // Update peer info if exists, otherwise add new peer
    if (this.peers.has(peerId)) {
      const peer = this.peers.get(peerId);
      peer.lastSeen = Date.now();
      peer.userAgent = data.userAgent;
      peer.metrics = data.metrics;
    } else {
      this.peers.set(peerId, {
        id: peerId,
        connected: false,
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
        userAgent: data.userAgent,
        metrics: data.metrics
      });
      
      // Emit peer discovered event
      if (this.eventBus) {
        this.eventBus.emit('peer-discovered', {
          peerId,
          userAgent: data.userAgent,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  /**
   * Setup WebRTC connection with peer
   * @param {string} peerId Peer ID to connect to
   * @private
   */
  _setupWebRTCConnection(peerId) {
    if (!window.RTCPeerConnection) {
      return;
    }
    
    // Create a new RTCPeerConnection
    const connection = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(peerId, connection);
    
    // Create data channel
    const channel = connection.createDataChannel(`pyarrow-collab-${this.peerId}`, {
      ordered: true
    });
    
    // Set up data channel event handlers
    channel.onopen = () => {
      console.log(`Data channel with ${peerId} opened`);
      this.dataChannels.set(peerId, channel);
      
      // Send any queued messages
      this.outgoingMessages.forEach(message => {
        this._sendDirectMessage(peerId, message.type, message.payload);
      });
      
      // Clear queue
      this.outgoingMessages = [];
    };
    
    channel.onclose = () => {
      console.log(`Data channel with ${peerId} closed`);
      this.dataChannels.delete(peerId);
    };
    
    channel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };
    
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this._handleMessageReceived(peerId, message);
      } catch (error) {
        console.error('Error processing WebRTC message:', error);
      }
    };
    
    // Set up connection event handlers
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send candidate to peer via libp2p signaling
        this._sendSignalingData(peerId, {
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };
    
    connection.onnegotiationneeded = async () => {
      try {
        await connection.setLocalDescription(await connection.createOffer());
        // Send offer to peer via libp2p signaling
        this._sendSignalingData(peerId, {
          type: 'offer',
          sdp: connection.localDescription
        });
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    };
    
    connection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}:`, connection.iceConnectionState);
      
      if (connection.iceConnectionState === 'disconnected' || 
          connection.iceConnectionState === 'failed' ||
          connection.iceConnectionState === 'closed') {
        this._closePeerConnection(peerId);
      }
    };
    
    // Handle data channels created by the remote peer
    connection.ondatachannel = (event) => {
      const remoteChannel = event.channel;
      remoteChannel.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          this._handleMessageReceived(peerId, message);
        } catch (error) {
          console.error('Error processing WebRTC message:', error);
        }
      };
      
      this.dataChannels.set(peerId, remoteChannel);
    };
  }
  
  /**
   * Close WebRTC connection with peer
   * @param {string} peerId Peer ID to disconnect
   * @private
   */
  _closePeerConnection(peerId) {
    // Close data channel
    const channel = this.dataChannels.get(peerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }
    
    // Close peer connection
    const connection = this.peerConnections.get(peerId);
    if (connection) {
      connection.close();
      this.peerConnections.delete(peerId);
    }
  }
  
  /**
   * Send signaling data to peer via libp2p
   * @param {string} peerId Target peer ID
   * @param {Object} data Signaling data
   * @private
   */
  _sendSignalingData(peerId, data) {
    if (!this.libp2pNode || !this.libp2pNode.pubsub) {
      return;
    }
    
    try {
      const message = {
        type: 'signaling',
        peerId: this.peerId,
        targetPeerId: peerId,
        data: data,
        timestamp: Date.now()
      };
      
      this.libp2pNode.pubsub.publish(
        this.config.libp2p.topic,
        new TextEncoder().encode(JSON.stringify(message))
      );
    } catch (error) {
      console.error('Error sending signaling data:', error);
    }
  }
  
  /**
   * Handle WebRTC signaling data
   * @param {Object} message Signaling message
   * @private
   */
  async _handleSignalingMessage(message) {
    if (message.targetPeerId !== this.peerId) {
      return; // Not for us
    }
    
    const peerId = message.peerId;
    const data = message.data;
    
    if (!this.peerConnections.has(peerId)) {
      this._setupWebRTCConnection(peerId);
    }
    
    const connection = this.peerConnections.get(peerId);
    
    try {
      if (data.type === 'offer') {
        await connection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        
        this._sendSignalingData(peerId, {
          type: 'answer',
          sdp: connection.localDescription
        });
      } else if (data.type === 'answer') {
        await connection.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === 'candidate') {
        await connection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }
  
  /**
   * Send a direct message to a peer using WebRTC
   * @param {string} peerId Target peer ID
   * @param {string} type Message type
   * @param {Object} payload Message payload
   * @returns {boolean} Success status
   * @private
   */
  _sendDirectMessage(peerId, type, payload) {
    const channel = this.dataChannels.get(peerId);
    
    if (!channel || channel.readyState !== 'open') {
      // Queue message for later
      this.outgoingMessages.push({
        peerId,
        type,
        payload
      });
      return false;
    }
    
    try {
      const message = {
        type,
        peerId: this.peerId,
        payload,
        timestamp: Date.now()
      };
      
      channel.send(JSON.stringify(message));
      this.peerStats.messagesSent++;
      return true;
    } catch (error) {
      console.error(`Error sending message to ${peerId}:`, error);
      return false;
    }
  }
  
  /**
   * Handle messages received from peers
   * @param {string} peerId Peer ID
   * @param {Object} message Message data
   * @private
   */
  _handleMessageReceived(peerId, message) {
    this.peerStats.messagesReceived++;
    
    // Update peer last seen
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
    
    // Process message based on type
    switch (message.type) {
      case 'content-update':
        this._handleRemoteContentUpdate(message);
        break;
        
      case 'presence':
        this._handlePresenceMessage(message);
        break;
        
      case 'sync-request':
        this._handleSyncRequest(message);
        break;
        
      case 'sync-response':
        this._handleSyncResponse(message);
        break;
        
      case 'signaling':
        this._handleSignalingMessage(message);
        break;
        
      default:
        // Handle unknown message types
        if (this.eventBus) {
          this.eventBus.emit('p2p-message', {
            type: message.type,
            peerId: message.peerId,
            payload: message.payload,
            timestamp: new Date(message.timestamp)
          });
        }
    }
    
    // Add to recent messages
    this._addToRecentMessages({
      type: message.type,
      peerId: message.peerId,
      timestamp: message.timestamp
    });
  }
  
  /**
   * Handle content update event from local UI
   * @param {Object} data Update data
   * @private
   */
  _handleContentUpdate(data) {
    if (!this.connected) {
      return;
    }
    
    // Broadcast content update to all peers
    this.broadcastMessage('content-update', {
      content: data.content,
      action: data.action,
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle content update received from remote peer
   * @param {Object} data Update data
   * @private
   */
  _handleRemoteContentUpdate(data) {
    console.log('Received content update from peer:', data);
    
    // Forward to realtime updates module if available
    if (this.realtimeUpdates) {
      this.realtimeUpdates.processNotification({
        type: `content-${data.payload?.action || 'updated'}`,
        data: data.payload?.content,
        timestamp: data.timestamp
      });
    }
    
    // Notify UI
    if (this.eventBus) {
      this.eventBus.emit('remote-content-updated', {
        peerId: data.peerId,
        content: data.payload?.content,
        action: data.payload?.action,
        timestamp: new Date(data.timestamp).toISOString()
      });
    }
  }
  
  /**
   * Handle sync request from peer
   * @param {Object} data Request data
   * @private
   */
  _handleSyncRequest(data) {
    console.log('Received sync request from peer:', data.peerId);
    
    // Get current content stats
    if (this.realtimeUpdates) {
      // Respond with current state
      this._sendDirectMessage(data.peerId, 'sync-response', {
        requestId: data.payload?.requestId,
        stats: {
          totalEntries: this.realtimeUpdates.totalEntries || 0,
          lastUpdated: this.realtimeUpdates.lastUpdateTime || Date.now()
        }
      });
    }
  }
  
  /**
   * Handle sync response from peer
   * @param {Object} data Response data
   * @private
   */
  _handleSyncResponse(data) {
    console.log('Received sync response from peer:', data);
    
    // Notify about sync response
    if (this.eventBus) {
      this.eventBus.emit('sync-response', {
        peerId: data.peerId,
        stats: data.payload?.stats,
        requestId: data.payload?.requestId,
        timestamp: new Date(data.timestamp).toISOString()
      });
    }
  }
  
  /**
   * Connect to a specific peer
   * @param {string} peerId Peer ID to connect to
   * @returns {Promise<boolean>} Connection success
   */
  async connectToPeer(peerId) {
    if (!this.libp2pNode || !this.connected) {
      return false;
    }
    
    try {
      // Check if already connected
      if (this.peers.has(peerId) && this.peers.get(peerId).connected) {
        return true;
      }
      
      // Try to connect via libp2p
      const peerInfo = await this.libp2pNode.peerRouting.findPeer(peerId);
      await this.libp2pNode.dial(peerInfo.id);
      
      return true;
    } catch (error) {
      console.error(`Failed to connect to peer ${peerId}:`, error);
      return false;
    }
  }
  
  /**
   * Broadcast a message to all connected peers
   * @param {string} type Message type
   * @param {Object} payload Message payload
   * @returns {boolean} Success status
   */
  broadcastMessage(type, payload) {
    if (!this.connected) {
      return false;
    }
    
    try {
      // Broadcast via pubsub
      if (this.libp2pNode && this.libp2pNode.pubsub) {
        const message = {
          type,
          peerId: this.peerId,
          payload,
          timestamp: Date.now()
        };
        
        this.libp2pNode.pubsub.publish(
          this.config.libp2p.topic,
          new TextEncoder().encode(JSON.stringify(message))
        );
        
        this.peerStats.messagesSent++;
      }
      
      // Also send directly to connected peers via WebRTC for reliability
      this.dataChannels.forEach((channel, peerId) => {
        this._sendDirectMessage(peerId, type, payload);
      });
      
      return true;
    } catch (error) {
      console.error('Error broadcasting message:', error);
      return false;
    }
  }
  
  /**
   * Send a direct message to a specific peer
   * @param {string} peerId Target peer ID
   * @param {string} type Message type
   * @param {Object} payload Message payload
   * @returns {boolean} Success status
   */
  sendMessage(peerId, type, payload) {
    if (!this.connected) {
      return false;
    }
    
    // Try WebRTC first
    if (this.dataChannels.has(peerId)) {
      return this._sendDirectMessage(peerId, type, payload);
    }
    
    // Fall back to pubsub
    try {
      if (this.libp2pNode && this.libp2pNode.pubsub) {
        const message = {
          type,
          peerId: this.peerId,
          targetPeerId: peerId,
          payload,
          timestamp: Date.now()
        };
        
        this.libp2pNode.pubsub.publish(
          this.config.libp2p.topic,
          new TextEncoder().encode(JSON.stringify(message))
        );
        
        this.peerStats.messagesSent++;
        return true;
      }
    } catch (error) {
      console.error(`Error sending message to ${peerId}:`, error);
      return false;
    }
    
    return false;
  }
  
  /**
   * Request sync from connected peers
   * @returns {Promise<void>}
   */
  async requestSync() {
    if (!this.connected) {
      return;
    }
    
    const requestId = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Broadcast sync request
    this.broadcastMessage('sync-request', {
      requestId,
      timestamp: Date.now()
    });
    
    // Return promise that resolves when responses are received
    return new Promise((resolve) => {
      const responses = [];
      const timeout = setTimeout(() => {
        cleanup();
        resolve(responses);
      }, 5000);
      
      const handler = (data) => {
        if (data.requestId === requestId) {
          responses.push(data);
        }
      };
      
      const cleanup = () => {
        clearTimeout(timeout);
        this.eventBus.off('sync-response', handler);
      };
      
      this.eventBus.on('sync-response', handler);
    });
  }
  
  /**
   * Get list of connected peers
   * @returns {Array} Array of peer objects
   */
  getConnectedPeers() {
    return Array.from(this.peers.values()).filter(peer => peer.connected);
  }
  
  /**
   * Add message to recent messages list
   * @param {Object} message Message
   * @private
   */
  _addToRecentMessages(message) {
    this.recentMessages.unshift(message);
    
    // Limit size of recent messages
    if (this.recentMessages.length > 100) {
      this.recentMessages.pop();
    }
  }
  
  /**
   * Get recent messages
   * @param {number} limit Maximum number of messages to return
   * @returns {Array} Recent messages
   */
  getRecentMessages(limit = 10) {
    return this.recentMessages.slice(0, limit);
  }
  
  /**
   * Get peer stats
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.peerStats,
      peerId: this.peerId,
      connectedPeers: this.getConnectedPeers().length,
      knownPeers: this.peers.size,
      dataChannels: this.dataChannels.size,
      messagesSent: this.peerStats.messagesSent,
      messagesReceived: this.peerStats.messagesReceived,
      timestamp: Date.now()
    };
  }
  
  /**
   * Clean up and destroy the P2P communication manager
   */
  destroy() {
    this.disconnect();
    
    // Clean up libp2p node
    if (this.libp2pNode) {
      this.libp2pNode.stop().catch(error => {
        console.error('Error stopping libp2p node:', error);
      });
      this.libp2pNode = null;
    }
    
    // Clear data
    this.peers.clear();
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.outgoingMessages = [];
    this.recentMessages = [];
    
    this.initialized = false;
    
    console.info('P2P communication destroyed');
  }
}

export default RealtimeP2P;