/**
 * P2P Integration Module for Real-Time Updates
 * 
 * Integrates the P2P communication functionality with the PyArrow Content Index Dashboard.
 * This allows direct peer-to-peer communication between dashboard instances using WebRTC and libp2p.
 */

import RealtimeP2P from './realtime_p2p.js';

/**
 * Integrate P2P communication with the dashboard
 * 
 * @param {Object} dashboard Dashboard instance or container element
 * @param {Object} options Configuration options
 * @param {Object} options.realtimeUpdates RealtimeUpdates instance
 * @param {Object} options.eventBus Event bus for communication
 * @param {Object} options.config P2P configuration options
 * @returns {Object} Integration result with success status and p2p instance
 */
function integrateP2PCommunication(dashboard, options = {}) {
  try {
    console.info('Integrating P2P communication with dashboard');
    
    // Get dashboard container element
    const container = typeof dashboard === 'object' && dashboard.element ? 
      dashboard.element : 
      (dashboard instanceof HTMLElement ? dashboard : null);
    
    if (!container) {
      throw new Error('Invalid dashboard container');
    }
    
    // Get options
    const realtimeUpdates = options.realtimeUpdates || (dashboard && dashboard.realtimeUpdates);
    
    if (!realtimeUpdates) {
      throw new Error('RealtimeUpdates instance required for P2P integration');
    }
    
    // Get or create event bus
    const eventBus = options.eventBus || 
      (dashboard && dashboard.eventBus ? dashboard.eventBus : createEventBus());
    
    // Create P2P communication instance
    const p2p = new RealtimeP2P({
      eventBus,
      realtimeUpdates,
      config: options.config || {}
    });
    
    // Initialize P2P communication
    p2p.init().then(success => {
      if (success) {
        console.info('P2P communication initialized successfully');
        
        // Set up UI components
        setupP2PUI(container, p2p, eventBus);
        
        // Enhance dashboard if available
        if (dashboard && typeof dashboard === 'object') {
          enhanceDashboardWithP2P(dashboard, p2p);
        }
      } else {
        console.warn('P2P communication initialization failed');
      }
    });
    
    return {
      success: true,
      p2p
    };
  } catch (error) {
    console.error('Failed to integrate P2P communication:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a simple event bus if one doesn't exist
 * @returns {Object} Event bus with on, off, and emit methods
 */
function createEventBus() {
  const events = {};
  
  return {
    on(event, callback) {
      if (!events[event]) {
        events[event] = [];
      }
      events[event].push(callback);
    },
    
    off(event, callback) {
      if (!events[event]) return;
      if (callback) {
        events[event] = events[event].filter(cb => cb !== callback);
      } else {
        events[event] = [];
      }
    },
    
    emit(event, data) {
      if (!events[event]) return;
      events[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  };
}

/**
 * Set up P2P UI components
 * 
 * @param {HTMLElement} container Dashboard container element
 * @param {Object} p2p P2P communication instance
 * @param {Object} eventBus Event bus for communication
 */
function setupP2PUI(container, p2p, eventBus) {
  // Find the realtime tab
  const realtimeTab = container.querySelector('#realtime-tab');
  
  if (!realtimeTab) {
    console.warn('Realtime tab not found, cannot set up P2P UI');
    return;
  }
  
  // Create P2P card
  const p2pCard = document.createElement('div');
  p2pCard.className = 'card mt-4';
  p2pCard.innerHTML = createP2PCardHTML();
  
  // Add to realtime tab
  realtimeTab.appendChild(p2pCard);
  
  // Set up event handlers
  setupP2PEventHandlers(p2pCard, p2p, eventBus);
  
  // Add P2P styles
  addP2PStyles();
}

/**
 * Create HTML for the P2P card
 * 
 * @returns {string} HTML for the P2P card
 */
function createP2PCardHTML() {
  return `
    <div class="card-header">
      <h3 class="card-title">Peer-to-Peer Collaboration</h3>
      <i class="fas fa-network-wired card-icon"></i>
    </div>
    <div class="card-content">
      <div class="p2p-status-panel">
        <div class="status-row">
          <div class="status-label">Connection Status:</div>
          <div class="status-value">
            <div id="p2p-status-indicator" class="status-indicator-large disconnected"></div>
            <span id="p2p-status-text">Disconnected</span>
          </div>
          <button id="p2p-connect-btn" class="btn btn-primary">Connect</button>
        </div>
        
        <div class="status-row">
          <div class="status-label">Peer ID:</div>
          <div id="p2p-peer-id" class="status-value mono-text">Not initialized</div>
          <button id="p2p-copy-id-btn" class="btn btn-secondary btn-sm" title="Copy Peer ID">
            <i class="fas fa-copy"></i>
          </button>
        </div>
        
        <div class="status-row">
          <div class="status-label">Connected Peers:</div>
          <div id="p2p-connected-peers" class="status-value">0</div>
        </div>
        
        <div class="status-row">
          <div class="status-label">Messages:</div>
          <div class="status-value">
            <span id="p2p-sent-messages">0</span> sent,
            <span id="p2p-received-messages">0</span> received
          </div>
        </div>
      </div>
      
      <h4>Connected Peers</h4>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Peer ID</th>
              <th>Connection</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="p2p-peers-table">
            <tr>
              <td colspan="4" class="text-center">No connected peers</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <h4>Settings</h4>
      <div class="settings-grid">
        <div class="setting-row">
          <label class="setting-label">
            <input type="checkbox" id="p2p-auto-connect" checked>
            Auto-connect to peers
          </label>
          <div class="setting-description">Automatically connect to discovered peers</div>
        </div>
        
        <div class="setting-row">
          <label class="setting-label">
            <input type="checkbox" id="p2p-relay" checked>
            Use relay servers
          </label>
          <div class="setting-description">Connect through relay servers when direct connection isn't possible</div>
        </div>
        
        <div class="setting-row">
          <label class="setting-label">
            <input type="checkbox" id="p2p-share-updates" checked>
            Share content updates
          </label>
          <div class="setting-description">Share content updates with connected peers</div>
        </div>
        
        <div class="setting-row">
          <label class="setting-label">
            <input type="checkbox" id="p2p-accept-updates" checked>
            Accept peer updates
          </label>
          <div class="setting-description">Accept content updates from connected peers</div>
        </div>
      </div>
      
      <h4>Recent Activity</h4>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Peer</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="p2p-activity-table">
            <tr>
              <td colspan="4" class="text-center">No recent activity</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="actions">
        <button id="p2p-sync-btn" class="btn btn-secondary">
          <i class="fas fa-sync-alt"></i> Request Sync
        </button>
        <button id="p2p-test-btn" class="btn btn-secondary">
          <i class="fas fa-vial"></i> Test Connection
        </button>
        <button id="p2p-refresh-btn" class="btn btn-primary">
          <i class="fas fa-redo-alt"></i> Refresh Status
        </button>
      </div>
      
      <div class="mt-4">
        <details>
          <summary>Advanced: Connect to Specific Peer</summary>
          <div class="mt-2">
            <div class="input-group">
              <input type="text" id="p2p-peer-id-input" class="form-control" 
                placeholder="Enter Peer ID to connect to">
              <button id="p2p-connect-to-btn" class="btn btn-primary">Connect</button>
            </div>
          </div>
        </details>
      </div>
    </div>
  `;
}

/**
 * Set up event handlers for the P2P card
 * 
 * @param {HTMLElement} card P2P card element
 * @param {Object} p2p P2P communication instance
 * @param {Object} eventBus Event bus for communication
 */
function setupP2PEventHandlers(card, p2p, eventBus) {
  // Connect/disconnect button
  const connectBtn = card.querySelector('#p2p-connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (p2p.connected) {
        p2p.disconnect();
        connectBtn.textContent = 'Connect';
        connectBtn.className = 'btn btn-primary';
        updateP2PStatusUI(card, false);
      } else {
        connectBtn.textContent = 'Connecting...';
        connectBtn.disabled = true;
        
        p2p.connect().then(success => {
          connectBtn.disabled = false;
          if (success) {
            connectBtn.textContent = 'Disconnect';
            connectBtn.className = 'btn btn-danger';
            updateP2PStatusUI(card, true);
          } else {
            connectBtn.textContent = 'Connect';
            connectBtn.className = 'btn btn-primary';
          }
        }).catch(error => {
          console.error('P2P connection error:', error);
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          connectBtn.className = 'btn btn-primary';
        });
      }
    });
  }
  
  // Copy Peer ID button
  const copyIdBtn = card.querySelector('#p2p-copy-id-btn');
  if (copyIdBtn) {
    copyIdBtn.addEventListener('click', () => {
      const peerId = p2p.peerId;
      if (peerId) {
        navigator.clipboard.writeText(peerId)
          .then(() => {
            showCopiedToast();
          })
          .catch(err => {
            console.error('Failed to copy peer ID:', err);
          });
      }
    });
  }
  
  // Connect to specific peer
  const connectToBtn = card.querySelector('#p2p-connect-to-btn');
  const peerIdInput = card.querySelector('#p2p-peer-id-input');
  if (connectToBtn && peerIdInput) {
    connectToBtn.addEventListener('click', () => {
      const peerId = peerIdInput.value.trim();
      if (!peerId) {
        return;
      }
      
      connectToBtn.disabled = true;
      connectToBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
      
      p2p.connectToPeer(peerId).then(success => {
        connectToBtn.disabled = false;
        connectToBtn.innerHTML = 'Connect';
        
        if (success) {
          peerIdInput.value = '';
          addActivityEntry(card, {
            type: 'connected',
            peerId,
            timestamp: Date.now()
          });
        } else {
          addActivityEntry(card, {
            type: 'connection-failed',
            peerId,
            timestamp: Date.now()
          });
        }
      }).catch(error => {
        console.error(`Failed to connect to peer ${peerId}:`, error);
        connectToBtn.disabled = false;
        connectToBtn.innerHTML = 'Connect';
      });
    });
  }
  
  // Request sync button
  const syncBtn = card.querySelector('#p2p-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
      
      p2p.requestSync().then(responses => {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Request Sync';
        
        addActivityEntry(card, {
          type: 'sync-completed',
          responses: responses.length,
          timestamp: Date.now()
        });
      }).catch(error => {
        console.error('Error during sync:', error);
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Request Sync';
      });
    });
  }
  
  // Test connection button
  const testBtn = card.querySelector('#p2p-test-btn');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      if (!p2p.connected) {
        return;
      }
      
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
      
      // Broadcast test message
      p2p.broadcastMessage('test', {
        message: 'Test message from peer',
        timestamp: Date.now()
      });
      
      // Enable button after timeout
      setTimeout(() => {
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="fas fa-vial"></i> Test Connection';
        
        addActivityEntry(card, {
          type: 'test-sent',
          timestamp: Date.now()
        });
      }, 1000);
    });
  }
  
  // Refresh status button
  const refreshBtn = card.querySelector('#p2p-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      
      updateP2PUI(card, p2p);
      
      // Enable button after timeout
      setTimeout(() => {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Refresh Status';
      }, 500);
    });
  }
  
  // Settings toggles
  const autoConnectToggle = card.querySelector('#p2p-auto-connect');
  if (autoConnectToggle) {
    autoConnectToggle.addEventListener('change', () => {
      p2p.config.autoConnect = autoConnectToggle.checked;
    });
  }
  
  const relayToggle = card.querySelector('#p2p-relay');
  if (relayToggle) {
    relayToggle.addEventListener('change', () => {
      p2p.config.libp2p.relayDiscovery = relayToggle.checked;
    });
  }
  
  const shareUpdatesToggle = card.querySelector('#p2p-share-updates');
  if (shareUpdatesToggle) {
    shareUpdatesToggle.addEventListener('change', () => {
      if (shareUpdatesToggle.checked) {
        // Re-enable event listener
        eventBus.on('content-updated', p2p._handleContentUpdate);
      } else {
        // Remove event listener
        eventBus.off('content-updated', p2p._handleContentUpdate);
      }
    });
  }
  
  const acceptUpdatesToggle = card.querySelector('#p2p-accept-updates');
  if (acceptUpdatesToggle) {
    acceptUpdatesToggle.addEventListener('change', () => {
      p2p.acceptPeerUpdates = acceptUpdatesToggle.checked;
    });
  }
  
  // Set up event listeners for updating UI
  setupP2PEventListeners(card, p2p, eventBus);
}

