/**
 * Real-Time Updates Integration Module
 * 
 * Integrates the real-time updates module with the PyArrow Content Index Dashboard.
 * This provides WebSocket-based notifications, visual indicators for changing items,
 * and background refresh functionality.
 */

import RealtimeUpdates from './realtime_updates.js';

/**
 * Integrate real-time updates with the dashboard
 * 
 * @param {Object} dashboard Dashboard instance or container element
 * @param {Object} options Configuration options
 * @param {Object} options.electronAPI Electron API for IPC communication
 * @param {Object} options.eventBus Event bus for dashboard communication
 * @param {string} options.wsEndpoint WebSocket endpoint URL
 * @param {boolean} options.autoConnect Automatically connect to WebSocket (default: true)
 * @param {boolean} options.enableNotifications Show notifications (default: true)
 * @param {boolean} options.enableVisualIndicators Display visual indicators (default: true)
 * @param {boolean} options.enableBackgroundRefresh Refresh in background (default: true)
 * @returns {Object} Integration result with success status and realtimeUpdates instance
 */
function integrateRealtimeUpdates(dashboard, options = {}) {
  try {
    console.info('Integrating real-time updates with dashboard');
    
    // Get dashboard container element
    const container = typeof dashboard === 'object' && dashboard.element ? 
      dashboard.element : 
      (dashboard instanceof HTMLElement ? dashboard : null);
    
    if (!container) {
      throw new Error('Invalid dashboard container');
    }
    
    // Get or create event bus
    const eventBus = options.eventBus || 
      (dashboard && dashboard.eventBus ? dashboard.eventBus : createEventBus());
    
    // Configure options
    const config = {
      eventBus,
      electronAPI: options.electronAPI || window.electronAPI,
      wsEndpoint: options.wsEndpoint,
      autoConnect: options.autoConnect !== false,
      enableNotifications: options.enableNotifications !== false,
      enableVisualIndicators: options.enableVisualIndicators !== false,
      enableBackgroundRefresh: options.enableBackgroundRefresh !== false,
      
      // Authentication support
      authManager: options.authManager || null,
      authToken: options.authToken || null,
      authRequired: options.authRequired !== false,
      
      // Metrics tracking
      metricsEnabled: options.metricsEnabled !== false,
      metricsUpdateInterval: options.metricsUpdateInterval || 30000
    };
    
    // Use provided realtime client or create a new RealtimeUpdates instance
    const realtimeUpdates = options.realtimeClient ? options.realtimeClient : new RealtimeUpdates({
      electronAPI: config.electronAPI,
      eventBus: config.eventBus,
      wsEndpoint: config.wsEndpoint,
      reconnectInterval: options.reconnectInterval || 5000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      bgRefreshInterval: options.bgRefreshInterval || 60000,
      
      // Authentication
      authManager: config.authManager,
      authToken: config.authToken,
      authRequired: config.authRequired,
      
      // Metrics
      metricsEnabled: config.metricsEnabled,
      metricsUpdateInterval: config.metricsUpdateInterval
    });
    
    // Integrate into dashboard UI
    integrateWithDashboardUI(container, realtimeUpdates, config);
    
    // Initialize real-time updates if it's not a provided client
    // (otherwise assume the client is already initialized)
    if (!options.realtimeClient) {
      realtimeUpdates.init().then(success => {
        if (success) {
          console.info('Real-time updates initialized successfully');
        } else {
          console.warn('Real-time updates initialization failed');
        }
      });
    } else {
      console.info('Using provided real-time client, skipping initialization');
    }
    
    // Set initial state based on config
    if (!config.enableNotifications) {
      realtimeUpdates.notificationsEnabled = false;
    }
    
    if (!config.enableVisualIndicators) {
      realtimeUpdates.visualIndicatorsEnabled = false;
    }
    
    if (!config.enableBackgroundRefresh) {
      realtimeUpdates.backgroundRefreshEnabled = false;
      realtimeUpdates.stopBackgroundRefresh();
    }
    
    // Enhance dashboard if available
    if (dashboard && typeof dashboard === 'object') {
      enhanceDashboard(dashboard, realtimeUpdates);
    }
    
    return {
      success: true,
      realtimeUpdates
    };
  } catch (error) {
    console.error('Failed to integrate real-time updates:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a simple event bus
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
      events[event] = events[event].filter(cb => cb !== callback);
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
 * Integrate with dashboard UI by adding necessary controls
 * 
 * @param {HTMLElement} container Dashboard container element
 * @param {Object} realtimeUpdates Real-time updates instance
 * @param {Object} config Configuration options
 */
function integrateWithDashboardUI(container, realtimeUpdates, config) {
  // Find the tabs container
  const tabsContainer = container.querySelector('.tabs');
  
  if (!tabsContainer) {
    console.warn('Tabs container not found, creating minimal real-time UI');
    createMinimalRealtimeUI(container, realtimeUpdates);
    return;
  }
  
  // Add real-time tab if not exists
  if (!container.querySelector('.tab[data-tab="realtime"]')) {
    const realTimeTab = document.createElement('div');
    realTimeTab.className = 'tab';
    realTimeTab.setAttribute('data-tab', 'realtime');
    realTimeTab.innerHTML = '<i class="fas fa-bolt"></i> Real-Time';
    tabsContainer.appendChild(realTimeTab);
    
    // Create real-time updates tab content
    const realTimeTabContent = document.createElement('div');
    realTimeTabContent.id = 'realtime-tab';
    realTimeTabContent.className = 'tab-content';
    realTimeTabContent.innerHTML = createRealtimeTabHTML(config);
    
    // Add tab content after existing tab contents
    const lastTabContent = container.querySelector('.tab-content:last-child');
    if (lastTabContent && lastTabContent.parentNode) {
      lastTabContent.parentNode.insertBefore(realTimeTabContent, lastTabContent.nextSibling);
    } else {
      container.appendChild(realTimeTabContent);
    }
    
    // Set up event handlers for the tab
    setupRealtimeTabEventHandlers(realTimeTabContent, realtimeUpdates, config);
  }
  
  // Add real-time status indicator to dashboard header
  const pageHeader = container.querySelector('.page-header') || container.querySelector('header');
  
  if (pageHeader) {
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'realtime-status-container';
    statusIndicator.innerHTML = `
      <div id="realtime-status" class="status-indicator disconnected"></div>
      <span id="realtime-status-text">Disconnected</span>
      <div id="realtime-counters" class="realtime-counters" style="display: none;"></div>
    `;
    
    pageHeader.appendChild(statusIndicator);
  }
  
  // Add notification container if it doesn't exist
  if (!document.getElementById('notification-container')) {
    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);
  }
  
  // Add necessary styles
  addRealtimeStyles();
}

/**
 * Create HTML for the real-time updates tab
 * 
 * @param {Object} config Configuration options
 * @returns {string} HTML for the real-time updates tab
 */
function createRealtimeTabHTML(config) {
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Real-Time Updates</h3>
        <i class="fas fa-bolt card-icon"></i>
      </div>
      <div class="card-content">
        <div class="realtime-status-panel">
          <div class="status-row">
            <div class="status-label">Connection Status:</div>
            <div class="status-value">
              <div class="status-indicator-large disconnected"></div>
              <span class="status-text">Disconnected</span>
            </div>
            <button id="realtime-connect-btn" class="btn btn-primary">Connect</button>
          </div>
          
          <!-- Authentication status (new) -->
          ${config.authRequired ? `
          <div class="status-row">
            <div class="status-label">Authentication:</div>
            <div class="status-value">
              <div class="status-indicator-large auth-status"></div>
              <span class="status-text" id="realtime-auth-status">Not authenticated</span>
            </div>
            <button id="realtime-auth-refresh-btn" class="btn btn-secondary">
              <i class="fas fa-sync-alt"></i> Refresh Token
            </button>
          </div>
          ` : ''}
          
          <div class="status-row">
            <div class="status-label">WebSocket URL:</div>
            <div class="status-value">
              <input type="text" id="realtime-ws-url" class="form-control" 
                value="${config.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws'}" 
                placeholder="WebSocket URL">
            </div>
            <button id="realtime-apply-url-btn" class="btn btn-secondary">Apply</button>
          </div>
          
          <div class="status-row">
            <div class="status-label">Last Activity:</div>
            <div class="status-value" id="realtime-last-activity">Never</div>
          </div>
          
          <div class="status-row">
            <div class="status-label">Updates Received:</div>
            <div class="status-value" id="realtime-updates-count">0</div>
          </div>
        </div>
        
        <h4>Settings</h4>
        <div class="settings-grid">
          <div class="setting-row">
            <label class="setting-label">
              <input type="checkbox" id="realtime-notifications-toggle" ${config.enableNotifications !== false ? 'checked' : ''}>
              Show Notifications
            </label>
            <div class="setting-description">Display notifications for content updates</div>
          </div>
          
          <div class="setting-row">
            <label class="setting-label">
              <input type="checkbox" id="realtime-indicators-toggle" ${config.enableVisualIndicators !== false ? 'checked' : ''}>
              Visual Indicators
            </label>
            <div class="setting-description">Highlight changed content in tables</div>
          </div>
          
          <div class="setting-row">
            <label class="setting-label">
              <input type="checkbox" id="realtime-background-toggle" ${config.enableBackgroundRefresh !== false ? 'checked' : ''}>
              Background Refresh
            </label>
            <div class="setting-description">Automatically refresh data in the background</div>
          </div>
          
          <div class="setting-row">
            <label class="setting-label">Background Refresh Interval:</label>
            <div class="setting-input">
              <select id="realtime-refresh-interval" class="form-control">
                <option value="30000">30 seconds</option>
                <option value="60000" selected>1 minute</option>
                <option value="300000">5 minutes</option>
                <option value="600000">10 minutes</option>
              </select>
            </div>
          </div>
        </div>
        
        <!-- Metrics panel (new) -->
        ${config.metricsEnabled ? `
        <h4>Metrics</h4>
        <div class="metrics-panel">
          <div class="metrics-row">
            <div class="metrics-card">
              <div class="metrics-title">Connection</div>
              <div class="metrics-content">
                <div class="metric-item">
                  <span class="metric-label">Attempts:</span>
                  <span class="metric-value" id="metric-connect-attempts">0</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Successes:</span>
                  <span class="metric-value" id="metric-connect-successes">0</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Failures:</span>
                  <span class="metric-value" id="metric-connect-failures">0</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Reconnects:</span>
                  <span class="metric-value" id="metric-reconnects">0</span>
                </div>
              </div>
            </div>
            
            <div class="metrics-card">
              <div class="metrics-title">Messages</div>
              <div class="metrics-content">
                <div class="metric-item">
                  <span class="metric-label">Sent:</span>
                  <span class="metric-value" id="metric-messages-sent">0</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Received:</span>
                  <span class="metric-value" id="metric-messages-received">0</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Notifications:</span>
                  <span class="metric-value" id="metric-notifications">0</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">Rate Limits:</span>
                  <span class="metric-value" id="metric-rate-limits">0</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="metrics-row">
            <div class="metrics-card full-width">
              <div class="metrics-title">Error Log</div>
              <div class="metrics-content">
                <div class="error-log-container" id="metrics-error-log">
                  <div class="no-errors">No errors recorded</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <h4>Recent Activity</h4>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Resource</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="realtime-activity-table">
              <tr>
                <td colspan="4" class="text-center">No recent activity</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="actions mt-4">
          <button id="realtime-clear-indicators-btn" class="btn btn-secondary">
            <i class="fas fa-eraser"></i> Clear Indicators
          </button>
          <button id="realtime-test-notification-btn" class="btn btn-secondary">
            <i class="fas fa-bell"></i> Test Notification
          </button>
          <button id="realtime-manual-refresh-btn" class="btn btn-primary">
            <i class="fas fa-sync-alt"></i> Manual Refresh
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Set up event handlers for the real-time updates tab
 * 
 * @param {HTMLElement} tabContent Real-time updates tab content element
 * @param {Object} realtimeUpdates Real-time updates instance
 * @param {Object} config Configuration options
 */
function setupRealtimeTabEventHandlers(tabContent, realtimeUpdates, config) {
  // Connect/disconnect button
  const connectBtn = tabContent.querySelector('#realtime-connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (realtimeUpdates.connected) {
        realtimeUpdates.disconnect();
        connectBtn.textContent = 'Connect';
        connectBtn.className = 'btn btn-primary';
      } else {
        connectBtn.textContent = 'Connecting...';
        connectBtn.disabled = true;
        
        realtimeUpdates.connect().then(success => {
          connectBtn.disabled = false;
          if (success) {
            connectBtn.textContent = 'Disconnect';
            connectBtn.className = 'btn btn-danger';
          } else {
            connectBtn.textContent = 'Connect';
            connectBtn.className = 'btn btn-primary';
          }
        }).catch(error => {
          console.error('Connection error:', error);
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          connectBtn.className = 'btn btn-primary';
        });
      }
    });
  }
  
  // Authentication refresh button (new)
  if (config.authRequired) {
    const authRefreshBtn = tabContent.querySelector('#realtime-auth-refresh-btn');
    const authStatusEl = tabContent.querySelector('#realtime-auth-status');
    const authStatusIndicator = tabContent.querySelector('.auth-status');
    
    if (authRefreshBtn && authStatusEl) {
      // Update auth status display
      const updateAuthStatus = () => {
        if (authStatusEl) {
          authStatusEl.textContent = realtimeUpdates.authSuccess ? 
            'Authenticated' : 
            (realtimeUpdates.authAttempted ? 'Authentication failed' : 'Not authenticated');
        }
        
        if (authStatusIndicator) {
          if (realtimeUpdates.authSuccess) {
            authStatusIndicator.className = 'status-indicator-large connected';
          } else if (realtimeUpdates.authAttempted) {
            authStatusIndicator.className = 'status-indicator-large error';
          } else {
            authStatusIndicator.className = 'status-indicator-large disconnected';
          }
        }
      };
      
      // Initialize the auth status display
      updateAuthStatus();
      
      // Listen for auth events
      if (config.eventBus) {
        config.eventBus.on('auth-success', () => {
          updateAuthStatus();
        });
        
        config.eventBus.on('auth-error', () => {
          updateAuthStatus();
        });
      }
      
      // Set up refresh button
      authRefreshBtn.addEventListener('click', async () => {
        authRefreshBtn.disabled = true;
        authRefreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        
        try {
          // Get fresh auth token
          if (realtimeUpdates.authManager && typeof realtimeUpdates.authManager.getSelfSignedToken === 'function') {
            realtimeUpdates.authToken = await realtimeUpdates.authManager.getSelfSignedToken('pyarrow-index:read');
            console.info('Refreshed authentication token');
            
            // Disconnect and reconnect with new token
            if (realtimeUpdates.connected) {
              await realtimeUpdates.disconnect();
              await realtimeUpdates.connect();
            }
            
            // Update status
            updateAuthStatus();
          } else {
            console.warn('Auth manager not available for token refresh');
          }
        } catch (error) {
          console.error('Error refreshing authentication token:', error);
        } finally {
          authRefreshBtn.disabled = false;
          authRefreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Token';
        }
      });
    }
  }
  
  // Set up metrics updater if enabled
  if (config.metricsEnabled) {
    const metricsElements = {
      connectAttempts: tabContent.querySelector('#metric-connect-attempts'),
      connectSuccesses: tabContent.querySelector('#metric-connect-successes'),
      connectFailures: tabContent.querySelector('#metric-connect-failures'),
      reconnects: tabContent.querySelector('#metric-reconnects'),
      messagesSent: tabContent.querySelector('#metric-messages-sent'),
      messagesReceived: tabContent.querySelector('#metric-messages-received'),
      notifications: tabContent.querySelector('#metric-notifications'),
      rateLimits: tabContent.querySelector('#metric-rate-limits'),
      errorLog: tabContent.querySelector('#metrics-error-log')
    };
    
    // Update metrics display from data
    const updateMetricsDisplay = (metrics) => {
      if (!metrics) return;
      
      // Update simple counters
      if (metricsElements.connectAttempts) 
        metricsElements.connectAttempts.textContent = metrics.connectAttempts || 0;
      if (metricsElements.connectSuccesses) 
        metricsElements.connectSuccesses.textContent = metrics.connectSuccesses || 0;
      if (metricsElements.connectFailures) 
        metricsElements.connectFailures.textContent = metrics.connectFailures || 0;
      if (metricsElements.reconnects) 
        metricsElements.reconnects.textContent = metrics.reconnectAttempts || 0;
      if (metricsElements.messagesSent) 
        metricsElements.messagesSent.textContent = metrics.messagesSent || 0;
      if (metricsElements.messagesReceived) 
        metricsElements.messagesReceived.textContent = metrics.messagesReceived || 0;
      if (metricsElements.notifications) 
        metricsElements.notifications.textContent = metrics.notificationsReceived || 0;
      if (metricsElements.rateLimits) 
        metricsElements.rateLimits.textContent = metrics.rateLimitsExceeded || 0;
      
      // Update error log
      if (metricsElements.errorLog && metrics.errors && metrics.errors.length > 0) {
        const errorsHtml = metrics.errors.map(error => {
          const time = new Date(error.time).toLocaleTimeString();
          return `<div class="error-entry">
            <span class="error-time">${time}</span>
            <span class="error-type">${error.type || 'unknown'}</span>
            <span class="error-message">${error.message || 'No message'}</span>
          </div>`;
        }).join('');
        
        metricsElements.errorLog.innerHTML = errorsHtml || '<div class="no-errors">No errors recorded</div>';
      }
    };
    
    // Initial update with current metrics
    updateMetricsDisplay(realtimeUpdates.metrics);
    
    // Listen for metrics updates
    if (config.eventBus) {
      config.eventBus.on('metrics-update', (data) => {
        updateMetricsDisplay(data.metrics);
      });
    }
  }
  
  // Apply WebSocket URL button
  const applyUrlBtn = tabContent.querySelector('#realtime-apply-url-btn');
  const wsUrlInput = tabContent.querySelector('#realtime-ws-url');
  
  if (applyUrlBtn && wsUrlInput) {
    applyUrlBtn.addEventListener('click', () => {
      const newUrl = wsUrlInput.value.trim();
      
      if (!newUrl) {
        alert('Please enter a valid WebSocket URL');
        return;
      }
      
      // Disconnect if connected
      if (realtimeUpdates.connected) {
        realtimeUpdates.disconnect();
        if (connectBtn) {
          connectBtn.textContent = 'Connect';
          connectBtn.className = 'btn btn-primary';
        }
      }
      
      // Update WebSocket URL
      realtimeUpdates.wsEndpoint = newUrl;
      
      // Connect if auto-connect is enabled
      if (config.autoConnect) {
        realtimeUpdates.connect().then(success => {
          if (connectBtn) {
            connectBtn.disabled = false;
            if (success) {
              connectBtn.textContent = 'Disconnect';
              connectBtn.className = 'btn btn-danger';
            } else {
              connectBtn.textContent = 'Connect';
              connectBtn.className = 'btn btn-primary';
            }
          }
        }).catch(error => {
          console.error('Connection error:', error);
          if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
            connectBtn.className = 'btn btn-primary';
          }
        });
      }
    });
  }
  
  // Notification toggle
  const notificationsToggle = tabContent.querySelector('#realtime-notifications-toggle');
  if (notificationsToggle) {
    notificationsToggle.addEventListener('change', () => {
      realtimeUpdates.notificationsEnabled = notificationsToggle.checked;
      if (config.eventBus) {
        config.eventBus.emit('notifications-toggle', notificationsToggle.checked);
      }
    });
    notificationsToggle.checked = realtimeUpdates.notificationsEnabled;
  }
  
  // Visual indicators toggle
  const indicatorsToggle = tabContent.querySelector('#realtime-indicators-toggle');
  if (indicatorsToggle) {
    indicatorsToggle.addEventListener('change', () => {
      realtimeUpdates.visualIndicatorsEnabled = indicatorsToggle.checked;
      if (config.eventBus) {
        config.eventBus.emit('visual-indicators-toggle', indicatorsToggle.checked);
      }
      
      if (!indicatorsToggle.checked) {
        realtimeUpdates.clearVisualIndicators();
      }
    });
    indicatorsToggle.checked = realtimeUpdates.visualIndicatorsEnabled;
  }
  
  // Background refresh toggle
  const backgroundToggle = tabContent.querySelector('#realtime-background-toggle');
  if (backgroundToggle) {
    backgroundToggle.addEventListener('change', () => {
      realtimeUpdates.backgroundRefreshEnabled = backgroundToggle.checked;
      if (config.eventBus) {
        config.eventBus.emit('background-refresh-toggle', backgroundToggle.checked);
      }
      
      if (backgroundToggle.checked) {
        realtimeUpdates.startBackgroundRefresh();
      } else {
        realtimeUpdates.stopBackgroundRefresh();
      }
    });
    backgroundToggle.checked = realtimeUpdates.backgroundRefreshEnabled;
  }
  
  // Refresh interval selector
  const refreshIntervalSelect = tabContent.querySelector('#realtime-refresh-interval');
  if (refreshIntervalSelect) {
    refreshIntervalSelect.addEventListener('change', () => {
      const interval = parseInt(refreshIntervalSelect.value, 10);
      realtimeUpdates.bgRefreshInterval = interval;
      
      if (realtimeUpdates.backgroundRefreshEnabled) {
        realtimeUpdates.stopBackgroundRefresh();
        realtimeUpdates.startBackgroundRefresh();
      }
    });
    
    // Set initial value
    const options = refreshIntervalSelect.querySelectorAll('option');
    for (const option of options) {
      if (parseInt(option.value, 10) === realtimeUpdates.bgRefreshInterval) {
        option.selected = true;
        break;
      }
    }
  }
  
  // Clear indicators button
  const clearIndicatorsBtn = tabContent.querySelector('#realtime-clear-indicators-btn');
  if (clearIndicatorsBtn) {
    clearIndicatorsBtn.addEventListener('click', () => {
      realtimeUpdates.clearVisualIndicators();
    });
  }
  
  // Test notification button
  const testNotificationBtn = tabContent.querySelector('#realtime-test-notification-btn');
  if (testNotificationBtn) {
    testNotificationBtn.addEventListener('click', () => {
      const testNotification = {
        type: 'system',
        message: 'This is a test notification',
        timestamp: new Date().toISOString()
      };
      
      realtimeUpdates.showNotification(testNotification);
    });
  }
  
  // Manual refresh button
  const manualRefreshBtn = tabContent.querySelector('#realtime-manual-refresh-btn');
  if (manualRefreshBtn) {
    manualRefreshBtn.addEventListener('click', () => {
      manualRefreshBtn.disabled = true;
      manualRefreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      
      realtimeUpdates.lastUpdateTime = Date.now();
      realtimeUpdates.clearVisualIndicators();
      
      if (config.eventBus) {
        config.eventBus.emit('manual-refresh', {
          timestamp: new Date().toISOString()
        });
      }
      
      // Enable button after a short delay
      setTimeout(() => {
        manualRefreshBtn.disabled = false;
        manualRefreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Manual Refresh';
      }, 1000);
    });
  }
  
  // Set up activity log
  setupActivityLog(tabContent, realtimeUpdates, config);
}

/**
 * Set up activity log in the real-time updates tab
 * 
 * @param {HTMLElement} tabContent Real-time updates tab content element
 * @param {Object} realtimeUpdates Real-time updates instance
 * @param {Object} config Configuration options
 */
function setupActivityLog(tabContent, realtimeUpdates, config) {
  const activityTable = tabContent.querySelector('#realtime-activity-table');
  const lastActivityEl = tabContent.querySelector('#realtime-last-activity');
  const updatesCountEl = tabContent.querySelector('#realtime-updates-count');
  
  if (!activityTable || !lastActivityEl || !updatesCountEl) {
    return;
  }
  
  let updateCount = 0;
  
  // Function to add activity to the log
  const addActivity = (activity) => {
    // Clear "no activity" row if present
    const noActivityRow = activityTable.querySelector('tr td[colspan="4"]');
    if (noActivityRow) {
      activityTable.innerHTML = '';
    }
    
    // Create new row
    const row = document.createElement('tr');
    
    // Format timestamp
    const timestamp = activity.timestamp ? new Date(activity.timestamp) : new Date();
    const timeString = timestamp.toLocaleTimeString();
    
    // Determine type and resource
    let type = activity.type || 'unknown';
    let resource = '';
    let status = '';
    
    switch (type) {
      case 'websocket-connected':
        type = 'Connected';
        resource = activity.endpoint || '';
        status = '<span class="badge badge-green">Success</span>';
        break;
      
      case 'websocket-closed':
        type = 'Disconnected';
        resource = activity.reason || '';
        status = `<span class="badge badge-yellow">Code ${activity.code || 0}</span>`;
        break;
      
      case 'websocket-error':
        type = 'Error';
        resource = activity.error || '';
        status = '<span class="badge badge-red">Error</span>';
        break;
      
      case 'content-updated':
        type = activity.action ? 
          activity.action.charAt(0).toUpperCase() + activity.action.slice(1) : 
          'Updated';
        resource = activity.content?.cid ? 
          `${activity.content.cid.substring(0, 16)}...` : 
          '';
        status = '<span class="badge badge-blue">Updated</span>';
        updateCount++;
        break;
      
      case 'content-synced':
        type = 'Sync';
        resource = `Added: ${activity.added || 0}, Updated: ${activity.updated || 0}, Removed: ${activity.removed || 0}`;
        status = '<span class="badge badge-green">Completed</span>';
        updateCount += ((activity.added || 0) + (activity.updated || 0) + (activity.removed || 0));
        break;
      
      case 'system-notification':
        type = 'System';
        resource = activity.message || '';
        status = '<span class="badge badge-blue">Info</span>';
        break;
      
      case 'background-refresh':
        type = 'Refresh';
        resource = activity.fullRefresh ? 'Full refresh' : 
          `Updated ${activity.changedItems?.length || 0} items`;
        status = '<span class="badge badge-blue">Completed</span>';
        break;
      
      case 'manual-refresh':
        type = 'Manual Refresh';
        resource = '';
        status = '<span class="badge badge-blue">Completed</span>';
        break;
      
      default:
        if (activity.action) {
          type = activity.action.charAt(0).toUpperCase() + activity.action.slice(1);
        }
        
        if (activity.content && activity.content.cid) {
          resource = `${activity.content.cid.substring(0, 16)}...`;
        }
        
        status = '<span class="badge badge-blue">Info</span>';
    }
    
    // Create row cells
    row.innerHTML = `
      <td>${timeString}</td>
      <td>${type}</td>
      <td>${resource}</td>
      <td>${status}</td>
    `;
    
    // Add row to table
    activityTable.insertBefore(row, activityTable.firstChild);
    
    // Limit number of rows
    const rows = activityTable.querySelectorAll('tr');
    if (rows.length > 10) {
      activityTable.removeChild(rows[rows.length - 1]);
    }
    
    // Update last activity and count
    lastActivityEl.textContent = timeString;
    updatesCountEl.textContent = updateCount.toString();
  };
  
  // Register event listeners
  if (config.eventBus) {
    const events = [
      'websocket-connected',
      'websocket-closed',
      'websocket-error',
      'content-updated',
      'content-synced',
      'system-notification',
      'background-refresh',
      'manual-refresh'
    ];
    
    events.forEach(event => {
      config.eventBus.on(event, activity => {
        addActivity({
          type: event,
          ...activity
        });
      });
    });
  }
}

/**
 * Create minimal real-time UI when tabs container is not found
 * 
 * @param {HTMLElement} container Dashboard container element
 * @param {Object} realtimeUpdates Real-time updates instance
 */
function createMinimalRealtimeUI(container, realtimeUpdates) {
  // Create minimal control panel
  const controlPanel = document.createElement('div');
  controlPanel.className = 'realtime-control-panel';
  controlPanel.innerHTML = `
    <div class="realtime-controls">
      <div class="realtime-status-indicator">
        <div id="realtime-status" class="status-indicator disconnected"></div>
        <span id="realtime-status-text">Disconnected</span>
      </div>
      <div id="realtime-counters" class="realtime-counters" style="display: none;"></div>
      <button id="realtime-minimal-toggle" class="btn btn-sm btn-primary">
        <i class="fas fa-bolt"></i> Real-Time Updates
      </button>
    </div>
    <div id="realtime-minimal-panel" class="realtime-minimal-panel" style="display: none;">
      <div class="form-group">
        <label class="setting-label">
          <input type="checkbox" id="realtime-minimal-notifications" checked>
          Notifications
        </label>
      </div>
      <div class="form-group">
        <label class="setting-label">
          <input type="checkbox" id="realtime-minimal-indicators" checked>
          Visual Indicators
        </label>
      </div>
      <div class="form-group">
        <label class="setting-label">
          <input type="checkbox" id="realtime-minimal-refresh" checked>
          Background Refresh
        </label>
      </div>
      <div class="actions">
        <button id="realtime-minimal-clear" class="btn btn-sm btn-secondary">
          Clear Indicators
        </button>
      </div>
    </div>
  `;
  
  // Find a good place to insert the control panel
  let insertTarget = container.querySelector('.action-bar');
  
  if (insertTarget) {
    insertTarget.parentNode.insertBefore(controlPanel, insertTarget.nextSibling);
  } else {
    // If no action bar, add at the beginning of the container
    container.insertBefore(controlPanel, container.firstChild);
  }
  
  // Set up event handlers
  const toggleBtn = controlPanel.querySelector('#realtime-minimal-toggle');
  const panel = controlPanel.querySelector('#realtime-minimal-panel');
  
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });
  }
  
  // Notification toggle
  const notificationsToggle = controlPanel.querySelector('#realtime-minimal-notifications');
  if (notificationsToggle) {
    notificationsToggle.addEventListener('change', () => {
      realtimeUpdates.notificationsEnabled = notificationsToggle.checked;
    });
    notificationsToggle.checked = realtimeUpdates.notificationsEnabled;
  }
  
  // Visual indicators toggle
  const indicatorsToggle = controlPanel.querySelector('#realtime-minimal-indicators');
  if (indicatorsToggle) {
    indicatorsToggle.addEventListener('change', () => {
      realtimeUpdates.visualIndicatorsEnabled = indicatorsToggle.checked;
      
      if (!indicatorsToggle.checked) {
        realtimeUpdates.clearVisualIndicators();
      }
    });
    indicatorsToggle.checked = realtimeUpdates.visualIndicatorsEnabled;
  }
  
  // Background refresh toggle
  const backgroundToggle = controlPanel.querySelector('#realtime-minimal-refresh');
  if (backgroundToggle) {
    backgroundToggle.addEventListener('change', () => {
      realtimeUpdates.backgroundRefreshEnabled = backgroundToggle.checked;
      
      if (backgroundToggle.checked) {
        realtimeUpdates.startBackgroundRefresh();
      } else {
        realtimeUpdates.stopBackgroundRefresh();
      }
    });
    backgroundToggle.checked = realtimeUpdates.backgroundRefreshEnabled;
  }
  
  // Clear indicators button
  const clearBtn = controlPanel.querySelector('#realtime-minimal-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      realtimeUpdates.clearVisualIndicators();
    });
  }
  
  // Add notification container if it doesn't exist
  if (!document.getElementById('notification-container')) {
    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);
  }
  
  // Add necessary styles
  addRealtimeStyles();
}

/**
 * Enhance dashboard with real-time updates functionality
 * 
 * @param {Object} dashboard Dashboard instance
 * @param {Object} realtimeUpdates Real-time updates instance
 */
function enhanceDashboard(dashboard, realtimeUpdates) {
  // Add realtimeUpdates instance to dashboard
  dashboard.realtimeUpdates = realtimeUpdates;
  
  // Add refresh method to dashboard if not exists
  if (!dashboard.refresh && typeof dashboard.refresh !== 'function') {
    dashboard.refresh = async (fullRefresh = false) => {
      // Emit manual refresh event
      if (dashboard.eventBus) {
        dashboard.eventBus.emit('manual-refresh', {
          timestamp: new Date().toISOString(),
          fullRefresh
        });
      }
      
      // Clear visual indicators
      realtimeUpdates.clearVisualIndicators();
      
      return true;
    };
  }
}

/**
 * Add CSS styles for real-time UI elements
 */
function addRealtimeStyles() {
  // Check if styles already exist
  if (document.getElementById('realtime-updates-styles')) {
    return;
  }
  
  // Create style element
  const styleElement = document.createElement('style');
  styleElement.id = 'realtime-updates-styles';
  
  // Set CSS content
  styleElement.textContent = `
    /* Status Indicators */
    .status-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 5px;
    }
    
    .status-indicator.connected {
      background-color: #48bb78;
      box-shadow: 0 0 5px rgba(72, 187, 120, 0.5);
    }
    
    .status-indicator.disconnected {
      background-color: #a0aec0;
    }
    
    .status-indicator.error {
      background-color: #f56565;
      box-shadow: 0 0 5px rgba(245, 101, 101, 0.5);
    }
    
    .status-indicator-large {
      display: inline-block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      margin-right: 8px;
    }
    
    .status-indicator-large.connected {
      background-color: #48bb78;
      box-shadow: 0 0 8px rgba(72, 187, 120, 0.5);
    }
    
    .status-indicator-large.disconnected {
      background-color: #a0aec0;
    }
    
    .status-indicator-large.error {
      background-color: #f56565;
      box-shadow: 0 0 8px rgba(245, 101, 101, 0.5);
    }
    
    /* Authentication Status */
    .auth-status {
      display: inline-block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      margin-right: 8px;
      background-color: #a0aec0;
    }
    
    .auth-status.connected {
      background-color: #48bb78;
      box-shadow: 0 0 8px rgba(72, 187, 120, 0.5);
    }
    
    .auth-status.error {
      background-color: #f56565;
      box-shadow: 0 0 8px rgba(245, 101, 101, 0.5);
    }
    
    /* Realtime Status Container */
    .realtime-status-container {
      display: flex;
      align-items: center;
      margin-left: auto;
      padding: 0.5rem 0.75rem;
      background-color: rgba(247, 250, 252, 0.8);
      border-radius: 0.375rem;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    
    .realtime-counters {
      display: flex;
      gap: 0.5rem;
      margin-left: 0.75rem;
    }
    
    /* Metrics Panel Styles */
    .metrics-panel {
      background-color: #f7fafc;
      border-radius: 0.375rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .metrics-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .metrics-row:last-child {
      margin-bottom: 0;
    }
    
    .metrics-card {
      flex: 1;
      min-width: 250px;
      background-color: white;
      border-radius: 0.375rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .metrics-card.full-width {
      flex-basis: 100%;
      width: 100%;
    }
    
    .metrics-title {
      background-color: #edf2f7;
      padding: 0.5rem 1rem;
      font-weight: 600;
      color: #4a5568;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .metrics-content {
      padding: 0.75rem 1rem;
    }
    
    .metric-item {
      display: flex;
      justify-content: space-between;
      padding: 0.25rem 0;
      border-bottom: 1px solid #f7fafc;
    }
    
    .metric-item:last-child {
      border-bottom: none;
    }
    
    .metric-label {
      color: #718096;
      font-size: 0.875rem;
    }
    
    .metric-value {
      font-weight: 600;
      color: #2d3748;
    }
    
    .error-log-container {
      max-height: 150px;
      overflow-y: auto;
      font-size: 0.875rem;
    }
    
    .error-entry {
      padding: 0.5rem;
      border-bottom: 1px solid #f7fafc;
      display: grid;
      grid-template-columns: 80px 100px 1fr;
      gap: 0.5rem;
    }
    
    .error-entry:nth-child(odd) {
      background-color: #f7fafc;
    }
    
    .error-time {
      color: #718096;
      font-size: 0.75rem;
    }
    
    .error-type {
      color: #e53e3e;
      font-weight: 600;
      font-size: 0.75rem;
    }
    
    .error-message {
      color: #4a5568;
      overflow-wrap: break-word;
    }
    
    .no-errors {
      color: #718096;
      font-style: italic;
      text-align: center;
      padding: 1rem;
    }
    
    /* Visual Indicators for Changed Content */
    tr.content-added {
      background-color: rgba(72, 187, 120, 0.1) !important;
      border-left: 4px solid #48bb78 !important;
    }
    
    tr.content-updated {
      background-color: rgba(66, 153, 225, 0.1) !important;
      border-left: 4px solid #4299e1 !important;
    }
    
    tr.content-deleted {
      background-color: rgba(245, 101, 101, 0.1) !important;
      border-left: 4px solid #f56565 !important;
    }
    
    tr.animate-change {
      animation: highlight-pulse 2s ease-in-out;
    }
    
    @keyframes highlight-pulse {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }
    
    /* Realtime Tab Styles */
    .realtime-status-panel {
      background-color: #f7fafc;
      border-radius: 0.375rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .status-row {
      display: flex;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    
    .status-row:last-child {
      margin-bottom: 0;
    }
    
    .status-label {
      width: 30%;
      font-weight: 500;
      color: #4a5568;
    }
    
    .status-value {
      display: flex;
      align-items: center;
      flex: 1;
    }
    
    .settings-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .setting-row {
      display: flex;
      flex-direction: column;
    }
    
    .setting-label {
      font-weight: 500;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
    }
    
    .setting-label input[type="checkbox"] {
      margin-right: 0.5rem;
    }
    
    .setting-description {
      font-size: 0.875rem;
      color: #718096;
    }
    
    .setting-input {
      width: 100%;
    }
    
    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    
    /* Minimal Control Panel */
    .realtime-control-panel {
      background-color: #f7fafc;
      border-radius: 0.375rem;
      padding: 0.75rem;
      margin-bottom: 1rem;
    }
    
    .realtime-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .realtime-status-indicator {
      display: flex;
      align-items: center;
    }
    
    .realtime-minimal-panel {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
    }
    
    /* Notification Styles */
    .notification-container {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 350px;
    }
    
    .notification {
      background-color: white;
      border-radius: 0.375rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 0.75rem;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      animation: slide-in 0.3s ease-out;
      border-left: 4px solid #4299e1;
    }
    
    .notification-content-added {
      border-left-color: #48bb78;
    }
    
    .notification-content-updated {
      border-left-color: #4299e1;
    }
    
    .notification-content-deleted {
      border-left-color: #f56565;
    }
    
    .notification-system {
      border-left-color: #805ad5;
    }
    
    .notification-icon {
      color: #4299e1;
      font-size: 1.25rem;
      line-height: 1;
    }
    
    .notification-content-added .notification-icon {
      color: #48bb78;
    }
    
    .notification-content-updated .notification-icon {
      color: #4299e1;
    }
    
    .notification-content-deleted .notification-icon {
      color: #f56565;
    }
    
    .notification-system .notification-icon {
      color: #805ad5;
    }
    
    .notification-content {
      flex: 1;
    }
    
    .notification-title {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    
    .notification-message {
      font-size: 0.875rem;
      color: #4a5568;
    }
    
    .notification-close {
      background: none;
      border: none;
      color: #a0aec0;
      cursor: pointer;
      font-size: 0.875rem;
      padding: 0.25rem;
      margin: -0.25rem;
    }
    
    .notification-close:hover {
      color: #4a5568;
    }
    
    .notification-hide {
      animation: slide-out 0.3s ease-in;
      opacity: 0;
    }
    
    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    
    /* Responsive Adjustments */
    @media (min-width: 768px) {
      .settings-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .status-row {
        display: grid;
        grid-template-columns: 30% 1fr auto;
        gap: 1rem;
      }
    }
  `;
  
  // Add styles to document
  document.head.appendChild(styleElement);
}

export default integrateRealtimeUpdates;