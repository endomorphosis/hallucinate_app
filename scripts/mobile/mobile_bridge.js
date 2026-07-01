/*
 * Hallucinate App — Mobile backend bridge
 *
 * The desktop (Electron) build runs the Python backends (ipfs_kit_py,
 * ipfs_datasets_py, ipfs_accelerate_py) and the SwissKnife static server
 * locally, and the dashboards reach them via hardcoded localhost URLs
 * (REST gateway on :8080, MCP++ JSON-RPC on :8014, SwissKnife static on
 * :8765) or, in a couple of places, via window.electronAPI IPC.
 *
 * On mobile there is no local Python runtime and no Electron, so those
 * localhost calls reach nothing. This bridge makes the EXACT SAME dashboard
 * code work unmodified by:
 *   1. Intercepting fetch()/WebSocket and rewriting backend localhost URLs to
 *      a user-configured REMOTE backend (set in settings.html, persisted in
 *      localStorage). SwissKnife static (:8765) is rewritten to the app's own
 *      bundled origin.
 *   2. Providing a minimal window.electronAPI polyfill that forwards the few
 *      direct IPC calls to the same remote backend over HTTP.
 *
 * It is a no-op on desktop/Electron (where window.electronAPI already exists),
 * so the same bundle is safe everywhere.
 */
