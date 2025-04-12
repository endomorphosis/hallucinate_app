/**
 * WebRTC mock for testing real-time collaboration features
 */

class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
    
    this.onicecandidate = null;
    this.oniceconnectionstatechange = null;
    this.onsignalingstatechange = null;
    this.onconnectionstatechange = null;
    this.ondatachannel = null;
    
    this.dataChannels = {};
    this.remoteStreams = [];
    this._pendingCandidates = [];
  }
  
  createDataChannel(label, options = {}) {
    const channel = new MockRTCDataChannel(label, options, this);
    this.dataChannels[label] = channel;
    return channel;
  }
  
  async createOffer(options = {}) {
    return {
      type: 'offer',
      sdp: `mock-sdp-offer-${Date.now()}`
    };
  }
  
  async createAnswer(options = {}) {
    return {
      type: 'answer',
      sdp: `mock-sdp-answer-${Date.now()}`
    };
  }
  
  async setLocalDescription(description) {
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    
    if (this.onsignalingstatechange) {
      this.onsignalingstatechange();
    }
    
    // Simulate ICE gathering
    this._mockIceGathering();
    return Promise.resolve();
  }
  
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    
    if (description.type === 'offer') {
      this.signalingState = 'have-remote-offer';
    } else if (description.type === 'answer') {
      this.signalingState = 'stable';
      
      // When answerer applies remote description, simulate connection establishment
      setTimeout(() => this._mockConnectionEstablished(), 20);
    }
    
    if (this.onsignalingstatechange) {
      this.onsignalingstatechange();
    }
    
    return Promise.resolve();
  }
  
  addIceCandidate(candidate) {
    this._pendingCandidates.push(candidate);
    return Promise.resolve();
  }
  
  close() {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.signalingState = 'closed';
    
    // Close all data channels
    Object.values(this.dataChannels).forEach(channel => {
      channel._mockClose();
    });
    
    if (this.onconnectionstatechange) {
      this.onconnectionstatechange();
    }
    
    if (this.oniceconnectionstatechange) {
      this.oniceconnectionstatechange();
    }
  }
  
  // Mock methods for testing
  _mockIceGathering() {
    this.iceGatheringState = 'gathering';
    
    // Simulate ICE candidate generation
    setTimeout(() => {
      if (this.onicecandidate) {
        this.onicecandidate({
          candidate: {
            candidate: 'mock-ice-candidate',
            sdpMid: 'data',
            sdpMLineIndex: 0
          }
        });
      }
      
      setTimeout(() => {
        this.iceGatheringState = 'complete';
        
        // Signal end of candidates
        if (this.onicecandidate) {
          this.onicecandidate({ candidate: null });
        }
      }, 30);
    }, 10);
  }
  
  _mockConnectionEstablished() {
    this.iceConnectionState = 'checking';
    if (this.oniceconnectionstatechange) {
      this.oniceconnectionstatechange();
    }
    
    setTimeout(() => {
      this.iceConnectionState = 'connected';
      this.connectionState = 'connected';
      
      if (this.oniceconnectionstatechange) {
        this.oniceconnectionstatechange();
      }
      
      if (this.onconnectionstatechange) {
        this.onconnectionstatechange();
      }
    }, 50);
  }
  
  _mockRemoteDataChannel(label, options = {}) {
    const channel = new MockRTCDataChannel(label, options, this, true);
    
    if (this.ondatachannel) {
      this.ondatachannel({ channel });
    }
    
    return channel;
  }
}

class MockRTCDataChannel {
  constructor(label, options = {}, connection, remote = false) {
    this.label = label;
    this.ordered = options.ordered !== false;
    this.maxRetransmits = options.maxRetransmits;
    this.maxPacketLifeTime = options.maxPacketLifeTime;
    this.negotiated = options.negotiated || false;
    this.id = options.id || Math.floor(Math.random() * 65535);
    this.protocol = options.protocol || '';
    
    this.readyState = 'connecting';
    this.bufferedAmount = 0;
    this.bufferedAmountLowThreshold = 0;
    
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    this.onbufferedamountlow = null;
    
    this._connection = connection;
    this._messages = [];
    
    // If this is a remote channel, it starts in connecting state
    // Otherwise, we need to wait for the connection to be established
    if (remote) {
      setTimeout(() => this._mockOpen(), 10);
    } else {
      // Listen for connection state changes
      const checkConnection = () => {
        if (this._connection.iceConnectionState === 'connected') {
          setTimeout(() => this._mockOpen(), 10);
          this._connection.oniceconnectionstatechange = this._connection.oniceconnectionstatechange;
        }
      };
      
      const originalHandler = this._connection.oniceconnectionstatechange;
      this._connection.oniceconnectionstatechange = () => {
        if (originalHandler) originalHandler();
        checkConnection();
      };
      
      checkConnection();
    }
  }
  
