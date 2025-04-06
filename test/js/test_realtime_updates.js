/**
 * WebSocket Server for Real-Time Updates Testing
 * 
 * This file implements a WebSocket server that simulates real-time updates
 * for the PyArrow Content Index. It's used for testing the real-time update
 * functionality in the dashboard.
 */

const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PyArrow Content Index WebSocket Server');
});

// Create WebSocket server instance
const wss = new WebSocket.Server({ server });

// Track connected clients
const clients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to PyArrow Content Index WebSocket Server',
    timestamp: new Date().toISOString()
  }));
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      // Handle authentication
      if (data.type === 'auth') {
        // In a real implementation, we would validate the token
        const token = data.token;
        let isValid = true;
        
        // Simulate token validation (in real implementation, we'd verify with the auth system)
        if (token === 'invalid') {
          isValid = false;
        }
        
        if (isValid) {
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'Authentication successful',
            principal: { id: 'example-user' },
            timestamp: new Date().toISOString()
          }));
          
          // Associate auth info with this websocket
          ws.isAuthenticated = true;
          ws.principal = { id: 'example-user' };
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'invalid_token',
            message: 'Invalid authentication token',
            timestamp: new Date().toISOString()
          }));
        }
        return;
      }
      
      // Handle heartbeat messages
      if (data.type === 'heartbeat') {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        }));
        return;
      }
      
      // Echo back other messages for testing
      ws.send(JSON.stringify({
        type: 'echo',
        originalMessage: data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'invalid_message',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast a message to all connected clients
function broadcast(message) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

// Simulate content updates periodically
let updateCounter = 0;
const CONTENT_TYPES = ['added', 'updated', 'deleted'];
const generateRandomCid = () => {
  return 'bafyreia' + Math.random().toString(36).substring(2, 15);
};

// Start periodic content update simulation
const startUpdateSimulation = (intervalMs = 5000) => {
  return setInterval(() => {
    if (clients.size === 0) return;
    
    updateCounter++;
    const actionIndex = Math.floor(Math.random() * CONTENT_TYPES.length);
    const action = CONTENT_TYPES[actionIndex];
    const cid = generateRandomCid();
    
    const update = {
      type: `content-${action}`,
      data: {
        id: `update-${updateCounter}`,
        cid: cid,
        path: `/example/${action}/item-${updateCounter}.txt`,
        mimetype: 'text/plain',
        size: Math.floor(Math.random() * 1000000),
        metadata: {
          tags: ['test', action, `update-${updateCounter}`],
          date: new Date().toISOString()
        }
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`Broadcasting ${action} update for ${cid}`);
    broadcast(update);
  }, intervalMs);
};

// Simulate batch updates (sync operations)
const startSyncSimulation = (intervalMs = 30000) => {
  return setInterval(() => {
    if (clients.size === 0) return;
    
    const batchSize = Math.floor(Math.random() * 5) + 1;
    const added = Math.floor(Math.random() * batchSize);
    const updated = Math.floor(Math.random() * batchSize);
    const removed = Math.floor(Math.random() * batchSize);
    
    const syncUpdate = {
      type: 'content-synced',
      data: {
        id: `sync-${Date.now()}`,
        added: added,
        updated: updated,
        removed: removed,
        total: added + updated + removed,
        source: 'ipfs-pinset'
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`Broadcasting sync update: ${added} added, ${updated} updated, ${removed} removed`);
    broadcast(syncUpdate);
  }, intervalMs);
};

// Start the server
const PORT = process.env.PORT || 8765;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  
  // Start update simulations
  const updateInterval = startUpdateSimulation(5000);
  const syncInterval = startSyncSimulation(30000);
  
  // Clean shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down WebSocket server...');
    clearInterval(updateInterval);
    clearInterval(syncInterval);
    
    // Close all WebSocket connections
    for (const client of clients) {
      client.close();
    }
    
    // Close the server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

// Main test function - exports for test runner
function testRealtimeUpdates() {
  return {
    success: true,
    message: 'WebSocket server for real-time updates started',
    serverPort: PORT
  };
}

// Start server if run directly
if (require.main === module) {
  console.log('Starting WebSocket server for real-time updates testing');
} else {
  // Export for use in test runner
  module.exports = testRealtimeUpdates;
}