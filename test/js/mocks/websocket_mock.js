/**
 * WebSocket mock for testing real-time collaboration features
 */

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;
    
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.eventListeners = {
      open: [],
      message: [],
      close: [],
      error: []
    };
    
    // Store instance for test access
    MockWebSocket.instances.push(this);
    
    // Auto-connect after a short delay (disabled by default for testing)
    // setTimeout(() => this.mockConnect(), 10);
  }
  
  addEventListener(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }
  
  removeEventListener(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  }
  
  triggerOpen() {
    this.readyState = this.OPEN;
    const event = { target: this };
    
    if (this.onopen) {
      this.onopen(event);
    }
    
    this.eventListeners.open.forEach(callback => {
      callback(event);
    });
  }
  
  triggerClose(event = { code: 1000, reason: "Normal closure" }) {
    this.readyState = this.CLOSED;
    event.target = this;
    
    if (this.onclose) {
      this.onclose(event);
    }
    
    this.eventListeners.close.forEach(callback => {
      callback(event);
    });
  }
  
  triggerMessage(data) {
    const event = { data, target: this };
    
    if (this.onmessage) {
      this.onmessage(event);
    }
    
    this.eventListeners.message.forEach(callback => {
      callback(event);
    });
  }
  
  triggerError(error = "WebSocket error") {
    const event = { error, target: this };
    
    if (this.onerror) {
      this.onerror(event);
    }
    
    this.eventListeners.error.forEach(callback => {
      callback(event);
    });
  }
  
  send(data) {
    if (this.readyState !== this.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sent.push(data);
    return true;
  }
  
  close(code, reason) {
    this.readyState = this.CLOSING;
    setTimeout(() => this.triggerClose({ code, reason }), 10);
  }
}

// Initialize the static instances array
MockWebSocket.instances = [];
MockWebSocket.resetMock = function() {
  MockWebSocket.instances = [];
};

// Create a mock WebSocket server for testing
class MockWebSocketServer {
  constructor() {
    this.connections = [];
  }
  
  createConnection(url) {
    const ws = new MockWebSocket(url);
    this.connections.push(ws);
    return ws;
  }
  
  reset() {
    this.connections = [];
    MockWebSocket.instances = [];
  }
  
  broadcast(data, exclude = null) {
    this.connections.forEach(conn => {
      if (conn !== exclude && conn.readyState === conn.OPEN) {
        conn.triggerMessage(data);
      }
    });
  }
  
  getLastConnection() {
    return this.connections[this.connections.length - 1];
  }
}

// Functions to enable/disable mocks
function enableMocks() {
  if (typeof window !== 'undefined' && window.WebSocket) {
    window._originalWebSocket = window.WebSocket;
    window.WebSocket = MockWebSocket;
  } else if (typeof global !== 'undefined') {
    global.WebSocket = MockWebSocket;
  }
  return new MockWebSocketServer();
}

function disableMocks() {
  if (typeof window !== 'undefined' && window._originalWebSocket) {
    window.WebSocket = window._originalWebSocket;
    delete window._originalWebSocket;
  } else if (typeof global !== 'undefined') {
    delete global.WebSocket;
  }
}

// Export as ES module
export default MockWebSocket;
export {
  MockWebSocket,
  MockWebSocketServer,
  enableMocks,
  disableMocks
};