(function () {
  'use strict';

  // If the real Electron preload bridge is present, this is the desktop app:
  // do nothing and let native IPC + local backends handle everything.
  var isElectron =
    (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.versions) ||
    (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || ''));
  if (isElectron) {
    return;
  }

  var LS = {
    base: 'hallucinateBackendUrl', // e.g. https://backend.example.com  (REST gateway, /v1/ipfs/*)
    mcp: 'hallucinateMcpUrl', // e.g. https://backend.example.com/mcp (MCP++ JSON-RPC); defaults to base
    port: 'handsfreePort', // dashboards read this for the REST port
  };

  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function trimSlash(u) {
    return (u || '').replace(/\/+$/, '');
  }

  // Configured remote REST backend base, e.g. "https://host:8080".
  function backendBase() {
    return trimSlash(read(LS.base) || '');
  }
  // Configured MCP++ JSON-RPC endpoint; falls back to base.
  function mcpBase() {
    var m = trimSlash(read(LS.mcp) || '');
    if (m) return m;
    return backendBase();
  }

  // Backend localhost ports used by the bundled dashboards.
  var REST_PORTS = ['8080']; // /v1/ipfs/* REST gateway (handsfreePort default)
  var MCP_PORTS = ['8014']; // MCP++ JSON-RPC
  var STATIC_PORTS = ['8765']; // SwissKnife static server -> the bundled app origin
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];

  function parse(url) {
    try {
      return new URL(url, window.location.href);
    } catch (e) {
      return null;
    }
  }

  function isLocalHost(h) {
    return LOCAL_HOSTS.indexOf(h) !== -1;
  }

  /*
   * Given an absolute/relative URL, return a possibly-rewritten URL string
   * pointing at the configured remote backend. Returns the original input if
   * no rewrite applies (so CDN/asset requests pass through untouched).
   */
  function rewrite(rawUrl) {
    var u = parse(rawUrl);
    if (!u) return rawUrl;
    if (!isLocalHost(u.hostname)) return rawUrl;

    var port = u.port || (u.protocol === 'https:' ? '443' : '80');

    // SwissKnife static server -> serve from the bundled app origin (relative).
    if (STATIC_PORTS.indexOf(port) !== -1) {
      return u.pathname + u.search + u.hash;
    }

    var target = '';
    if (MCP_PORTS.indexOf(port) !== -1) {
      target = mcpBase();
    } else if (REST_PORTS.indexOf(port) !== -1) {
      target = backendBase();
    } else {
      // Unknown localhost port — assume REST gateway if a backend is set.
      target = backendBase();
    }

    if (!target) {
      // No backend configured yet: leave as-is so the failure is visible.
      return rawUrl;
    }

    var t = parse(target);
    if (!t) return rawUrl;

    // For MCP JSON-RPC the configured endpoint may be a full path; POST to it.
    if (MCP_PORTS.indexOf(port) !== -1 && t.pathname && t.pathname !== '/') {
      return trimSlash(target) + u.search + u.hash;
    }
    // Otherwise preserve the original path (e.g. /v1/ipfs/status).
    return t.origin + u.pathname + u.search + u.hash;
  }

  // ---- fetch interception -------------------------------------------------
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch.bind(window);
    // Expose the un-rewritten fetch so the discovery layer can probe absolute
    // candidate URLs without the localhost->backend rewriting kicking in.
    window.__hlNativeFetch = origFetch;
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') {
          input = rewrite(input);
        } else if (input && typeof input.url === 'string') {
          var newUrl = rewrite(input.url);
          if (newUrl !== input.url) {
            input = new Request(newUrl, input);
          }
        }
      } catch (e) {
        /* fall through with original input */
      }
      return origFetch(input, init);
    };
  }

  // ---- WebSocket interception --------------------------------------------
  if (typeof window.WebSocket === 'function') {
    var OrigWS = window.WebSocket;
    function rewriteWs(rawUrl) {
      var httpish = String(rawUrl).replace(/^ws/i, 'http');
      var rewritten = rewrite(httpish);
      if (rewritten === httpish) return rawUrl;
      return rewritten.replace(/^http/i, 'ws');
    }
    var WSProxy = function (url, protocols) {
      try {
        url = rewriteWs(url);
      } catch (e) {
        /* keep original */
      }
      return protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    };
    WSProxy.prototype = OrigWS.prototype;
    WSProxy.CONNECTING = OrigWS.CONNECTING;
    WSProxy.OPEN = OrigWS.OPEN;
    WSProxy.CLOSING = OrigWS.CLOSING;
    WSProxy.CLOSED = OrigWS.CLOSED;
    window.WebSocket = WSProxy;
  }

  // ---- minimal electronAPI polyfill --------------------------------------
  // A few pages call window.electronAPI.* directly. Provide a thin shim that
  // forwards to the remote backend so those pages do not throw on mobile.
  function jsonFetch(u, init) {
    return window.fetch(u, init).then(function (r) { return r.json(); });
  }
  function restGet(path) {
    var base = backendBase();
    if (!base) return Promise.reject(new Error('No backend configured'));
    return jsonFetch(base + path);
  }
  function mcpRpc(method, params) {
    var ep = mcpBase();
    if (!ep) return Promise.reject(new Error('No MCP backend configured'));
    return jsonFetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: method, params: params || {} }),
    });
  }

  if (!window.electronAPI) {
    window.electronAPI = {
      platform: 'capacitor',
      versions: { node: '', chrome: '', electron: '' },
      isMobileBridge: true,
      ipfs: {
        status: function () { return restGet('/v1/ipfs/status'); },
      },
      daemon: {
        getAll: function () { return restGet('/v1/ipfs/endpoints').catch(function () { return []; }); },
        dashboardToolsList: function () { return mcpRpc('tools/list', {}); },
        dashboardToolsCall: function (daemonId, name, args) {
          return mcpRpc('tools/call', { name: name, arguments: args || {} });
        },
        checkHealth: function () { return restGet('/health').catch(function () { return { ok: false }; }); },
        start: function () { return Promise.resolve({ ok: false, reason: 'remote-managed' }); },
        stop: function () { return Promise.resolve({ ok: false, reason: 'remote-managed' }); },
      },
      window: { minimize: function () {}, maximize: function () {}, close: function () {} },
    };
  }

  // ---- floating nav (Home / Settings) ------------------------------------
  function injectNav() {
    if (document.getElementById('hl-mobile-nav')) return;
    var path = window.location.pathname;
    var onIndex = /\/(index\.html)?$/.test(path);
    var onSettings = /settings\.html$/.test(path);
    var nav = document.createElement('div');
    nav.id = 'hl-mobile-nav';
    nav.style.cssText =
      'position:fixed;right:10px;bottom:10px;z-index:2147483647;display:flex;gap:8px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    function btn(label, href) {
      var a = document.createElement('a');
      a.textContent = label;
      a.href = href;
      a.style.cssText =
        'background:rgba(20,20,20,.85);color:#fff;border:1px solid rgba(255,255,255,.25);' +
        'border-radius:20px;padding:8px 12px;font-size:13px;text-decoration:none;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.4);backdrop-filter:blur(4px);';
      return a;
    }
    if (!onIndex) nav.appendChild(btn('\u2302 Home', '/index.html'));
    if (!onSettings) nav.appendChild(btn('\u2699 Backend', '/settings.html'));
    document.body.appendChild(nav);
  }

  // ---- first-run prompt if no backend configured -------------------------
  function ensureConfigured() {
    if (backendBase()) return;
    if (/settings\.html$/.test(window.location.pathname)) return;
    try {
      if (window.sessionStorage && window.sessionStorage.getItem('hlBackendPromptDismissed')) return;
    } catch (e) {}
    var banner = document.createElement('div');
    banner.id = 'hl-mobile-nav-banner';
    banner.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#b8860b;color:#000;' +
      'padding:10px 14px;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    var msg = document.createElement('span');
    msg.textContent = 'No backend configured — searching the network…';
    var right = document.createElement('span');
    right.style.cssText = 'display:flex;gap:8px;align-items:center;';
    var disc = document.createElement('button');
    disc.textContent = 'Discover';
    disc.style.cssText = 'background:#000;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;white-space:nowrap;';
    disc.onclick = function () {
      disc.disabled = true;
      msg.textContent = 'Searching mDNS / DHT / pubsub / rendezvous…';
      window.HallucinateMobile.discover({ timeout: 4000 }).then(function (list) {
        if (list && list.length) {
          applyBackend(list[0].url);
          banner.remove();
          showAutoToast(list[0]);
        } else {
          msg.textContent = 'No backends found. Tap Configure to set one manually.';
          disc.disabled = false;
        }
      }).catch(function () {
        msg.textContent = 'Discovery failed. Tap Configure to set one manually.';
        disc.disabled = false;
      });
    };
    var go = document.createElement('a');
    go.textContent = 'Configure';
    go.href = '/settings.html';
    go.style.cssText = 'background:#000;color:#fff;border-radius:6px;padding:6px 10px;text-decoration:none;white-space:nowrap;';
    var x = document.createElement('button');
    x.textContent = '\u2715';
    x.style.cssText = 'background:transparent;border:none;font-size:16px;cursor:pointer;';
    x.onclick = function () {
      banner.remove();
      try { window.sessionStorage.setItem('hlBackendPromptDismissed', '1'); } catch (e) {}
    };
    right.appendChild(disc);
    right.appendChild(go);
    right.appendChild(x);
    banner.appendChild(msg);
    banner.appendChild(right);
    document.body.appendChild(banner);
  }

  // ---- discovery integration ---------------------------------------------
  // Lazily load the multi-method libp2p discovery layer (discovery.js) and
  // expose a small helper + first-run auto-discovery.
  var discoveryLoading = null;
  function loadDiscovery() {
    if (window.HallucinateDiscovery) return Promise.resolve(window.HallucinateDiscovery);
    if (discoveryLoading) return discoveryLoading;
    discoveryLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/mobile/discovery.js';
      s.async = true;
      s.onload = function () { resolve(window.HallucinateDiscovery); };
      s.onerror = function () { reject(new Error('failed to load discovery.js')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return discoveryLoading;
  }

  function applyBackend(url) {
    var base = trimSlash(url);
    if (!base) return;
    try {
      window.localStorage.setItem(LS.base, base);
      if (!read(LS.port)) window.localStorage.setItem(LS.port, '8080');
    } catch (e) {}
  }

  // Public helper used by settings.html and auto-discovery.
  window.HallucinateMobile = window.HallucinateMobile || {};
  window.HallucinateMobile.discover = function (opts) {
    return loadDiscovery().then(function (D) {
      return D.discoverAll(opts || {});
    });
  };
  window.HallucinateMobile.applyBackend = applyBackend;
  window.HallucinateMobile.loadDiscovery = loadDiscovery;

  // On first run with no backend configured, quietly search the network and
  // auto-select a single clearly-best backend; otherwise leave it to the user.
  function maybeAutoDiscover() {
    if (backendBase()) return; // already configured
    if (/settings\.html$/.test(window.location.pathname)) return;
    if (read('hallucinateAutoDiscover') === 'off') return;
    try {
      if (window.sessionStorage && window.sessionStorage.getItem('hlAutoDiscoverDone')) return;
      window.sessionStorage.setItem('hlAutoDiscoverDone', '1');
    } catch (e) {}
    loadDiscovery().then(function (D) {
      return D.discoverAll({ timeout: 3500, relayHops: 1 });
    }).then(function (list) {
      if (!list || !list.length) return;
      if (!backendBase()) {
        applyBackend(list[0].url);
        var b = document.getElementById('hl-mobile-nav-banner');
        if (b) b.remove();
        console.log('[hallucinate] auto-discovered backend:', list[0].url,
          '(' + (list[0].methods || []).join(',') + ')');
        showAutoToast(list[0]);
      }
    }).catch(function () { /* discovery best-effort */ });
  }

  function showAutoToast(cand) {
    var t = document.createElement('div');
    t.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#2e7d32;color:#fff;' +
      'padding:10px 14px;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    t.innerHTML = '<span>\u2713 Backend auto-discovered: ' + cand.url +
      ' <small style="opacity:.8">(' + (cand.methods || []).join(', ') + ')</small></span>';
    var x = document.createElement('button');
    x.textContent = '\u2715';
    x.style.cssText = 'background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;';
    x.onclick = function () { t.remove(); };
    t.appendChild(x);
    document.body.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 6000);
  }

  function onReady() {
    // Keep handsfreePort aligned so dashboards that build URLs from it still
    // produce a localhost:8080 URL that our interceptor then rewrites.
    try {
      if (!read(LS.port)) window.localStorage.setItem(LS.port, '8080');
    } catch (e) {}
    injectNav();
    ensureConfigured();
    maybeAutoDiscover();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  console.log('[hallucinate] mobile bridge active; backend =', backendBase() || '(unset)');
})();