/**
 * Set up event listeners for updating the P2P UI
 * 
 * @param {HTMLElement} card P2P card element
 * @param {Object} p2p P2P communication instance
 * @param {Object} eventBus Event bus
 */
function setupP2PEventListeners(card, p2p, eventBus) {
  // Update peer ID when initialized
  eventBus.on('p2p-initialized', (data) => {
    const peerIdEl = card.querySelector('#p2p-peer-id');
    if (peerIdEl) {
      peerIdEl.textContent = data.peerId;
    }
    
    // Initial UI update
    updateP2PUI(card, p2p);
  });
  
  // Update status when connected
  eventBus.on('p2p-connected', () => {
    updateP2PStatusUI(card, true);
    
    const connectBtn = card.querySelector('#p2p-connect-btn');
    if (connectBtn) {
      connectBtn.textContent = 'Disconnect';
      connectBtn.className = 'btn btn-danger';
    }
    
    addActivityEntry(card, {
      type: 'connected-network',
      timestamp: Date.now()
    });
  });
  
  // Update status when disconnected
  eventBus.on('p2p-disconnected', () => {
    updateP2PStatusUI(card, false);
    
    const connectBtn = card.querySelector('#p2p-connect-btn');
    if (connectBtn) {
      connectBtn.textContent = 'Connect';
      connectBtn.className = 'btn btn-primary';
    }
    
    addActivityEntry(card, {
      type: 'disconnected-network',
      timestamp: Date.now()
    });
    
    // Clear peers table
    const peersTable = card.querySelector('#p2p-peers-table');
    if (peersTable) {
      peersTable.innerHTML = '<tr><td colspan="4" class="text-center">No connected peers</td></tr>';
    }
  });
  
  // Handle peer connections
  eventBus.on('peer-connected', (data) => {
    updatePeersTable(card, p2p);
    
    addActivityEntry(card, {
      type: 'peer-connected',
      peerId: data.peerId,
      timestamp: new Date(data.timestamp).getTime()
    });
  });
  
  // Handle peer disconnections
  eventBus.on('peer-disconnected', (data) => {
    updatePeersTable(card, p2p);
    
    addActivityEntry(card, {
      type: 'peer-disconnected',
      peerId: data.peerId,
      timestamp: new Date(data.timestamp).getTime()
    });
  });
  
  // Handle sync responses
  eventBus.on('sync-response', (data) => {
    addActivityEntry(card, {
      type: 'sync-response',
      peerId: data.peerId,
      stats: data.stats,
      timestamp: new Date(data.timestamp).getTime()
    });
  });
  
  // Handle remote content updates
  eventBus.on('remote-content-updated', (data) => {
    addActivityEntry(card, {
      type: 'content-received',
      peerId: data.peerId,
      action: data.action,
      timestamp: new Date(data.timestamp).getTime()
    });
  });
  
  // Handle p2p messages
  eventBus.on('p2p-message', (data) => {
    if (data.type === 'test') {
      addActivityEntry(card, {
        type: 'test-received',
        peerId: data.peerId,
        timestamp: new Date(data.timestamp).getTime()
      });
    }
  });
  
  // Update statistics periodically
  setInterval(() => {
    if (p2p.initialized) {
      updateP2PUI(card, p2p);
    }
  }, 5000);
}

