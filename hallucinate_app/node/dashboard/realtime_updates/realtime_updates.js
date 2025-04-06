/**
 * Real-Time Updates Module for PyArrow Content Index Dashboard
 * 
 * Provides WebSocket-based notifications for metadata changes, visual indicators
 * for changing items, and background refresh functionality.
 */

class RealtimeUpdates {
  /**
   * Initialize the real-time updates module
   * @param {Object} options Configuration options
   * @param {Object} options.electronAPI Electron API for IPC communication
   * @param {Object} options.eventBus Event bus for dashboard communication
   * @param {string} options.wsEndpoint WebSocket endpoint URL
   * @param {number} options.reconnectInterval Reconnection interval in ms (default: 5000)
   * @param {number} options.heartbeatInterval Heartbeat interval in ms (default: 30000)
   * @param {number} options.bgRefreshInterval Background refresh interval in ms (default: 60000)
   */
  constructor(options = {}) {
    this.electronAPI = options.electronAPI;
    this.eventBus = options.eventBus;
    this.wsEndpoint = options.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws';
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    this.bgRefreshInterval = options.bgRefreshInterval || 60000;
    
    // Authentication
    this.authManager = options.authManager || null;
    this.authToken = options.authToken || null;
    this.authRequired = options.authRequired !== false;
    this.authAttempted = false;
    this.authSuccess = false;
    
    // Observability and metrics
    this.metricsEnabled = options.metricsEnabled !== false;
    this.metricsUpdateInterval = options.metricsUpdateInterval || 30000;
    this.metrics = {
      connected: false,
      connectAttempts: 0,
      connectSuccesses: 0,
      connectFailures: 0,
      messagesSent: 0,
      messagesReceived: 0,
      notificationsReceived: 0,
      reconnectAttempts: 0,
      lastHeartbeat: null,
      errors: [],
      rateLimitsExceeded: 0
    };
    
    this.websocket = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.bgRefreshTimer = null;
    this.metricsTimer = null;
    
    this.connected = false;
    this.pendingReconnect = false;
    this.updateQueue = [];
    
    // Flags and state information
    this.autoReconnect = true;
    this.notificationsEnabled = true;
    this.visualIndicatorsEnabled = true;
    this.backgroundRefreshEnabled = true;
    
    // Track changed items for visual indicators
    this.changedItems = new Map();
    this.lastUpdateTime = Date.now();
    
    // Notification tracking
    this.processedNotifications = new Set();
    
    // Bind methods to maintain 'this' context
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.reconnect = this.reconnect.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onError = this.onError.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onOpen = this.onOpen.bind(this);
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
    this.startBackgroundRefresh = this.startBackgroundRefresh.bind(this);
    this.stopBackgroundRefresh = this.stopBackgroundRefresh.bind(this);
    this.refreshDashboard = this.refreshDashboard.bind(this);
    this.processNotification = this.processNotification.bind(this);
    this.handleContentUpdated = this.handleContentUpdated.bind(this);
    this.updateVisualIndicators = this.updateVisualIndicators.bind(this);
    this.clearVisualIndicators = this.clearVisualIndicators.bind(this);
  }
  
  /**
   * Initialize and connect to the WebSocket server
   * @returns {Promise<boolean>} Connection success status
   */
  async init() {
    try {
      console.info('Initializing real-time updates module');
      
      // Create event listeners for the dashboard
      if (this.eventBus) {
        this.eventBus.on('realtime-updates-toggle', (enabled) => {
          if (enabled) {
            this.connect();
          } else {
            this.disconnect();
          }
        });
        
        this.eventBus.on('notifications-toggle', (enabled) => {
          this.notificationsEnabled = enabled;
        });
        
        this.eventBus.on('visual-indicators-toggle', (enabled) => {
          this.visualIndicatorsEnabled = enabled;
          if (!enabled) {
            this.clearVisualIndicators();
          }
        });
        
        this.eventBus.on('background-refresh-toggle', (enabled) => {
          this.backgroundRefreshEnabled = enabled;
          if (enabled) {
            this.startBackgroundRefresh();
          } else {
            this.stopBackgroundRefresh();
          }
        });
        
        this.eventBus.on('content-displayed', () => {
          // When content is displayed, update visual indicators
          if (this.visualIndicatorsEnabled) {
            this.updateVisualIndicators();
          }
        });
        
        this.eventBus.on('manual-refresh', () => {
          // Reset the last update time when manually refreshed
          this.lastUpdateTime = Date.now();
          
          // Clear visual indicators after manual refresh
          this.clearVisualIndicators();
        });
      }
      
      // Start background refresh if enabled
      if (this.backgroundRefreshEnabled) {
        this.startBackgroundRefresh();
      }
      
      // Connect to WebSocket
      await this.connect();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize real-time updates module:', error);
      return false;
    }
  }
  
