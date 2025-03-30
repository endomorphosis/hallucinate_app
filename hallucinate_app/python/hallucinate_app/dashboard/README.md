# Hallucinate App Dashboard Components

This directory contains dashboard components for monitoring and managing various aspects of the Hallucinate App.

## Components Overview

### IPFS Kit Dashboard Panel

The IPFS Kit Dashboard Panel provides a comprehensive interface for monitoring and controlling IPFS operations. It includes:

- Real-time status monitoring of IPFS nodes
- Visualization of pinned content
- Connected peers information
- Performance metrics for IPFS operations
- Controls for common IPFS operations (add, retrieve, pin, unpin)

#### Files:
- `ipfs_kit_panel.py`: The Python dashboard panel component
- `ipfs_kit_dashboard.js`: JavaScript UI component for the dashboard
- `ipfs_kit_bridge.py`: Integration with the main dashboard bridge system
- `register_ipfs_dashboard.js`: JavaScript registration for the dashboard
- `components/ipfs_kit_panel.js`: Component metadata and initialization

#### Usage:

The IPFS Kit panel is automatically registered with the main dashboard. To manually initialize it:

```javascript
import { registerIPFSKitDashboard } from './register_ipfs_dashboard.js';

// Register with dashboard
const ipfsPanel = registerIPFSKitDashboard(dashboard, {
  autoInitialize: true,
  theme: 'dark',
  refreshInterval: 5000 // ms
});
```

### Other Dashboard Components

- Database Sync Dashboard: Monitors and manages database synchronization
- Error Monitor Dashboard: Tracks and displays application errors
- Query Optimizer Dashboard: Provides insights for query optimization
- IPFS Transformers Dashboard: Controls and monitors model inference and transformers
- Database Query System Dashboard: Manages cross-database query execution and optimization

## Architecture

The dashboard components follow a consistent architecture:

1. **Panel Component**: Python class that interfaces with the underlying system (e.g., `IPFSKitPanel`)
2. **Bridge Component**: Handles communication between JavaScript and Python (e.g., `ipfs_kit_bridge.py`)
3. **UI Component**: JavaScript code for the frontend (e.g., `ipfs_kit_dashboard.js`)
4. **Registration**: Component for registering with the main dashboard (e.g., `register_ipfs_dashboard.js`)

## Adding New Components

To add a new dashboard component:

1. Create a Python panel class that interfaces with the underlying system
2. Implement the JavaScript UI component
3. Create a bridge module for JS-Python communication
4. Register the component with the main dashboard
5. Add test coverage for the component

## Testing

Tests for dashboard components are in the `test/` directory. Run:

```bash
python test/test_ipfs_kit_integration.py
```

to test the IPFS Kit dashboard components.