/**
 * Update the P2P UI
 * 
 * @param {HTMLElement} card P2P card element
 * @param {Object} p2p P2P communication instance
 */
function updateP2PUI(card, p2p) {
  // Update peer ID
  const peerIdEl = card.querySelector('#p2p-peer-id');
  if (peerIdEl && p2p.peerId) {
    peerIdEl.textContent = p2p.peerId;
  }
  
  // Update connection status
  updateP2PStatusUI(card, p2p.connected);
  
  // Update stats
  const stats = p2p.getStats();
  
  const connectedPeersEl = card.querySelector('#p2p-connected-peers');
  if (connectedPeersEl) {
    connectedPeersEl.textContent = stats.connectedPeers;
  }
  
  const sentMessagesEl = card.querySelector('#p2p-sent-messages');
  if (sentMessagesEl) {
    sentMessagesEl.textContent = stats.messagesSent;
  }
  
  const receivedMessagesEl = card.querySelector('#p2p-received-messages');
  if (receivedMessagesEl) {
    receivedMessagesEl.textContent = stats.messagesReceived;
  }
  
  // Update peers table
  updatePeersTable(card, p2p);
}

/**
 * Update the P2P status UI
 * 
 * @param {HTMLElement} card P2P card element
 * @param {boolean} connected Connection status
 */
