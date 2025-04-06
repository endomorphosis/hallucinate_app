/**
 * Real-Time Collaboration Integration Module
 * 
 * Integrates real-time collaboration features into the PyArrow Content Index Dashboard
 * using WebSockets, WebRTC, and libp2p for robust peer-to-peer communication.
 * 
 * This module provides a unified interface for loading all real-time collaboration 
 * components and configuring them properly.
 */

import integrateRealtimeUpdates from './realtime_updates/realtime_integration.js';
import integrateP2PCommunication from './realtime_updates/p2p_integration.js';

/**
 * Load and integrate real-time collaboration features
 * 
 * @param {Object} dashboard Dashboard instance
 * @param {Object} options Configuration options
 * @param {Object} options.wsEndpoint WebSocket endpoint URL
 * @param {Object} options.eventBus Event bus for communication
 * @param {Object} options.config Configuration options
 * @returns {Object} Integration result
 */
async function loadRealtimeCollaboration(dashboard, options = {}) {
  try {
    console.info('Loading real-time collaboration features');
    
    if (!dashboard) {
      throw new Error('Dashboard instance is required');
    }
    
    // Define default configuration
    const config = {
      // WebSocket configuration
      wsEndpoint: options.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws',
      enableWebSocket: options.enableWebSocket !== false,
      
      // WebRTC configuration
      enableWebRTC: options.enableWebRTC !== false,
      iceServers: options.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ],
      
      // libp2p configuration
      enableLibp2p: options.enableLibp2p !== false,
      libp2pConfig: {
        enableWebRTC: options.enableWebRTC !== false,
        relayDiscovery: options.relayDiscovery !== false,
        pubsub: true,
        topic: options.topic || 'pyarrow-content-index-updates'
      },
      
      // General configuration
      autoConnect: options.autoConnect !== false,
      enableRealTimeUpdates: options.enableRealTimeUpdates !== false,
      enableNotifications: options.enableNotifications !== false,
      enableVisualIndicators: options.enableVisualIndicators !== false,
      enableBackgroundRefresh: options.enableBackgroundRefresh !== false,
      ...options.config
    };
    
    // Get or create event bus
    const eventBus = options.eventBus || dashboard.eventBus || createEventBus();
    
    // Stage 1: Initialize real-time updates via WebSocket
    const realtimeResult = integrateRealtimeUpdates(dashboard, {
      electronAPI: options.electronAPI || window.electronAPI,
      eventBus,
      wsEndpoint: config.wsEndpoint,
      autoConnect: config.autoConnect && config.enableWebSocket,
      enableNotifications: config.enableNotifications,
      enableVisualIndicators: config.enableVisualIndicators,
      enableBackgroundRefresh: config.enableBackgroundRefresh
    });
    
    // Check if real-time updates were successfully integrated
    if (!realtimeResult.success) {
      console.error('Failed to integrate real-time updates:', realtimeResult.error);
      return {
        success: false,
        error: realtimeResult.error,
        stage: 'websocket'
      };
    }
    
    // Set up event bus for all components
    dashboard.eventBus = eventBus;
    
    // Store real-time updates instance
    const realtimeUpdates = realtimeResult.realtimeUpdates;
    
    let p2pResult = { success: false };
    
    // Stage 2: Initialize P2P communication if enabled
    if (config.enableWebRTC || config.enableLibp2p) {
      p2pResult = integrateP2PCommunication(dashboard, {
        realtimeUpdates,
        eventBus,
        config: {
          iceServers: config.iceServers,
          libp2p: config.libp2pConfig,
          autoConnect: config.autoConnect,
          enableDiscovery: true
        }
      });
      
      if (!p2pResult.success) {
        console.warn('Failed to integrate P2P communication:', p2pResult.error);
        // Continue without P2P as it's not critical
      }
    }
    
    // Emit an event indicating successful integration
    eventBus.emit('realtime-collaboration-loaded', {
      websocket: realtimeResult.success,
      p2p: p2pResult.success,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      realtimeUpdates,
      p2p: p2pResult.success ? p2pResult.p2p : null,
      eventBus
    };
  } catch (error) {
    console.error('Failed to load real-time collaboration features:', error);
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

export default loadRealtimeCollaboration;