  /**
   * Get authentication token either from provided token or from auth manager
   * @returns {Promise<string|null>} Authentication token or null if not available
   */
  async getAuthToken() {
    // If token is already available, use it
    if (this.authToken) {
      return this.authToken;
    }
    
    // If auth manager is available, try to get a token
    if (this.authManager && typeof this.authManager.getSelfSignedToken === 'function') {
      try {
        // Get token with pyarrow-index:read capability
        this.authToken = await this.authManager.getSelfSignedToken('pyarrow-index:read');
        console.info('Obtained authentication token from auth manager');
        return this.authToken;
      } catch (error) {
        console.warn('Failed to get authentication token:', error);
        return null;
      }
    }
    
    return null;
  }
  
  /**
   * Connect to the WebSocket server
   * @returns {Promise<boolean>} Connection success status
   */
  async connect() {
    return new Promise(async (resolve, reject) => {
      try {
        if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
          resolve(true);
          return;
        }
        
        // Update metrics
        if (this.metricsEnabled) {
          this.metrics.connectAttempts++;
        }
        
        console.info(`Connecting to WebSocket at ${this.wsEndpoint}`);
        
        // Get auth token if required and not already provided
        if (this.authRequired && !this.authToken) {
          this.authToken = await this.getAuthToken();
          
          if (!this.authToken && this.authRequired) {
            console.warn('Authentication required but no token available');
            // Continue anyway, server will reject if strict auth is enabled
          }
        }
        
        // Create WebSocket connection
        this.websocket = new WebSocket(this.wsEndpoint);
        
        // Set up timeout for connection
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            console.warn('WebSocket connection timed out');
            this.websocket.close();
            
            // Update metrics
            if (this.metricsEnabled) {
              this.metrics.connectFailures++;
              this.metrics.errors.push({
                time: Date.now(),
                type: 'connection_timeout',
                message: 'Connection timed out'
              });
              // Keep only the last 10 errors
              if (this.metrics.errors.length > 10) {
                this.metrics.errors.shift();
              }
            }
            
            reject(new Error('Connection timed out'));
          }
        }, 10000); // 10 seconds timeout
        
        // Event handlers
        this.websocket.addEventListener('open', async (event) => {
          clearTimeout(connectionTimeout);
          
          // If authentication is required, send auth message first
          if (this.authRequired && this.authToken) {
            this.authAttempted = true;
            
            try {
              // Send authentication message
              this.sendMessage({
                type: 'auth',
                token: this.authToken
              });
              
              // Wait for auth response before considering connection open
              // The auth result will be handled in the message handler
              // We'll resolve in the onOpen handler after verifying auth
              this.onOpen(event);
              resolve(true);
            } catch (error) {
              console.error('Authentication error:', error);
              this.authSuccess = false;
              
              // Update metrics
              if (this.metricsEnabled) {
                this.metrics.connectFailures++;
                this.metrics.errors.push({
                  time: Date.now(),
                  type: 'auth_error',
                  message: error.message
                });
                // Keep only the last 10 errors
                if (this.metrics.errors.length > 10) {
                  this.metrics.errors.shift();
                }
              }
              
              reject(new Error('Authentication failed'));
            }
          } else {
            // No auth required, just open the connection
            this.onOpen(event);
            resolve(true);
          }
        });
        
        this.websocket.addEventListener('message', this.onMessage);
        this.websocket.addEventListener('error', (event) => {
          clearTimeout(connectionTimeout);
          this.onError(event);
          
          // Update metrics
          if (this.metricsEnabled) {
            this.metrics.connectFailures++;
            this.metrics.errors.push({
              time: Date.now(),
              type: 'connection_error',
              message: event.message || 'WebSocket connection error'
            });
            // Keep only the last 10 errors
            if (this.metrics.errors.length > 10) {
              this.metrics.errors.shift();
            }
          }
          
          reject(new Error('WebSocket connection error'));
        });
        
