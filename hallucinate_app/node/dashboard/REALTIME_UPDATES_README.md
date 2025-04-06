# Real-Time Updates for PyArrow Content Index Dashboard

This module provides WebSocket-based real-time updates for the PyArrow Content Index Dashboard. It enables notifications, visual indicators for changing items, and background refresh functionality.

## Features

- **WebSocket Connection**: Establishes a secure connection to receive real-time updates
- **Visual Indicators**: Highlights changed content in tables with color-coded borders
- **Notifications**: Shows non-intrusive notifications for content changes
- **Background Refresh**: Automatically refreshes data at configurable intervals
- **Activity Log**: Maintains a history of recent changes and activities
- **Configurable Settings**: User-controllable options for all features
- **Connection Status**: Clear status indicators for connection health
- **Graceful Degradation**: Falls back to polling when WebSocket is unavailable
- **Reconnection Logic**: Automatically reconnects when connection is lost

## Installation

### Basic Integration

1. Import the loader module at the top of your script:

```javascript
import loadRealtimeUpdates from './dashboard/load_realtime_updates.js';
```

2. Initialize the real-time updates after your dashboard is set up:

```javascript
// Initialize your dashboard first
const dashboard = new PyArrowContentIndexDashboard({
  container: document.getElementById('dashboard-container')
});

// Then load real-time updates
loadRealtimeUpdates({
  dashboardSelector: '#dashboard-container',
  wsEndpoint: 'ws://localhost:8765/pyarrow-content-index/ws'
});
```

### Alternative: HTML Integration

You can also load the real-time updates directly from HTML:

```html
<script type="module" 
  src="./dashboard/load_realtime_updates.js"
  data-auto-init
  data-ws-endpoint="ws://localhost:8765/pyarrow-content-index/ws"
  data-dashboard-selector="#dashboard-container">
</script>
```

## Configuration Options

The `loadRealtimeUpdates` function accepts the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dashboardSelector` | string | '.pyarrow-content-index-dashboard' | CSS selector for the dashboard container |
| `electronAPI` | object | window.electronAPI | Electron API for IPC communication |
| `eventBus` | object | (auto-created) | Event bus for dashboard communication |
| `wsEndpoint` | string | 'ws://localhost:8765/pyarrow-content-index/ws' | WebSocket endpoint URL |
| `autoConnect` | boolean | true | Automatically connect to WebSocket |
| `enableNotifications` | boolean | true | Show notifications for content changes |
| `enableVisualIndicators` | boolean | true | Display visual indicators in tables |
| `enableBackgroundRefresh` | boolean | true | Refresh data in the background |
| `backgroundRefreshInterval` | number | 60000 | Refresh interval in milliseconds |
| `exposeGlobally` | boolean | false | Expose instance to window.realtimeUpdates |

## WebSocket Server Requirements

The WebSocket server should send notifications in the following format:

```json
{
  "type": "content-added",
  "data": {
    "cid": "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx",
    "path": "/models/stable-diffusion/v1.5/model.ckpt",
    "mimetype": "application/octet-stream",
    "size": 4229191690,
    "timestamp": "2023-10-15T12:34:56.789Z"
  }
}
```

Supported notification types:
- `content-added`: New content added to the index
- `content-updated`: Existing content updated in the index
- `content-deleted`: Content removed from the index
- `content-synced`: Multiple content changes (includes added/updated/removed counts)
- `system`: System-level messages (e.g., configuration changes)

## Visual Indicators

The real-time updates module adds visual indicators to table rows when content changes:

- **Green Left Border**: Content added (`.content-added` class)
- **Blue Left Border**: Content updated (`.content-updated` class)
- **Red Left Border**: Content deleted (`.content-deleted` class)

Additionally, an animation effect is applied to newly changed items (`.animate-change` class).

## User Interface

The module adds:

1. **Status Indicator**: Shows connection status in the dashboard header
2. **Real-Time Tab**: Adds a new tab with detailed controls when possible
3. **Mini Control Panel**: Adds a compact control panel when tab layout is unavailable
4. **Notification Panel**: Shows toast notifications for content changes

## Events

The module integrates with the dashboard's event bus and emits the following events:

| Event | Data | Description |
|-------|------|-------------|
| `websocket-connected` | `{ endpoint, timestamp }` | WebSocket connection established |
| `websocket-closed` | `{ code, reason, timestamp }` | WebSocket connection closed |
| `websocket-error` | `{ error, timestamp }` | WebSocket error occurred |
| `content-updated` | `{ content, action, timestamp }` | Content was changed |
| `content-synced` | `{ added, updated, removed, timestamp }` | Multiple content changes occurred |
| `system-notification` | `{ message, timestamp }` | System notification received |
| `background-refresh` | `{ timestamp, fullRefresh, changedItems }` | Background refresh occurred |
| `manual-refresh` | `{ timestamp, fullRefresh }` | Manual refresh triggered |

## Python Server Implementation

To implement a compatible WebSocket server in Python, you can use the `websockets` package:

```python
import asyncio
import json
import websockets

