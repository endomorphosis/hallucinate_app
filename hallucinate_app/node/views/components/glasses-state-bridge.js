/**
 * Dashboard-to-Glasses State Bridge
 * 
 * Connects the hallucinate_app Electron dashboard views to the Meta Glasses
 * display via WebSocket. Each dashboard pushes state updates that the glasses
 * control plane uses to update display regions in real-time.
 * 
 * Usage in any dashboard HTML:
 *   <script src="components/glasses-state-bridge.js"></script>
 *   <script>
 *     const bridge = new GlassesStateBridge('ipfs-kit');
 *     bridge.pushState({ pin_count: 42, status: 'connected' });
 *   </script>
 */

class GlassesStateBridge {
  constructor(appId, options = {}) {
    this.appId = appId;
    this.wsUrl = options.wsUrl || 'ws://localhost:8765/glasses/state';
    this.reconnectMs = options.reconnectMs || 3000;
    this.batchIntervalMs = options.batchIntervalMs || 200;
    this.ws = null;
    this.connected = false;
    this.pendingUpdates = {};
    this.batchTimer = null;
    this.listeners = [];
    
    this._connect();
  }

  /** Push state updates to the glasses display */
  pushState(updates) {
    Object.assign(this.pendingUpdates, updates);
    this._scheduleBatch();
  }

  /** Push a single key-value state update */
  setState(key, value) {
    this.pendingUpdates[key] = value;
    this._scheduleBatch();
  }

  /** Send an event to the glasses (e.g., 'notification', 'action_complete') */
  sendEvent(eventType, payload = {}) {
    this._send({
      type: 'event',
      appId: this.appId,
      event: eventType,
      payload,
      timestamp: Date.now(),
    });
  }

  /** Subscribe to incoming commands from glasses (e.g., voice commands) */
  onCommand(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /** Get connection status */
  get isConnected() {
    return this.connected;
  }

  /** Disconnect and clean up */
  destroy() {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _connect() {
    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => {
        this.connected = true;
        // Announce this dashboard to the glasses control plane
        this._send({
          type: 'register',
          appId: this.appId,
          capabilities: this._getCapabilities(),
          timestamp: Date.now(),
        });
        console.log(`[GlassesStateBridge] Connected: ${this.appId}`);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.warn('[GlassesStateBridge] Invalid message:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        console.log(`[GlassesStateBridge] Disconnected, reconnecting in ${this.reconnectMs}ms...`);
        setTimeout(() => this._connect(), this.reconnectMs);
      };

      this.ws.onerror = (err) => {
        console.warn('[GlassesStateBridge] WebSocket error:', err.message || err);
      };
    } catch (e) {
      // WebSocket not available (e.g., during tests)
      console.warn('[GlassesStateBridge] WebSocket unavailable, running in offline mode');
    }
  }

  _send(msg) {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _scheduleBatch() {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this._flushBatch();
      this.batchTimer = null;
    }, this.batchIntervalMs);
  }

  _flushBatch() {
    if (Object.keys(this.pendingUpdates).length === 0) return;
    
    this._send({
      type: 'state_update',
      appId: this.appId,
      updates: { ...this.pendingUpdates },
      timestamp: Date.now(),
    });
    
    this.pendingUpdates = {};
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'command':
        // Voice/gesture command from glasses targeting this dashboard
        for (const listener of this.listeners) {
          try { listener(msg); } catch (e) { console.error('[GlassesStateBridge] Listener error:', e); }
        }
        break;
      case 'focus_change':
        // Glasses user focused on a different action
        document.dispatchEvent(new CustomEvent('glasses-focus', { detail: msg }));
        break;
      case 'activate':
        // Glasses user activated an action
        document.dispatchEvent(new CustomEvent('glasses-activate', { detail: msg }));
        break;
      case 'ping':
        this._send({ type: 'pong', appId: this.appId, timestamp: Date.now() });
        break;
    }
  }

  _getCapabilities() {
    return {
      hasState: true,
      hasActions: true,
      supportsVoice: true,
      supportsBidirectional: true,
      dashboardType: this.appId,
    };
  }
}

// ---------------------------------------------------------------------------
// Pre-configured bridges for IPFS dashboards
// ---------------------------------------------------------------------------

class IPFSKitGlassesBridge extends GlassesStateBridge {
  constructor(options = {}) {
    super('ipfs-explorer', options);
  }

  /** Convenience: push pin list state */
  updatePins(pins) {
    this.pushState({
      pin_count: pins.length,
      items: pins.map(p => `📌 ${p.cid?.slice(0, 12)}...`).join('\n'),
      connection_status: 'Connected to IPFS Kit',
    });
  }

  /** Convenience: push add result */
  notifyAdded(cid, size) {
    this.sendEvent('notification', {
      priority: 'normal',
      title: `Added ${cid.slice(0, 16)}...`,
      body: `Size: ${size} bytes`,
    });
  }
}

class IPFSDatasetsGlassesBridge extends GlassesStateBridge {
  constructor(options = {}) {
    super('datasets-browser', options);
  }

  /** Push dataset list */
  updateDatasets(datasets) {
    this.pushState({
      items: datasets.map(d => `📊 ${d.name || d}`).join('\n'),
      connection_status: `${datasets.length} datasets available`,
    });
  }

  /** Push search results */
  updateSearchResults(results) {
    this.pushState({
      items: results.map(r => `🔍 ${r.title || r.name || r}`).join('\n'),
      connection_status: `${results.length} results found`,
    });
  }
}

class IPFSAccelerateGlassesBridge extends GlassesStateBridge {
  constructor(options = {}) {
    super('accelerate-panel', options);
  }

  /** Push hardware metrics */
  updateMetrics(metrics) {
    this.pushState({
      throughput: metrics.throughput,
      utilization: metrics.utilization,
      gpus: JSON.stringify(metrics.gpus || []),
      connection_status: `GPU utilization: ${metrics.utilization || 0}%`,
    });
  }

  /** Push inference result */
  notifyInference(model, latencyMs) {
    this.sendEvent('notification', {
      priority: 'low',
      title: `Inference: ${model}`,
      body: `Latency: ${latencyMs}ms`,
    });
  }
}

// Export for use in hallucinate_app dashboards
if (typeof window !== 'undefined') {
  window.GlassesStateBridge = GlassesStateBridge;
  window.IPFSKitGlassesBridge = IPFSKitGlassesBridge;
  window.IPFSDatasetsGlassesBridge = IPFSDatasetsGlassesBridge;
  window.IPFSAccelerateGlassesBridge = IPFSAccelerateGlassesBridge;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GlassesStateBridge, IPFSKitGlassesBridge, IPFSDatasetsGlassesBridge, IPFSAccelerateGlassesBridge };
}