        this.websocket.addEventListener('close', this.onClose);
        
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        
        // Update metrics
        if (this.metricsEnabled) {
          this.metrics.connectFailures++;
          this.metrics.errors.push({
            time: Date.now(),
            type: 'connection_exception',
            message: error.message
          });
          // Keep only the last 10 errors
          if (this.metrics.errors.length > 10) {
            this.metrics.errors.shift();
          }
        }
        
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from the WebSocket server
   * @param {boolean} cleanup Whether to perform full cleanup of resources
   */
  disconnect(cleanup = false) {
    console.info('Disconnecting from WebSocket');
    
    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Stop metrics tracking
    this.stopMetricsTracking();
    
    this.autoReconnect = false;
    
    // Close connection if open
    if (this.websocket) {
      // Check if connection is open or connecting
      if (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING) {
        this.websocket.close(1000, 'Client disconnected');
      }
      this.websocket = null;
    }
    
    this.connected = false;
    this.updateConnectionStatus(false);
    
    // Full cleanup if requested
    if (cleanup) {
      this.updateQueue = [];
      this.changedItems.clear();
      this.processedNotifications.clear();
      
      // Reset metrics
      if (this.metricsEnabled) {
        this.metrics = {
          connected: false,
          connectAttempts: 0,
          connectSuccesses: 0,
          connectFailures: 0,
          messagesSent: 0,
          messagesReceived: 0,
          notificationsReceived: 0,
          reconnectAttempts: 0,
          lastHeartbeat: null,
          errors: [],
          rateLimitsExceeded: 0
        };
      }
      
      // Reset auth status
      this.authSuccess = false;
      this.authAttempted = false;
      this.authToken = null;
      
      console.info('Real-time updates resources cleaned up');
    }
  }
  
  /**
   * Perform complete cleanup and release all resources
   */
  cleanup() {
    this.disconnect(true);
    
    // Remove all event listeners
    if (this.eventBus) {
      // No direct way to remove all listeners, but we can null the reference
      this.eventBus = null;
    }
    
    console.info('Real-time updates module cleaned up');
  }
  
