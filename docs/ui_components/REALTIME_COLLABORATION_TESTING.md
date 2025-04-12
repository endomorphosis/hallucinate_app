# Real-time Collaboration Feature Testing Guide

This document describes the testing infrastructure and approach for the real-time collaboration features implemented in the PyArrow Content Index Dashboard.

## Test Architecture

The real-time collaboration test suite consists of four main components:

1. **Mock Infrastructure**: Mock implementations of WebSocket, WebRTC, and libp2p for isolated testing
2. **Feature-specific Tests**: Tests focusing on specific collaboration features
3. **Security Integration Tests**: Tests for the security aspects of real-time collaboration
4. **Dashboard Integration Tests**: Tests for the integration with the PyArrow Content Index Dashboard

### Mock Infrastructure

The test suite includes comprehensive mocks for all network communication methods:

- **WebSocket Mock**: Simulates WebSocket connections with methods for mocking events
- **WebRTC Mock**: Provides mock RTCPeerConnection and RTCDataChannel implementations
- **libp2p Mock**: Creates a virtual libp2p network for testing distributed communications

These mocks allow tests to run without actual network connections while still verifying the correct behavior of the collaborative features.

## Test Coverage Areas

### 1. Basic Communication Features

Tests verify the basic functionality of all three communication channels:

- WebSocket connection establishment and messaging
- WebRTC peer connection and data channel communication
- libp2p node discovery and pubsub messaging

### 2. Fallback Mechanisms

Tests for robustness when primary communication channels fail:

- Automatic fallback from WebRTC to WebSocket
- Fallback from libp2p to WebRTC
- Communication resumption when connections are restored

### 3. Security Integration

Comprehensive tests for the security aspects:

- UCAN capability verification for peer connections
- Secure messaging with token validation
- Authorization for different operations
- Integration with the keystore for encryption keys
- Secure WebRTC and libp2p connections

### 4. Dashboard Integration

Tests for the integration with the PyArrow Content Index Dashboard:

- Synchronization of content additions, updates, and removals
- Real-time notifications of peer activities
- UI feedback for connection status
- Handling of concurrent modifications

## Running the Tests

You can run the full test suite with:

```bash
npm run test:js
```

To run specific test files:

```bash
# Run basic collaboration tests
npx mocha test/js/test_realtime_collaboration.js

# Run security integration tests
npx mocha test/js/test_realtime_security_integration.js

# Run dashboard integration tests
npx mocha test/js/test_pyarrow_index_realtime.js
```

## Test Mocks

### WebSocket Mock

Located in `test/js/mocks/websocket_mock.js`, this mock provides:

- Connection lifecycle simulation (connect, send, receive, disconnect)
- Message tracking for verification
- Server-side simulation for broadcasting

Example usage:

```javascript
const { enableMocks, disableMocks, MockWebSocketServer } = require('./mocks/websocket_mock');

// Enable mocks and get server reference
const mockServer = enableMocks();

// Test code that creates WebSocket connections
// ...

// Simulate receiving a message from server
mockServer.getLastConnection().mockReceive(JSON.stringify({ type: 'update', data: {...} }));

// Verify connection was established and data was sent
assert.strictEqual(mockServer.connections.length, 1, 'Should create one connection');
assert.ok(mockServer.connections[0].sent.length > 0, 'Should send data');

// Clean up
disableMocks();
```

### WebRTC Mock

Located in `test/js/mocks/webrtc_mock.js`, this mock provides:

- RTCPeerConnection with all standard methods
- RTCDataChannel implementation
- Helper for creating connected peer pairs
- Connection state simulation

Example usage:

```javascript
const { enableMocks, disableMocks, createConnectedPeerPair } = require('./mocks/webrtc_mock');

// Enable mocks
enableMocks();

// Create a pair of connected peer connections
const { peer1, peer2, connectPeers, createDataChannelPair } = createConnectedPeerPair();

// Connect the peers
await connectPeers();

// Create a data channel pair
const { initiator, receiver } = await createDataChannelPair('test-channel');

// Send a message
initiator.send('Hello from initiator');

// Verify message received
assert.strictEqual(receiver.messages.length, 1, 'Should receive message');
assert.strictEqual(receiver.messages[0], 'Hello from initiator', 'Should receive correct message');

// Clean up
disableMocks();
```

### libp2p Mock

Located in `test/js/mocks/libp2p_mock.js`, this mock provides:

- Mock libp2p node with pubsub, content routing, and peer routing
- Virtual network for simulating peer discovery and message distribution
- Event emitter for simulating libp2p events

Example usage:

```javascript
const { enableMocks, getNetwork } = require('./mocks/libp2p_mock');

// Enable mocks and get mock libp2p factory
const libp2p = enableMocks();

// Create nodes
const node1 = await libp2p.createLibp2p({ peerId: 'peer-1' });
const node2 = await libp2p.createLibp2p({ peerId: 'peer-2' });

// Start nodes
await node1.start();
await node2.start();

// Subscribe to a topic
await node1.pubsub.subscribe('test-topic', (message) => {
  receivedMessages.push(message);
});

// Publish a message
await node2.pubsub.publish('test-topic', new TextEncoder().encode('Hello from peer-2'));

// Wait for message propagation
await new Promise(resolve => setTimeout(resolve, 50));

// Verify message received
assert.strictEqual(receivedMessages.length, 1, 'Should receive message');
assert.strictEqual(new TextDecoder().decode(receivedMessages[0].data), 'Hello from peer-2', 'Should receive correct message');
```

## Dashboard Test Mock

The `MockPyArrowContentIndexDashboard` class provides a complete mock implementation of the PyArrow Content Index Dashboard for testing real-time collaboration integration. It includes:

- Content management methods (add, update, remove)
- Filtering, sorting, and pagination
- Event emission for all user actions
- Statistics calculation
- UI interaction methods

This mock allows testing the real-time collaboration features without a real UI.

## Test Strategies

### 1. Isolated Component Testing

Each communication technology is tested in isolation to verify its behavior:

- WebSocket communication tests
- WebRTC peer-to-peer tests
- libp2p distributed network tests

### 2. Integration Testing

Tests for the integration between components:

- WebSocket and WebRTC fallback mechanisms
- Combined communication approach
- Security integration with all communication methods

### 3. End-to-End Testing

Complete workflow tests using the dashboard mock:

- Content synchronization across peers
- Real-time updates for all dashboard operations
- Peer awareness and notifications
- Concurrent operation handling

## Continuous Integration

Tests are integrated into the CI pipeline to ensure compatibility:

1. All tests run on every pull request
2. Performance benchmarks run on scheduled intervals
3. Network behavior is simulated with different latency and packet loss profiles

## Extending the Tests

To add new tests for real-time collaboration features:

1. Add test cases to the appropriate test file based on the feature area
2. Use the existing mocks to simulate network communication
3. Create specific test scenarios that verify the feature behavior
4. Include both success cases and error/edge cases

For new communication technologies, create a new mock implementation in the `test/js/mocks` directory following the pattern of existing mocks.

## Troubleshooting

Common issues and solutions:

- **Test timeouts**: Increase the timeout in the test configuration if your tests involve complex network simulations
- **Mock initialization failures**: Ensure that mock cleanup happens in the `afterEach` block of each test suite
- **Inconsistent test results**: Check for event handler leaks - make sure all handlers are properly removed after tests
- **Event listener errors**: Verify that event listeners are properly attached and removed in the correct order