# Store connected clients
connected_clients = set()

async def notify_clients(notification):
    """Send notification to all connected clients"""
    if not connected_clients:
        return
        
    # Convert notification to JSON string
    message = json.dumps(notification)
    
    # Send to all connected clients
    for client in connected_clients:
        try:
            await client.send(message)
        except websockets.ConnectionClosed:
            # Client disconnected, it will be removed on next connection handling
            pass

async def handle_connection(websocket, path):
    """Handle WebSocket connection"""
    # Add client to set of connected clients
    connected_clients.add(websocket)
    print(f"Client connected, total clients: {len(connected_clients)}")
    
    try:
        # Send initial system notification
        await websocket.send(json.dumps({
            "type": "system",
            "message": "Connected to PyArrow Content Index WebSocket",
            "timestamp": datetime.datetime.now().isoformat()
        }))
        
        # Wait for messages from client (primarily heartbeats)
        async for message in websocket:
            try:
                data = json.loads(message)
                
                # Handle heartbeat messages
                if data.get("type") == "heartbeat":
                    await websocket.send(json.dumps({
                        "type": "heartbeat",
                        "timestamp": datetime.datetime.now().isoformat()
                    }))
            except json.JSONDecodeError:
                print(f"Received invalid JSON: {message}")
                
    except websockets.ConnectionClosed:
        print("Connection closed")
    finally:
        # Remove client from set of connected clients
        connected_clients.remove(websocket)
        print(f"Client disconnected, total clients: {len(connected_clients)}")

# Example notification when content is added
async def notify_content_added(cid, path, mimetype, size):
    """Notify clients that content was added"""
    await notify_clients({
        "type": "content-added",
        "data": {
            "cid": cid,
            "path": path,
            "mimetype": mimetype,
            "size": size,
            "timestamp": datetime.datetime.now().isoformat()
        }
    })

# Start the WebSocket server
async def start_server():
    """Start the WebSocket server"""
    server = await websockets.serve(
        handle_connection, 
        "localhost", 
        8765, 
        path="/pyarrow-content-index/ws"
    )
    print("WebSocket server started")
    return server

# Run the server
asyncio.run(start_server())
```

## Troubleshooting

### Connection Issues
- Verify the WebSocket server is running
- Check the WebSocket URL in the configuration
- Ensure there are no network restrictions blocking WebSocket connections
- Look for CORS errors in the browser console

### Missing Visual Indicators
- Ensure rows have the `data-cid` attribute set
- Verify visual indicators are enabled in settings
- Check if changes are being processed by the real-time updates module

### Notifications Not Appearing
- Confirm notifications are enabled in settings
- Check if notifications are allowed in the browser
- Verify the WebSocket server is sending correctly formatted messages

## Advanced Usage

### Programmatic Control

You can access the real-time updates instance to control it programmatically:

```javascript
const result = await loadRealtimeUpdates({
  dashboardSelector: '#dashboard-container',
  exposeGlobally: true
});

if (result.success) {
  const realtimeUpdates = result.realtimeUpdates;
  
  // Connect/disconnect
  await realtimeUpdates.connect();
  realtimeUpdates.disconnect();
  
  // Control features
  realtimeUpdates.notificationsEnabled = false;
  realtimeUpdates.visualIndicatorsEnabled = false;
  realtimeUpdates.backgroundRefreshEnabled = false;
  
  // Clear visual indicators
  realtimeUpdates.clearVisualIndicators();
  
  // Show a test notification
  realtimeUpdates.showNotification({
    type: 'system',
    message: 'This is a test notification'
  });
}
```

### Custom Event Bus Integration

If you have an existing event bus, you can integrate with it:

```javascript
import loadRealtimeUpdates from './dashboard/load_realtime_updates.js';

const myEventBus = {
  on: (event, callback) => { /* Your implementation */ },
  off: (event, callback) => { /* Your implementation */ },
  emit: (event, data) => { /* Your implementation */ }
};

loadRealtimeUpdates({
  dashboardSelector: '#dashboard-container',
  eventBus: myEventBus
});

// Listen for real-time events
myEventBus.on('content-updated', (data) => {
  console.log('Content updated:', data);
});
```

## Styling Customization

You can customize the appearance of the real-time updates UI by overriding the CSS classes. The module injects styles with the ID `realtime-updates-styles`. Here are some common customizations:

```css
/* Custom indicator colors */
tr.content-added {
  background-color: rgba(0, 255, 0, 0.1) !important;
  border-left: 4px solid #00ff00 !important;
}

/* Notification styling */
.notification {
  background-color: #f8f8f8;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Status indicator size */
.status-indicator {
  width: 16px;
  height: 16px;
}
```

## Performance Considerations

- The WebSocket connection adds minimal overhead when idle
- Visual indicators use efficient CSS classes for performance
- Background refresh can be adjusted or disabled for performance-sensitive environments
- Large numbers of concurrent updates might require increasing the refresh interval
- The module implements update batching to avoid excessive DOM updates