  send(data) {
    if (this.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }
    
    this._messages.push(data);
    
    // Simulate sending to remote peer
    const remotePeerChannel = this._findRemotePeerChannel();
    if (remotePeerChannel) {
      setTimeout(() => {
        remotePeerChannel._mockReceive(data);
      }, 5);
    }
    
    return true;
  }
  
  close() {
    if (this.readyState === 'closing' || this.readyState === 'closed') {
      return;
    }
    
    this.readyState = 'closing';
    setTimeout(() => this._mockClose(), 10);
  }
  
  // Mock methods for testing
  _mockOpen() {
    if (this.readyState !== 'connecting') return;
    
    this.readyState = 'open';
    if (this.onopen) {
      this.onopen({ target: this });
    }
  }
  
  _mockClose() {
    if (this.readyState === 'closed') return;
    
    this.readyState = 'closed';
    if (this.onclose) {
      this.onclose({ target: this });
    }
  }
  
  _mockError(error) {
    if (this.onerror) {
      this.onerror({ error, target: this });
    }
  }
  
  _mockReceive(data) {
    if (this.readyState !== 'open') return;
    
    if (this.onmessage) {
      this.onmessage({ data, target: this });
    }
  }
  
  _findRemotePeerChannel() {
    // This is a mock helper to simulate peer-to-peer communication
    // In real application, this would happen through the signaling server
    // and ICE connection
    return null; // Will be set by the test framework when connecting peers
  }
}

// Add connection pair functionality for testing
function createConnectedPeerPair(config = {}) {
  const peer1 = new MockRTCPeerConnection(config);
  const peer2 = new MockRTCPeerConnection(config);
  
  // Methods to connect the peers
  const connectPeers = async () => {
    // Create offer from peer1
    const offer = await peer1.createOffer();
    await peer1.setLocalDescription(offer);
    
    // Set offer as remote description on peer2
    await peer2.setRemoteDescription(peer1.localDescription);
    
    // Create answer from peer2
    const answer = await peer2.createAnswer();
    await peer2.setLocalDescription(answer);
    
    // Set answer as remote description on peer1
    await peer1.setRemoteDescription(peer2.localDescription);
    
    // Simulate exchanging ICE candidates
    peer1._pendingCandidates.forEach(candidate => peer2.addIceCandidate(candidate));
    peer2._pendingCandidates.forEach(candidate => peer1.addIceCandidate(candidate));
    
    // Clear pending candidates
    peer1._pendingCandidates = [];
    peer2._pendingCandidates = [];
    
    return new Promise(resolve => {
      // Wait for both peers to be connected
      const checkConnected = () => {
        if (peer1.iceConnectionState === 'connected' && peer2.iceConnectionState === 'connected') {
          resolve({ peer1, peer2 });
        } else {
          setTimeout(checkConnected, 10);
        }
      };
      
      checkConnected();
    });
  };
  
  // Helper to create data channels that are connected
  const createDataChannelPair = (label, options = {}) => {
    const channel1 = peer1.createDataChannel(label, options);
    
    return new Promise(resolve => {
      peer2.ondatachannel = (event) => {
        const channel2 = event.channel;
        
        // Connect the channels for mock communication
        channel1._findRemotePeerChannel = () => channel2;
        channel2._findRemotePeerChannel = () => channel1;
        
        // Wait for both channels to be open
        const checkOpen = () => {
          if (channel1.readyState === 'open' && channel2.readyState === 'open') {
            resolve({ 
              initiator: channel1, 
              receiver: channel2 
            });
          } else {
            setTimeout(checkOpen, 10);
          }
        };
        
        checkOpen();
      };
    });
  };
  
  return {
    peer1,
    peer2,
    connectPeers,
    createDataChannelPair
  };
}

// Create global RTCPeerConnection mock
let mockRTCInstances = [];

// Create a mock implementation of the RTCPeerConnection
function enableMocks() {
  mockRTCInstances = [];
  
  if (typeof window !== 'undefined') {
    if (window.RTCPeerConnection) {
      window._originalRTCPeerConnection = window.RTCPeerConnection;
    }
    
    window.RTCPeerConnection = class extends MockRTCPeerConnection {
      constructor(config) {
        super(config);
        mockRTCInstances.push(this);
      }
    };
    
    return window.RTCPeerConnection;
  } else if (typeof global !== 'undefined') {
    global.RTCPeerConnection = class extends MockRTCPeerConnection {
      constructor(config) {
        super(config);
        mockRTCInstances.push(this);
      }
    };
    
    return global.RTCPeerConnection;
  }
  
  return MockRTCPeerConnection;
}

function disableMocks() {
  if (typeof window !== 'undefined' && window._originalRTCPeerConnection) {
    window.RTCPeerConnection = window._originalRTCPeerConnection;
    delete window._originalRTCPeerConnection;
  } else if (typeof global !== 'undefined') {
    delete global.RTCPeerConnection;
  }
  
  mockRTCInstances = [];
}

module.exports = {
  MockRTCPeerConnection,
  MockRTCDataChannel,
  createConnectedPeerPair,
  mockRTCInstances,
  enableMocks,
  disableMocks
};