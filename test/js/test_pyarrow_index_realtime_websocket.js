/**
 * Test PyArrow Content Index Real-Time Updates WebSocket Integration
 * 
 * Tests the WebSocket-based real-time updates for the PyArrow Content Index Dashboard.
 * Focuses on testing the WebSocket notifications for content changes (add, update, delete).
 */

// Import WebSocket mock
import { MockWebSocket } from './mocks/websocket_mock.js';

// Mock document and window for tests
global.document = {
  getElementById: jest.fn(),
  createElement: jest.fn(),
  body: {
    appendChild: jest.fn()
  },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn()
};

global.WebSocket = MockWebSocket;

// Import the real-time updates module (adjust path if needed)
import RealtimeUpdates from '../hallucinate_app/node/dashboard/realtime_updates/realtime_updates.js';

describe('PyArrow Content Index Real-Time WebSocket Updates', () => {
  let realtimeUpdates;
  let mockEventBus;
  let mockElectronAPI;
  
  beforeEach(() => {
    // Reset WebSocket mock instances
    MockWebSocket.resetMock();
    
    // Mock DOM elements
    document.getElementById.mockImplementation((id) => {
      if (id === 'realtime-status') {
        return { className: 'status-indicator disconnected' };
      }
      if (id === 'realtime-status-text') {
        return { textContent: 'Disconnected' };
      }
      if (id === 'realtime-counters') {
        return { style: { display: 'none' }, innerHTML: '' };
      }
      if (id === 'notification-container') {
        return { appendChild: jest.fn() };
      }
      return null;
    });
    
    document.querySelector.mockImplementation((selector) => {
      if (selector.includes('data-cid')) {
        return { classList: { add: jest.fn(), remove: jest.fn() } };
      }
      return null;
    });
    
    document.querySelectorAll.mockImplementation((selector) => {
      const mockElement = { 
        classList: { 
          add: jest.fn(), 
          remove: jest.fn(), 
          contains: jest.fn().mockReturnValue(false) 
        },
        getAttribute: jest.fn().mockReturnValue('QmTest123')
      };
      return [mockElement, mockElement];
    });
    
    document.createElement.mockImplementation(() => ({
      className: '',
      style: {},
      innerHTML: '',
      appendChild: jest.fn(),
      addEventListener: jest.fn()
    }));
    
    // Create mock event bus
    mockEventBus = {
      on: jest.fn(),
      emit: jest.fn()
    };
    
    // Create mock Electron API
    mockElectronAPI = {
      invoke: jest.fn()
    };
    
    // Create real-time updates instance
    realtimeUpdates = new RealtimeUpdates({
      electronAPI: mockElectronAPI,
      eventBus: mockEventBus,
      wsEndpoint: 'ws://localhost:8765/pyarrow-content-index/ws'
    });
  });
  
  test('should initialize and connect to WebSocket server', async () => {
    // Initialize
    const initResult = await realtimeUpdates.init();
    expect(initResult).toBe(true);
    
    // Should have registered event listeners
    expect(mockEventBus.on).toHaveBeenCalledWith('realtime-updates-toggle', expect.any(Function));
    expect(mockEventBus.on).toHaveBeenCalledWith('notifications-toggle', expect.any(Function));
    expect(mockEventBus.on).toHaveBeenCalledWith('visual-indicators-toggle', expect.any(Function));
    expect(mockEventBus.on).toHaveBeenCalledWith('background-refresh-toggle', expect.any(Function));
    
    // Test connect
    const connectPromise = realtimeUpdates.connect();
    
    // Get the WebSocket instance
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws.url).toBe('ws://localhost:8765/pyarrow-content-index/ws');
    
    // Trigger open event
    ws.triggerOpen();
    
    // Connect should resolve
    await connectPromise;
    
    // Should be connected
    expect(realtimeUpdates.connected).toBe(true);
    
    // Should have emitted event
    expect(mockEventBus.emit).toHaveBeenCalledWith('websocket-connected', expect.objectContaining({
      endpoint: 'ws://localhost:8765/pyarrow-content-index/ws'
    }));
  });
  
  test('should process content-added notification', async () => {
    // Initialize and connect
    await realtimeUpdates.init();
    await realtimeUpdates.connect();
    
    // Get the WebSocket instance
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Create mock notification
    const notification = {
      type: 'content-added',
      data: {
        cid: 'QmTest123',
        path: '/test/path/file.txt',
        mimetype: 'text/plain',
        size: 1024,
        timestamp: new Date().toISOString()
      }
    };
    
    // Send notification
    ws.triggerMessage(JSON.stringify(notification));
    
    // Should have added to changed items
    expect(realtimeUpdates.changedItems.size).toBe(1);
    expect(realtimeUpdates.changedItems.get('QmTest123')).toBeDefined();
    expect(realtimeUpdates.changedItems.get('QmTest123').action).toBe('added');
    
    // Should have emitted event
    expect(mockEventBus.emit).toHaveBeenCalledWith('content-updated', expect.objectContaining({
      content: notification.data,
      action: 'added'
    }));
  });
  
  test('should process content-updated notification', async () => {
    // Initialize and connect
    await realtimeUpdates.init();
    await realtimeUpdates.connect();
    
    // Get the WebSocket instance
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Create mock notification
    const notification = {
      type: 'content-updated',
      data: {
        cid: 'QmTest123',
        updates: {
          path: '/test/updated/path/file.txt',
          size: 2048
        },
        timestamp: new Date().toISOString()
      }
    };
    
    // Send notification
    ws.triggerMessage(JSON.stringify(notification));
    
    // Should have added to changed items
    expect(realtimeUpdates.changedItems.size).toBe(1);
    expect(realtimeUpdates.changedItems.get('QmTest123')).toBeDefined();
    expect(realtimeUpdates.changedItems.get('QmTest123').action).toBe('updated');
    
    // Should have emitted event
    expect(mockEventBus.emit).toHaveBeenCalledWith('content-updated', expect.objectContaining({
      content: notification.data,
      action: 'updated'
    }));
  });
  
  test('should process content-deleted notification', async () => {
    // Initialize and connect
    await realtimeUpdates.init();
    await realtimeUpdates.connect();
    
    // Get the WebSocket instance
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Create mock notification
    const notification = {
      type: 'content-deleted',
      data: {
        cid: 'QmTest123',
        path: '/test/path/file.txt',
        timestamp: new Date().toISOString()
      }
    };
    
    // Send notification
    ws.triggerMessage(JSON.stringify(notification));
    
    // Should have added to changed items
    expect(realtimeUpdates.changedItems.size).toBe(1);
    expect(realtimeUpdates.changedItems.get('QmTest123')).toBeDefined();
    expect(realtimeUpdates.changedItems.get('QmTest123').action).toBe('deleted');
    
    // Should have emitted event
    expect(mockEventBus.emit).toHaveBeenCalledWith('content-updated', expect.objectContaining({
      content: notification.data,
      action: 'deleted'
    }));
  });
  
  test('should process content-synced notification', async () => {
    // Initialize and connect
    await realtimeUpdates.init();
    await realtimeUpdates.connect();
    
    // Get the WebSocket instance
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Create mock notification
    const notification = {
      type: 'content-synced',
      data: {
        added: 10,
        updated: 5,
        removed: 2,
        timestamp: new Date().toISOString()
      }
    };
    
    // Send notification
    ws.triggerMessage(JSON.stringify(notification));
    
    // Should have emitted event
    expect(mockEventBus.emit).toHaveBeenCalledWith('content-synced', notification.data);
  });
  
  test('should handle WebSocket disconnection', async () => {
    // Initialize and connect
    await realtimeUpdates.init();
    await realtimeUpdates.connect();
    
    // Get the WebSocket instance
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Should be connected
    expect(realtimeUpdates.connected).toBe(true);
    
    // Trigger close event
    ws.triggerClose({ code: 1001, reason: 'Server going away' });
    
    // Should no longer be connected
    expect(realtimeUpdates.connected).toBe(false);
    
    // Should have emitted event
    expect(mockEventBus.emit).toHaveBeenCalledWith('websocket-closed', expect.objectContaining({
      code: 1001,
      reason: 'Server going away'
    }));
    
    // Should be trying to reconnect
    expect(realtimeUpdates.pendingReconnect).toBe(true);
  });
  
  test('should clear visual indicators', async () => {
    // Initialize
    await realtimeUpdates.init();
    
    // Add some items to changed items
    realtimeUpdates.changedItems.set('QmTest1', {
      action: 'added',
      content: { cid: 'QmTest1' },
      timestamp: Date.now()
    });
    
    realtimeUpdates.changedItems.set('QmTest2', {
      action: 'updated',
      content: { cid: 'QmTest2' },
      timestamp: Date.now()
    });
    
    // Clear indicators
    realtimeUpdates.clearVisualIndicators();
    
    // Changed items should be empty
    expect(realtimeUpdates.changedItems.size).toBe(0);
    
    // Should have updated DOM elements
    expect(document.querySelectorAll).toHaveBeenCalled();
    
    // Get mock elements returned by querySelectorAll
    const elements = document.querySelectorAll();
    
    // Each element should have had classList.remove called
    elements.forEach(el => {
      expect(el.classList.remove).toHaveBeenCalledWith(
        'content-added', 'content-updated', 'content-deleted', 'animate-change'
      );
    });
  });
  
  test('should toggle notifications', async () => {
    // Initialize
    await realtimeUpdates.init();
    
    // Default should be enabled
    expect(realtimeUpdates.notificationsEnabled).toBe(true);
    
    // Disable notifications
    realtimeUpdates.notificationsEnabled = false;
    
    // Should be disabled
    expect(realtimeUpdates.notificationsEnabled).toBe(false);
    
    // Mock showNotification
    const originalShowNotification = realtimeUpdates.showNotification;
    realtimeUpdates.showNotification = jest.fn();
    
    // Connect
    await realtimeUpdates.connect();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Send a notification
    ws.triggerMessage(JSON.stringify({
      type: 'system',
      message: 'Test notification'
    }));
    
    // Shouldn't have called showNotification
    expect(realtimeUpdates.showNotification).not.toHaveBeenCalled();
    
    // Enable notifications
    realtimeUpdates.notificationsEnabled = true;
    
    // Send another notification
    ws.triggerMessage(JSON.stringify({
      type: 'system',
      message: 'Another test notification'
    }));
    
    // Should have called showNotification
    expect(realtimeUpdates.showNotification).toHaveBeenCalled();
    
    // Restore original method
    realtimeUpdates.showNotification = originalShowNotification;
  });
  
  test('should toggle visual indicators', async () => {
    // Initialize
    await realtimeUpdates.init();
    
    // Default should be enabled
    expect(realtimeUpdates.visualIndicatorsEnabled).toBe(true);
    
    // Add item to changed items
    realtimeUpdates.changedItems.set('QmTest1', {
      action: 'added',
      content: { cid: 'QmTest1' },
      timestamp: Date.now()
    });
    
    // Mock updateVisualIndicators
    const originalUpdateVisualIndicators = realtimeUpdates.updateVisualIndicators;
    realtimeUpdates.updateVisualIndicators = jest.fn();
    
    // Mock clearVisualIndicators
    const originalClearVisualIndicators = realtimeUpdates.clearVisualIndicators;
    realtimeUpdates.clearVisualIndicators = jest.fn();
    
    // Disable visual indicators
    realtimeUpdates.visualIndicatorsEnabled = false;
    
    // Should be disabled
    expect(realtimeUpdates.visualIndicatorsEnabled).toBe(false);
    
    // Should have called clearVisualIndicators
    expect(realtimeUpdates.clearVisualIndicators).not.toHaveBeenCalled();
    
    // Connect
    await realtimeUpdates.connect();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    
    // Send a notification
    ws.triggerMessage(JSON.stringify({
      type: 'content-added',
      data: {
        cid: 'QmTest123',
        path: '/test/path/file.txt',
        mimetype: 'text/plain',
        size: 1024,
        timestamp: new Date().toISOString()
      }
    }));
    
    // Shouldn't have called updateVisualIndicators
    expect(realtimeUpdates.updateVisualIndicators).not.toHaveBeenCalled();
    
    // Enable visual indicators
    realtimeUpdates.visualIndicatorsEnabled = true;
    
    // Should be enabled
    expect(realtimeUpdates.visualIndicatorsEnabled).toBe(true);
    
    // Send another notification
    ws.triggerMessage(JSON.stringify({
      type: 'content-updated',
      data: {
        cid: 'QmTest123',
        updates: {
          path: '/test/updated/path/file.txt',
          size: 2048
        },
        timestamp: new Date().toISOString()
      }
    }));
    
    // Should have called updateVisualIndicators
    expect(realtimeUpdates.updateVisualIndicators).toHaveBeenCalled();
    
    // Restore original methods
    realtimeUpdates.updateVisualIndicators = originalUpdateVisualIndicators;
    realtimeUpdates.clearVisualIndicators = originalClearVisualIndicators;
  });
  
  test('should toggle background refresh', async () => {
    // Initialize
    await realtimeUpdates.init();
    
    // Mock startBackgroundRefresh
    const originalStartBackgroundRefresh = realtimeUpdates.startBackgroundRefresh;
    realtimeUpdates.startBackgroundRefresh = jest.fn();
    
    // Mock stopBackgroundRefresh
    const originalStopBackgroundRefresh = realtimeUpdates.stopBackgroundRefresh;
    realtimeUpdates.stopBackgroundRefresh = jest.fn();
    
    // Default should be enabled
    expect(realtimeUpdates.backgroundRefreshEnabled).toBe(true);
    
    // Disable background refresh
    realtimeUpdates.backgroundRefreshEnabled = false;
    
    // Should be disabled
    expect(realtimeUpdates.backgroundRefreshEnabled).toBe(false);
    
    // Should have called stopBackgroundRefresh
    expect(realtimeUpdates.stopBackgroundRefresh).toHaveBeenCalled();
    
    // Enable background refresh
    realtimeUpdates.backgroundRefreshEnabled = true;
    
    // Should be enabled
    expect(realtimeUpdates.backgroundRefreshEnabled).toBe(true);
    
    // Should have called startBackgroundRefresh
    expect(realtimeUpdates.startBackgroundRefresh).toHaveBeenCalled();
    
    // Restore original methods
    realtimeUpdates.startBackgroundRefresh = originalStartBackgroundRefresh;
    realtimeUpdates.stopBackgroundRefresh = originalStopBackgroundRefresh;
  });
});