function updateP2PStatusUI(card, connected) {
  const statusIndicator = card.querySelector('#p2p-status-indicator');
  const statusText = card.querySelector('#p2p-status-text');
  
  if (statusIndicator) {
    statusIndicator.className = connected ? 
      'status-indicator-large connected' : 
      'status-indicator-large disconnected';
  }
  
  if (statusText) {
    statusText.textContent = connected ? 'Connected' : 'Disconnected';
  }
}

/**
 * Update the peers table
 * 
 * @param {HTMLElement} card P2P card element
 * @param {Object} p2p P2P communication instance
 */
function updatePeersTable(card, p2p) {
  const peersTable = card.querySelector('#p2p-peers-table');
  if (!peersTable) return;
  
  const connectedPeers = p2p.getConnectedPeers();
  
  if (connectedPeers.length === 0) {
    peersTable.innerHTML = '<tr><td colspan="4" class="text-center">No connected peers</td></tr>';
    return;
  }
  
  let html = '';
  
  connectedPeers.forEach(peer => {
    const peerId = peer.id;
    const shortPeerId = `${peerId.substring(0, 10)}...${peerId.substring(peerId.length - 6)}`;
    const lastSeen = formatTimeAgo(peer.lastSeen);
    
    html += `
      <tr>
        <td title="${peerId}" class="mono-text">${shortPeerId}</td>
        <td><span class="badge badge-green">Connected</span></td>
        <td>${lastSeen}</td>
        <td>
          <button class="btn btn-sm btn-secondary peer-message-btn" data-peer-id="${peerId}">
            <i class="fas fa-comment"></i>
          </button>
          <button class="btn btn-sm btn-danger peer-disconnect-btn" data-peer-id="${peerId}">
            <i class="fas fa-times"></i>
          </button>
        </td>
      </tr>
    `;
  });
  
  peersTable.innerHTML = html;
  
  // Add event listeners for peer actions
  peersTable.querySelectorAll('.peer-message-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const peerId = e.currentTarget.getAttribute('data-peer-id');
      p2p.sendMessage(peerId, 'message', {
        message: 'Hello from peer!',
        timestamp: Date.now()
      });
      
      addActivityEntry(card, {
        type: 'message-sent',
        peerId,
        timestamp: Date.now()
      });
    });
  });
  
  peersTable.querySelectorAll('.peer-disconnect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const peerId = e.currentTarget.getAttribute('data-peer-id');
      p2p._closePeerConnection(peerId);
      
      // Update table after a short delay
      setTimeout(() => {
        updatePeersTable(card, p2p);
      }, 500);
      
      addActivityEntry(card, {
        type: 'peer-disconnected-manual',
        peerId,
        timestamp: Date.now()
      });
    });
  });
}

