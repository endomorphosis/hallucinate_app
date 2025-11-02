# MCP Daemon Manager - UI Screenshots

## Dashboard Overview

The MCP Daemon Manager provides a beautiful, modern interface for controlling and monitoring Model Context Protocol servers.

### Main Dashboard Layout

```
┌────────────────────────────────────────────────────────────────┐
│  🚀 MCP Daemon Manager                                         │
│                                                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│  │ Start All   │ │ Stop All    │ │ Refresh     │             │
│  │  Daemons    │ │  Daemons    │ │  Status     │             │
│  └─────────────┘ └─────────────┘ └─────────────┘             │
│                                                                │
│  ┌──────────────────────────┬──────────────────────────────┐  │
│  │  IPFS Accelerate MCP     │  SwissKnife MCP             │  │
│  │  ┌────────────────────┐  │  ┌────────────────────┐     │  │
│  │  │ Status: RUNNING    │  │  │ Status: RUNNING    │     │  │
│  │  └────────────────────┘  │  └────────────────────┘     │  │
│  │                          │                              │  │
│  │  PID: 12345              │  PID: 12346                 │  │
│  │  Uptime: 2h 15m          │  Uptime: 2h 15m             │  │
│  │  Restarts: 0             │  Restarts: 0                │  │
│  │                          │                              │  │
│  │  ┌────┐ ┌────┐ ┌──────┐ │  ┌────┐ ┌────┐ ┌──────┐    │  │
│  │  │Start│ │Stop│ │Restart││  │Start│ │Stop│ │Restart│   │  │
│  │  └────┘ └────┘ └──────┘ │  └────┘ └────┘ └──────┘    │  │
│  └──────────────────────────┴──────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────┬──────────────────────────────┐  │
│  │  HuggingFace MCP         │                              │  │
│  │  ┌────────────────────┐  │                              │  │
│  │  │ Status: STOPPED    │  │                              │  │
│  │  └────────────────────┘  │                              │  │
│  │                          │                              │  │
│  │  PID: N/A                │                              │  │
│  │  Uptime: N/A             │                              │  │
│  │  Restarts: 0             │                              │  │
│  │                          │                              │  │
│  │  ┌────┐ ┌────┐ ┌──────┐ │                              │  │
│  │  │Start│ │Stop│ │Restart││                              │  │
│  │  └────┘ └────┘ └──────┘ │                              │  │
│  └──────────────────────────┴──────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Event Log                                              │  │
│  │  ───────────────────────────────────────────────────── │  │
│  │  [21:05:43] IPFS Accelerate MCP started (PID: 12345)  │  │
│  │  [21:05:44] SwissKnife MCP started (PID: 12346)       │  │
│  │  [21:05:50] Health check: IPFS Accelerate MCP - OK    │  │
│  │  [21:05:51] Health check: SwissKnife MCP - OK         │  │
│  │  [21:06:00] HuggingFace MCP stopped                    │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Status Badges
- **Running**: Green background (#c6f6d5), dark green text (#22543d)
- **Stopped**: Red background (#fed7d7), dark red text (#742a2a)
- **Starting**: Orange background (#feebc8), dark orange text (#7c2d12)
- **Failed**: Dark red background (#feb2b2), very dark red text (#63171b)

### Buttons
- **Start**: Green (#48bb78)
- **Stop**: Red (#f56565)
- **Restart**: Orange (#ed8936)

### Background
- Gradient from purple (#667eea) to darker purple (#764ba2)
- Cards: White (#ffffff) with shadow
- Event log: Light gray background (#f7fafc)

## Features Demonstrated

### 1. Daemon Cards
Each daemon has its own card showing:
- Daemon name (formatted for readability)
- Status badge (color-coded)
- Process ID (PID)
- Uptime (formatted as hours/minutes)
- Restart count
- Control buttons (Start, Stop, Restart)

### 2. Control Buttons
- Disabled states (grayed out) when action is not applicable
- Hover effects (scale and opacity changes)
- Color-coded by action type

### 3. Event Log
- Chronological list of events
- Timestamps for each event
- Color-coded by type (success, error, info)
- Auto-scroll to latest events
- Limited to last 50 events

### 4. Bulk Operations
- Start All Daemons button
- Stop All Daemons button
- Refresh Status button
- All styled consistently

## Responsive Design

The dashboard uses CSS Grid for responsive layout:
- Cards automatically arrange in columns
- Minimum card width: 350px
- Adjusts to window size
- Maintains readability on all screen sizes

## Animation & Interactivity

### Hover Effects
- Cards lift slightly on hover
- Buttons scale up on hover
- Smooth transitions (0.3s)

### Status Updates
- Real-time status changes
- Smooth badge color transitions
- Automatic refresh every 10 seconds

### Event Updates
- New events appear at top of log
- Smooth insertion animation
- Auto-pruning of old events

## Accessibility

- High contrast colors
- Clear status indicators
- Keyboard-accessible controls
- Screen reader friendly labels
- Semantic HTML structure

## Integration with Electron

The dashboard integrates seamlessly with Electron:
- IPC communication for all operations
- Event-driven updates from main process
- No polling required for events
- Graceful error handling

## Menu Integration

Access from application menu:
```
File
View
Windows
  ├─ Test Interface
  ├─ Benchmark Dashboard
  ├─ Model Tester
  ├─ IPFS Kit Dashboard
  ├─ ────────────────
  ├─ SwissKnife Virtual Desktop
  └─ Daemon Manager          ← Opens this dashboard

Daemons
  ├─ Start All MCP Servers
  ├─ Stop All MCP Servers
  ├─ ────────────────
  ├─ IPFS Accelerate MCP
  │   ├─ Start
  │   ├─ Stop
  │   └─ Restart
  ├─ SwissKnife MCP
  │   ├─ Start
  │   ├─ Stop
  │   └─ Restart
  └─ HuggingFace MCP
      ├─ Start
      ├─ Stop
      └─ Restart
```

## Usage Examples

### Starting a Daemon
1. Click the daemon card's "Start" button
2. Watch status change to "Starting"
3. Status changes to "Running" when ready
4. PID and uptime appear
5. Event logged in event log

### Monitoring Health
1. Watch for health check events in log
2. Green events = healthy
3. Red events = issues detected
4. Auto-restart triggers on failures

### Handling Crashes
1. Daemon crashes, status changes to "Crashed"
2. Auto-restart begins (if enabled)
3. "Starting" status appears
4. Restart count increments
5. Event logged with crash details

## Error States

### Failed to Start
- Status badge shows "Failed"
- Error message in event log
- Manual intervention required
- All buttons enabled for retry

### Max Restarts Exceeded
- Status badge shows "Failed"
- Event log shows max restarts message
- Auto-restart disabled
- Manual restart required

### Connection Lost
- Dashboard shows warning
- Refresh button emphasized
- Auto-refresh continues
- IPC reconnection automatic

This UI provides a comprehensive, professional interface for managing MCP daemons with all the information and controls needed at a glance.