  /**
   * Reconnect to the WebSocket server
   */
  reconnect() {
    if (this.pendingReconnect) {
      return;
    }
    
    this.pendingReconnect = true;
    console.info(`Reconnecting to WebSocket in ${this.reconnectInterval}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.pendingReconnect = false;
      
      try {
        await this.connect();
      } catch (error) {
        console.warn('Reconnection failed:', error);
        // Schedule another reconnection attempt
        this.reconnect();
      }
    }, this.reconnectInterval);
  }
  
  /**
   * Start metrics tracking
   */
  startMetricsTracking() {
    if (!this.metricsEnabled) {
      return;
    }
    
    // Clear existing timer if any
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    // Start metrics update interval
    this.metricsTimer = setInterval(() => {
      try {
        // Update connection status
        this.metrics.connected = this.connected;
        
        // Emit metrics update event
        if (this.eventBus) {
          this.eventBus.emit('metrics-update', {
            timestamp: new Date().toISOString(),
            metrics: { ...this.metrics }  // Send a copy to avoid modification by handlers
          });
        }
      } catch (error) {
        console.error('Error updating metrics:', error);
      }
    }, this.metricsUpdateInterval);
    
    console.debug('Metrics tracking started');
  }
  
  /**
   * Stop metrics tracking
   */
  stopMetricsTracking() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
      console.debug('Metrics tracking stopped');
    }
  }
  
  /**
   * Handle WebSocket open event
   * @param {Event} event WebSocket open event
   */
  onOpen(event) {
    console.info('WebSocket connected');
    this.connected = true;
    this.pendingReconnect = false;
    
    // Update metrics
    if (this.metricsEnabled) {
      this.metrics.connectSuccesses++;
      this.metrics.connected = true;
      this.metrics.lastHeartbeat = Date.now();
      
      // Start metrics tracking if not already running
      this.startMetricsTracking();
    }
    
    // Start heartbeat
    this.heartbeatTimer = setInterval(this.sendHeartbeat, this.heartbeatInterval);
    
    // Send any pending updates
    while (this.updateQueue.length > 0) {
      const message = this.updateQueue.shift();
      this.sendMessage(message);
    }
    
    // Update connection status
    this.updateConnectionStatus(true);
    
    // Emit connection event
    if (this.eventBus) {
      this.eventBus.emit('websocket-connected', {
        endpoint: this.wsEndpoint,
        timestamp: new Date().toISOString(),
        authenticated: this.authSuccess,
        authRequired: this.authRequired
      });
    }
  }
  
  /**
   * Handle WebSocket message event
   * @param {MessageEvent} event WebSocket message event
   */
  onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      // Update metrics
      if (this.metricsEnabled) {
        this.metrics.messagesReceived++;
      }
      
      // Handle different message types
      switch (data.type) {
        case 'heartbeat':
          // Just log heartbeats and update metrics
          console.debug('Received heartbeat from server');
          if (this.metricsEnabled) {
            this.metrics.lastHeartbeat = Date.now();
          }
          return;
          
        case 'auth_success':
          // Handle successful authentication
          console.info('Authentication successful:', data.message);
          this.authSuccess = true;
          this.authAttempted = true;
          
          // Emit auth success event
          if (this.eventBus) {
            this.eventBus.emit('auth-success', {
              timestamp: new Date().toISOString(),
              principal: data.principal
            });
          }
          return;
          
        case 'error':
          // Handle error messages
          console.error('Received error from server:', data.error, data.message);
          
          // Special handling for auth errors
          if (data.error === 'auth_required' || data.error === 'invalid_token') {
            this.authSuccess = false;
            this.authAttempted = true;
            
            // Emit auth error event
            if (this.eventBus) {
              this.eventBus.emit('auth-error', {
                timestamp: new Date().toISOString(),
                error: data.error,
                message: data.message
              });
            }
          }
          
          // Check for rate limiting
          if (data.error === 'rate_limit_exceeded') {
            if (this.metricsEnabled) {
              this.metrics.rateLimitsExceeded++;
            }
            
            // Emit rate limit event
            if (this.eventBus) {
              this.eventBus.emit('rate-limit-exceeded', {
                timestamp: new Date().toISOString(),
                message: data.message
              });
            }
          }
          
          // Update metrics
          if (this.metricsEnabled) {
            this.metrics.errors.push({
              time: Date.now(),
              type: `server_${data.error || 'unknown'}`,
              message: data.message || 'Server error'
            });
            // Keep only the last 10 errors
            if (this.metrics.errors.length > 10) {
              this.metrics.errors.shift();
            }
          }
          return;
          
        default:
          // Process content notifications
          console.info('Received WebSocket message:', data);
          
          // Update metrics for notifications
          if (this.metricsEnabled) {
            this.metrics.notificationsReceived++;
          }
          
          // Check if we've already processed this notification (by ID)
          if (data.data && data.data.id && this.processedNotifications.has(data.data.id)) {
            console.debug(`Skipping duplicate notification with ID ${data.data.id}`);
            return;
          }
          
          // Process the notification
          this.processNotification(data);
          
          // Remember processed notification IDs to avoid duplicates
          if (data.data && data.data.id) {
            this.processedNotifications.add(data.data.id);
            
            // Limit the size of processed notifications set
            if (this.processedNotifications.size > 1000) {
              // Remove oldest entries (convert to array, sort by timestamp if available, remove oldest)
              const oldestId = Array.from(this.processedNotifications)[0];
              this.processedNotifications.delete(oldestId);
            }
          }
      }
      
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      
      // Update metrics
      if (this.metricsEnabled) {
        this.metrics.errors.push({
          time: Date.now(),
          type: 'message_processing_error',
          message: error.message
        });
        // Keep only the last 10 errors
        if (this.metrics.errors.length > 10) {
          this.metrics.errors.shift();
        }
      }
    }
  }
  
  /**
   * Handle WebSocket error event
   * @param {Event} event WebSocket error event
   */
  onError(event) {
    console.error('WebSocket error:', event);
    
    // Update connection status
    this.updateConnectionStatus(false, 'error');
    
    // Emit error event
    if (this.eventBus) {
      this.eventBus.emit('websocket-error', {
        timestamp: new Date().toISOString(),
        error: event.message || 'Unknown WebSocket error'
      });
    }
  }
  
  /**
   * Handle WebSocket close event
   * @param {CloseEvent} event WebSocket close event
   */
  onClose(event) {
    console.info(`WebSocket closed: Code ${event.code} ${event.reason ? `(${event.reason})` : ''}`);
    this.connected = false;
    
    // Reset authentication status if connection was closed
    if (event.code !== 1000) { // 1000 is normal closure
      this.authSuccess = false;
    }
    
    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Update metrics
    if (this.metricsEnabled) {
      this.metrics.connected = false;
      
      // Add error for abnormal closure
      if (event.code !== 1000 && event.code !== 1001) { // 1001 is going away
        this.metrics.errors.push({
          time: Date.now(),
          type: 'connection_closed',
          message: `Connection closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}` 
        });
        // Keep only the last 10 errors
        if (this.metrics.errors.length > 10) {
          this.metrics.errors.shift();
        }
      }
    }
    
    // Update connection status
    this.updateConnectionStatus(false, 'closed');
    
    // Emit close event
    if (this.eventBus) {
      this.eventBus.emit('websocket-closed', {
        code: event.code,
        reason: event.reason,
        timestamp: new Date().toISOString(),
        authenticated: this.authSuccess
      });
    }
    
    // Reconnect if auto-reconnect is enabled
    if (this.autoReconnect) {
      this.reconnect();
      
      // Update metrics
      if (this.metricsEnabled) {
        this.metrics.reconnectAttempts++;
      }
    } else {
      // Stop metrics tracking if we're not reconnecting
      this.stopMetricsTracking();
    }
  }
  
  /**
   * Send a heartbeat message to keep the connection alive
   */
  sendHeartbeat() {
    if (this.connected && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.sendMessage({ type: 'heartbeat' });
    }
  }
  
  /**
   * Send a message through the WebSocket connection
   * @param {Object} message Message object to send
   */
  sendMessage(message) {
    if (!this.connected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      // Queue the message for later if not connected
      this.updateQueue.push(message);
      return;
    }
    
    try {
      const messageString = JSON.stringify(message);
      this.websocket.send(messageString);
      
      // Update metrics
      if (this.metricsEnabled) {
        this.metrics.messagesSent++;
      }
      
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      
      // Queue the message for retry
      this.updateQueue.push(message);
      
      // Update metrics
      if (this.metricsEnabled) {
        this.metrics.errors.push({
          time: Date.now(),
          type: 'message_send_error',
          message: error.message
        });
        // Keep only the last 10 errors
        if (this.metrics.errors.length > 10) {
          this.metrics.errors.shift();
        }
      }
    }
  }
  
  /**
   * Update the connection status indicator
   * @param {boolean} connected Whether the WebSocket is connected
   * @param {string} reason Reason for disconnection, if applicable
   */
  updateConnectionStatus(connected, reason = '') {
    // Update DOM elements
    const statusIndicator = document.getElementById('realtime-status');
    const statusText = document.getElementById('realtime-status-text');
    
    if (statusIndicator) {
      if (connected) {
        statusIndicator.className = 'status-indicator connected';
      } else if (reason === 'error') {
        statusIndicator.className = 'status-indicator error';
      } else {
        statusIndicator.className = 'status-indicator disconnected';
      }
    }
    
    if (statusText) {
      if (connected) {
        statusText.textContent = 'Connected';
      } else if (reason === 'error') {
        statusText.textContent = 'Connection Error';
      } else if (this.pendingReconnect) {
        statusText.textContent = 'Reconnecting...';
      } else {
        statusText.textContent = 'Disconnected';
      }
    }
  }
  
  /**
   * Start background refresh timer
   */
  startBackgroundRefresh() {
    if (this.bgRefreshTimer) {
      clearInterval(this.bgRefreshTimer);
    }
    
    this.bgRefreshTimer = setInterval(this.refreshDashboard, this.bgRefreshInterval);
  }
  
  /**
   * Stop background refresh timer
   */
  stopBackgroundRefresh() {
    if (this.bgRefreshTimer) {
      clearInterval(this.bgRefreshTimer);
      this.bgRefreshTimer = null;
    }
  }
  
  /**
   * Refresh dashboard data in the background
   */
  async refreshDashboard() {
    if (!this.backgroundRefreshEnabled) {
      return;
    }
    
    console.debug('Performing background refresh');
    
    // If WebSocket is disconnected and we have changes, do a full refresh
    if (!this.connected && this.changedItems.size > 0) {
      console.info('WebSocket disconnected with pending changes, performing full refresh');
      
      if (this.eventBus) {
        this.eventBus.emit('background-refresh', {
          timestamp: new Date().toISOString(),
          fullRefresh: true
        });
      }
      
      // Clear changed items after refresh
      this.changedItems.clear();
      return;
    }
    
    // If we have changes, refresh only the changed items
    if (this.changedItems.size > 0) {
      console.info(`Refreshing ${this.changedItems.size} changed items`);
      
      if (this.eventBus) {
        this.eventBus.emit('background-refresh', {
          timestamp: new Date().toISOString(),
          changedItems: Array.from(this.changedItems.keys()),
          fullRefresh: false
        });
      }
    }
  }
  
  /**
   * Process a notification received from the WebSocket
   * @param {Object} notification Notification object
   */
  processNotification(notification) {
    if (!notification || !notification.type) {
      console.warn('Received invalid notification format:', notification);
      return;
    }
    
    switch (notification.type) {
      case 'content-added':
        this.handleContentUpdated(notification.data, 'added');
        break;
      
      case 'content-updated':
        this.handleContentUpdated(notification.data, 'updated');
        break;
      
      case 'content-deleted':
        this.handleContentUpdated(notification.data, 'deleted');
        break;
      
      case 'content-synced':
        // Handle sync notification
        if (this.eventBus) {
          this.eventBus.emit('content-synced', notification.data);
        }
        break;
      
      case 'system':
        // Handle system notifications
        console.info('System notification:', notification.message);
        if (this.eventBus) {
          this.eventBus.emit('system-notification', notification);
        }
        break;
      
      default:
        console.warn('Unknown notification type:', notification.type);
    }
    
    // Show notification to user if enabled
    if (this.notificationsEnabled) {
      this.showNotification(notification);
    }
    
    // Update last update time
    this.lastUpdateTime = Date.now();
  }
  
  /**
   * Handle content updated notification
   * @param {Object} content Content data
   * @param {string} action Update action (added, updated, deleted)
   */
  handleContentUpdated(content, action) {
    if (!content || !content.cid) {
      console.warn(`Received invalid ${action} content:`, content);
      return;
    }
    
    console.info(`Content ${action}: ${content.cid}`);
    
    // Add to changed items
    this.changedItems.set(content.cid, {
      content,
      action,
      timestamp: Date.now(),
      notificationId: content.id || null
    });
    
    // Maintain a limited size for changedItems (max 1000 items)
    if (this.changedItems.size > 1000) {
      // Remove oldest items
      const items = Array.from(this.changedItems.entries());
      items.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove the oldest 10% of items
      const removeCount = Math.ceil(items.length * 0.1);
      for (let i = 0; i < removeCount; i++) {
        if (items[i]) {
          this.changedItems.delete(items[i][0]);
        }
      }
    }
    
    // Update visual indicators if enabled
    if (this.visualIndicatorsEnabled) {
      this.updateVisualIndicators();
    }
    
    // Emit content updated event
    if (this.eventBus) {
      this.eventBus.emit('content-updated', {
        content,
        action,
        timestamp: new Date().toISOString(),
        notificationId: content.id || null
      });
    }
  }
  
  /**
   * Update visual indicators for changed content
   */
  updateVisualIndicators() {
    if (!this.visualIndicatorsEnabled || this.changedItems.size === 0) {
      return;
    }
    
    // Update table rows with visual indicators
    const tables = [
      document.getElementById('recent-content-table'),
      document.getElementById('content-browser-table')
    ];
    
    tables.forEach(table => {
      if (!table) return;
      
      // Get all rows with CID data
      const rows = table.querySelectorAll('tr[data-cid]');
      
      rows.forEach(row => {
        const cid = row.getAttribute('data-cid');
        const changeInfo = this.changedItems.get(cid);
        
        if (!changeInfo) {
          // No change for this item, remove indicator if exists
          row.classList.remove('content-added', 'content-updated', 'content-deleted');
          return;
        }
        
        // Add appropriate class based on action
        row.classList.remove('content-added', 'content-updated', 'content-deleted');
        row.classList.add(`content-${changeInfo.action}`);
        
        // Add animation effect for newly changed items
        const timeSinceChange = Date.now() - changeInfo.timestamp;
        if (timeSinceChange < 5000) { // 5 seconds
          row.classList.add('animate-change');
          
          // Remove animation class after animation completes
          setTimeout(() => {
            row.classList.remove('animate-change');
          }, 2000);
        }
      });
    });
    
    // Update stats counters to indicate changes
    const changedCounters = new Map();
    
    this.changedItems.forEach(changeInfo => {
      const counter = changedCounters.get(changeInfo.action) || 0;
      changedCounters.set(changeInfo.action, counter + 1);
    });
    
    // Update counter display
    const countersContainer = document.getElementById('realtime-counters');
    if (countersContainer) {
      countersContainer.innerHTML = '';
      
      changedCounters.forEach((count, action) => {
        const badge = document.createElement('div');
        badge.className = `badge badge-${action === 'added' ? 'green' : action === 'updated' ? 'blue' : 'red'}`;
        badge.innerHTML = `${action}: ${count}`;
        countersContainer.appendChild(badge);
      });
      
      // Show counters container
      countersContainer.style.display = changedCounters.size > 0 ? 'flex' : 'none';
    }
  }
  
  /**
   * Clear all visual indicators for changed content
   */
  clearVisualIndicators() {
    // Clear changed items
    this.changedItems.clear();
    
    // Remove all indicator classes from table rows
    const tables = [
      document.getElementById('recent-content-table'),
      document.getElementById('content-browser-table')
    ];
    
    tables.forEach(table => {
      if (!table) return;
      
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        row.classList.remove('content-added', 'content-updated', 'content-deleted', 'animate-change');
      });
    });
    
    // Clear counters
    const countersContainer = document.getElementById('realtime-counters');
    if (countersContainer) {
      countersContainer.innerHTML = '';
      countersContainer.style.display = 'none';
    }
  }
  
  /**
   * Show a notification to the user
   * @param {Object} notification Notification object
   */
  showNotification(notification) {
    if (!this.notificationsEnabled) {
      return;
    }
    
    // Create notification element
    const notificationContainer = document.getElementById('notification-container') || this.createNotificationContainer();
    
    // Create notification element
    const notificationElement = document.createElement('div');
    notificationElement.className = `notification notification-${notification.type}`;
    
    // Set notification content
    let title = 'Notification';
    let message = '';
    let icon = 'info-circle';
    
    switch (notification.type) {
      case 'content-added':
        title = 'Content Added';
        message = `Added: ${notification.data.cid.substring(0, 16)}...`;
        icon = 'plus-circle';
        break;
      
      case 'content-updated':
        title = 'Content Updated';
        message = `Updated: ${notification.data.cid.substring(0, 16)}...`;
        icon = 'sync-alt';
        break;
      
      case 'content-deleted':
        title = 'Content Deleted';
        message = `Deleted: ${notification.data.cid.substring(0, 16)}...`;
        icon = 'trash-alt';
        break;
      
      case 'content-synced':
        title = 'Content Synchronized';
        message = `Synchronized ${notification.data.added || 0} added, ${notification.data.updated || 0} updated, ${notification.data.removed || 0} removed`;
        icon = 'exchange-alt';
        break;
      
      case 'system':
        title = 'System Notification';
        message = notification.message || 'System event occurred';
        icon = 'server';
        break;
      
      default:
        message = JSON.stringify(notification);
    }
    
    // Create notification content
    notificationElement.innerHTML = `
      <div class="notification-icon">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="notification-content">
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
      </div>
      <button class="notification-close">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // Add to container
    notificationContainer.appendChild(notificationElement);
    
    // Remove notification after timeout
    setTimeout(() => {
      notificationElement.classList.add('notification-hide');
      
      // Remove from DOM after fade out
      setTimeout(() => {
        notificationContainer.removeChild(notificationElement);
        
        // Remove container if empty
        if (notificationContainer.children.length === 0) {
          document.body.removeChild(notificationContainer);
        }
      }, 500);
    }, 5000);
    
    // Add close button functionality
    const closeButton = notificationElement.querySelector('.notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        notificationElement.classList.add('notification-hide');
        
        // Remove from DOM after fade out
        setTimeout(() => {
          if (notificationContainer.contains(notificationElement)) {
            notificationContainer.removeChild(notificationElement);
            
            // Remove container if empty
            if (notificationContainer.children.length === 0) {
              document.body.removeChild(notificationContainer);
            }
          }
        }, 500);
      });
    }
  }
  
  /**
   * Create container for notifications
   * @returns {HTMLElement} Notification container element
   */
  createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
  }
}

export default RealtimeUpdates;