/**
 * Add an activity entry to the activity table
 * 
 * @param {HTMLElement} card P2P card element
 * @param {Object} activity Activity data
 */
function addActivityEntry(card, activity) {
  const activityTable = card.querySelector('#p2p-activity-table');
  if (!activityTable) return;
  
  // Clear "no activity" row if present
  const noActivityRow = activityTable.querySelector('tr td[colspan="4"]');
  if (noActivityRow) {
    activityTable.innerHTML = '';
  }
  
  // Create new row
  const row = document.createElement('tr');
  
  // Format timestamp
  const time = new Date(activity.timestamp).toLocaleTimeString();
  
  // Process activity type
  let typeText = 'Unknown';
  let peerText = '-';
  let statusHtml = '<span class="badge badge-blue">Info</span>';
  
  switch (activity.type) {
    case 'connected-network':
      typeText = 'Network';
      statusHtml = '<span class="badge badge-green">Connected</span>';
      break;
      
    case 'disconnected-network':
      typeText = 'Network';
      statusHtml = '<span class="badge badge-yellow">Disconnected</span>';
      break;
      
    case 'peer-connected':
      typeText = 'Peer';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-green">Connected</span>';
      break;
      
    case 'peer-disconnected':
      typeText = 'Peer';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-yellow">Disconnected</span>';
      break;
      
    case 'peer-disconnected-manual':
      typeText = 'Peer';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-red">Disconnected (Manual)</span>';
      break;
      
    case 'content-received':
      typeText = `Content ${activity.action || 'Updated'}`;
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-green">Received</span>';
      break;
      
    case 'sync-completed':
      typeText = 'Sync';
      peerText = `${activity.responses || 0} responses`;
      statusHtml = '<span class="badge badge-green">Completed</span>';
      break;
      
    case 'sync-response':
      typeText = 'Sync';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-green">Response</span>';
      break;
      
    case 'test-sent':
      typeText = 'Test';
      statusHtml = '<span class="badge badge-blue">Sent</span>';
      break;
      
    case 'test-received':
      typeText = 'Test';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-green">Received</span>';
      break;
      
    case 'message-sent':
      typeText = 'Message';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-blue">Sent</span>';
      break;
      
    case 'connected':
      typeText = 'Connection';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-green">Success</span>';
      break;
      
    case 'connection-failed':
      typeText = 'Connection';
      peerText = formatPeerId(activity.peerId);
      statusHtml = '<span class="badge badge-red">Failed</span>';
      break;
  }
  
  // Add row to table
  row.innerHTML = `
    <td>${time}</td>
    <td>${peerText}</td>
    <td>${typeText}</td>
    <td>${statusHtml}</td>
  `;
  
  // Add to beginning of table
  activityTable.insertBefore(row, activityTable.firstChild);
  
  // Limit number of rows
  const rows = activityTable.querySelectorAll('tr');
  if (rows.length > 20) {
    activityTable.removeChild(rows[rows.length - 1]);
  }
}

/**
 * Format a peer ID for display
 * 
 * @param {string} peerId Full peer ID
 * @returns {string} Shortened peer ID
 */
function formatPeerId(peerId) {
  if (!peerId) return '-';
  
  if (peerId.length > 16) {
    return `${peerId.substring(0, 8)}...${peerId.substring(peerId.length - 4)}`;
  }
  
  return peerId;
}

/**
 * Format a timestamp as time ago
 * 
 * @param {number} timestamp Timestamp in milliseconds
 * @returns {string} Formatted time ago
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) {
    return 'Just now';
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    return new Date(timestamp).toLocaleString();
  }
}

/**
 * Show a toast notification that peer ID was copied
 */
function showCopiedToast() {
  // Check if toast container exists
  let toastContainer = document.getElementById('toast-container');
  
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  // Create toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = '<i class="fas fa-check-circle"></i> Peer ID copied to clipboard';
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Remove after animation
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toastContainer.contains(toast)) {
        toastContainer.removeChild(toast);
      }
    }, 500);
  }, 3000);
}

/**
 * Enhance dashboard with P2P capabilities
 * 
 * @param {Object} dashboard Dashboard instance
 * @param {Object} p2p P2P instance
 */
function enhanceDashboardWithP2P(dashboard, p2p) {
  // Add p2p instance to dashboard
  dashboard.p2p = p2p;
  
  // Enhance broadcast capability
  if (!dashboard.broadcast && typeof dashboard.broadcast !== 'function') {
    dashboard.broadcast = (type, payload) => {
      if (p2p && p2p.connected) {
        return p2p.broadcastMessage(type, payload);
      }
      return false;
    };
  }
  
  // Enhance direct message capability
  if (!dashboard.sendToPeer && typeof dashboard.sendToPeer !== 'function') {
    dashboard.sendToPeer = (peerId, type, payload) => {
      if (p2p && p2p.connected) {
        return p2p.sendMessage(peerId, type, payload);
      }
      return false;
    };
  }
  
  // Enhance cleanup
  const originalDestroy = dashboard.destroy || (() => {});
  dashboard.destroy = () => {
    // Call original destroy
    originalDestroy.call(dashboard);
    
    // Clean up p2p
    if (p2p) {
      p2p.destroy();
    }
  };
}

/**
 * Add CSS styles for P2P UI elements
 */
function addP2PStyles() {
  // Check if styles already exist
  if (document.getElementById('p2p-styles')) {
    return;
  }
  
  // Create style element
  const styleElement = document.createElement('style');
  styleElement.id = 'p2p-styles';
  
  // Set CSS content
  styleElement.textContent = `
    /* P2P Status Panel */
    .p2p-status-panel {
      background-color: #f7fafc;
      border-radius: 0.375rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    
    /* Monospace Text */
    .mono-text {
      font-family: monospace;
      font-size: 0.9em;
      word-break: break-all;
    }
    
    /* Toast Container */
    #toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    /* Toast Notification */
    .toast {
      background-color: #2d3748;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slide-in-bottom 0.3s ease-out;
    }
    
    .toast i {
      color: #48bb78;
    }
    
    .toast-hide {
      animation: slide-out-right 0.3s ease-in;
      opacity: 0;
    }
    
    @keyframes slide-in-bottom {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    @keyframes slide-out-right {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  
  // Add styles to document
  document.head.appendChild(styleElement);
}

export default integrateP2PCommunication;