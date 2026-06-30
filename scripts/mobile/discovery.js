/*
 * Hallucinate App — Mobile backend discovery (libp2p multi-method)
 *
 * Goal: find reachable ipfs_kit_py / ipfs_datasets_py / ipfs_accelerate_py
 * MCP++ backends from the mobile app WITHOUT the user having to type a URL,
 * by searching across ALL of the libp2p discovery methods the Python nodes
 * use: mDNS, DHT, pubsub, rendezvous and bootstrap.
 *
 * Reality check: a mobile WebView cannot itself run UDP-multicast mDNS or a
 * server-mode Kademlia DHT. So this module reaches the same result set through
 * three complementary tiers and merges them:
 *
 *   1. mdns          — real Bonjour / Android-NSD on the LAN, via the
 *                      `capacitor-zeroconf` native plugin when present.
 *   2. bootstrap     — explicit seed endpoints (saved/known/configured) and
 *                      same-origin / localhost probes.
 *   3. backend-relay — once ANY node endpoint answers, harvest everything the
 *                      FULL Python node found via mdns + dht + pubsub +
 *                      rendezvous, over its REST discovery API:
 *                         POST /api/peers/discover     (libp2p discover_peers)
 *                         POST /discovery/servers      (MCP server registry)
 *                         GET  /discovery/servers
 *                      This is the reliable way to "search all libp2p methods":
 *                      the heavy DHT/pubsub/rendezvous work runs on the node and
 *                      the app pulls the results over HTTP.
 *   4. libp2p (opt)  — if a browser js-libp2p bundle is exposed on
 *                      window.HallucinateLibp2p, run in-browser dht/pubsub/
 *                      rendezvous discovery too (progressive enhancement).
 *
 * Every candidate endpoint is health-probed (/health, /v1/ipfs/status) and
 * ranked by latency. Results are de-duplicated by origin. Each result carries
 * the libp2p method(s) it was found through so the UI can show provenance.
 *
 * Exposes window.HallucinateDiscovery with:
 *   discoverAll(opts) -> Promise<Array<Candidate>>
 *   probe(url)        -> Promise<Candidate|null>
 *   METHODS           -> ['mdns','dht','pubsub','rendezvous','bootstrap']
 *
 * Candidate = { url, methods:[...], sources:[...], latencyMs, healthy, info }
 */
(function () {
  'use strict';

  var METHODS = ['mdns', 'dht', 'pubsub', 'rendezvous', 'bootstrap'];

  // libp2p service types we advertise / look for over mDNS.
  var MDNS_SERVICE_TYPES = [
    '_hallucinate-mcp._tcp.',
    '_ipfs._tcp.',
    '_mcp._tcp.',
    '_libp2p._tcp.',
  ];

  // Default REST/MCP ports the backends listen on.
  var DEFAULT_REST_PORTS = [8080, 8000, 8004];

  function trimSlash(u) {
    return (u || '').replace(/\/+$/, '');
  }

  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        reject(new Error('timeout'));
      }, ms);
      promise.then(
        function (v) { clearTimeout(t); resolve(v); },
        function (e) { clearTimeout(t); reject(e); }
      );
    });
  }

  // ---- candidate URL helpers ----------------------------------------------

  function normOrigin(url) {
    try {
      var u = new URL(url);
      return u.protocol + '//' + u.host;
    } catch (e) {
      return trimSlash(url);
    }
  }

  // Turn host/port (and protocol guess) into an http(s) base URL.
  function hostToUrl(host, port, secure) {
    if (!host) return null;
    var proto = secure ? 'https:' : 'http:';
    var p = port ? (':' + port) : '';
    // IPv6 literals need brackets.
    if (host.indexOf(':') !== -1 && host.indexOf('[') === -1) host = '[' + host + ']';
    return proto + '//' + host + p;
  }

  /*
   * Best-effort extraction of an http(s) endpoint from the many shapes the
   * backend discovery APIs return: explicit url fields, host/port pairs, or
   * libp2p multiaddrs like /ip4/1.2.3.4/tcp/8080/http.
   */
  function extractUrls(obj, out) {
    out = out || [];
    if (obj == null) return out;
    if (typeof obj === 'string') {
      addFromString(obj, out);
      return out;
    }
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) extractUrls(obj[i], out);
      return out;
    }
    if (typeof obj !== 'object') return out;

    // Explicit URL-ish fields.
    var urlFields = ['api_url', 'url', 'http', 'http_url', 'gateway', 'gateway_url',
      'endpoint', 'rest_url', 'base_url', 'address', 'api', 'dashboard_url'];
    for (var f = 0; f < urlFields.length; f++) {
      var v = obj[urlFields[f]];
      if (typeof v === 'string') addFromString(v, out);
    }

    // host/port pairs.
    var host = obj.host || obj.hostname || obj.ip || obj.ip4 || obj.address;
    var port = obj.port || obj.api_port || obj.http_port || obj.rest_port;
    if (typeof host === 'string' && /^[0-9a-fA-F:.\[\]]+$|^[a-zA-Z0-9.-]+$/.test(host) && host.indexOf('/') === -1) {
      if (port) {
        var u = hostToUrl(host, port, !!obj.secure || !!obj.tls);
        if (u) pushUnique(out, u);
      } else {
        for (var dp = 0; dp < DEFAULT_REST_PORTS.length; dp++) {
          var du = hostToUrl(host, DEFAULT_REST_PORTS[dp], false);
          if (du) pushUnique(out, du);
        }
      }
    }

    // multiaddrs.
    var maddrFields = ['multiaddr', 'multiaddrs', 'addrs', 'addresses', 'maddr'];
    for (var m = 0; m < maddrFields.length; m++) {
      extractUrls(obj[maddrFields[m]], out);
    }

    // Recurse into nested server/peer containers.
    var nested = ['server', 'servers', 'peer', 'peers', 'node', 'nodes', 'result', 'data', 'items'];
    for (var n = 0; n < nested.length; n++) {
      if (obj[nested[n]] != null) extractUrls(obj[nested[n]], out);
    }
    return out;
  }

  function addFromString(s, out) {
    s = String(s).trim();
    if (!s) return;
    if (/^https?:\/\//i.test(s)) {
      pushUnique(out, normOrigin(s));
      return;
    }
    if (/^ws?s?:\/\//i.test(s)) {
      pushUnique(out, normOrigin(s.replace(/^ws/i, 'http')));
      return;
    }
    // multiaddr: /ip4/1.2.3.4/tcp/8080[/http|/ws|/tls/...]
    if (s.indexOf('/') === 0) {
      var ip = s.match(/\/ip[46]\/([^/]+)/);
      var dns = s.match(/\/dns[46]?\/([^/]+)/);
      var tcp = s.match(/\/tcp\/(\d+)/);
      var host = (ip && ip[1]) || (dns && dns[1]);
      var secure = /\/(https|tls|wss)(\/|$)/.test(s);
      if (host && tcp) {
        var u = hostToUrl(host, tcp[1], secure);
        if (u) pushUnique(out, u);
      }
      return;
    }
    // host:port bare form.
    if (/^[a-zA-Z0-9.\-\[\]:]+:\d+$/.test(s)) {
      pushUnique(out, 'http://' + s);
    }
  }

  function pushUnique(arr, v) {
    if (v && arr.indexOf(v) === -1) arr.push(v);
  }

  // ---- health probing -----------------------------------------------------

  var HEALTH_PATHS = ['/v1/ipfs/status', '/health', '/api/v0/version', '/v1/ipfs/capabilities'];

  /*
   * Probe a base URL. Resolves to a Candidate if any health path answers,
   * else null. Uses the NATIVE fetch (window.__hlNativeFetch when the bridge
   * has stashed it) so the bridge's localhost-rewriting doesn't interfere.
   */
  function probe(base, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 4000;
    base = trimSlash(base);
    if (!base) return Promise.resolve(null);
    var fetchFn = (typeof window.__hlNativeFetch === 'function')
      ? window.__hlNativeFetch
      : window.fetch.bind(window);

    var started = nowMs();
    var idx = 0;
    return new Promise(function (resolve) {
      function tryNext() {
        if (idx >= HEALTH_PATHS.length) { resolve(null); return; }
        var path = HEALTH_PATHS[idx++];
        withTimeout(fetchFn(base + path, { method: 'GET', mode: 'cors' }), timeout)
          .then(function (res) {
            if (res && res.ok) {
              var latency = Math.round(nowMs() - started);
              res.json().then(function (j) { finish(latency, j); },
                function () { finish(latency, null); });
            } else {
              tryNext();
            }
          })
          .catch(function () { tryNext(); });
      }
      function finish(latency, info) {
        resolve({
          url: base,
          origin: normOrigin(base),
          methods: [],
          sources: [],
          latencyMs: latency,
          healthy: true,
          info: info || null,
        });
      }
      tryNext();
    });
  }

  // ---- strategy: bootstrap / known / same-origin --------------------------

  function bootstrapCandidates() {
    var out = [];
    // Previously-saved working backend.
    var saved = lsGet('hallucinateBackendUrl');
    if (saved) pushUnique(out, normOrigin(saved));
    // User-supplied bootstrap list (comma/space/newline separated).
    var boot = lsGet('hallucinateBootstrap') || '';
    boot.split(/[\s,]+/).forEach(function (b) {
      if (b) addFromString(b, out);
    });
    // Same-origin (the app may itself be served by a node) + localhost defaults.
    try {
      var loc = window.location;
      if (loc && /^https?:$/.test(loc.protocol)) pushUnique(out, loc.protocol + '//' + loc.host);
    } catch (e) {}
    ['localhost', '127.0.0.1'].forEach(function (h) {
      DEFAULT_REST_PORTS.forEach(function (p) {
        pushUnique(out, hostToUrl(h, p, false));
      });
    });
    return out.map(function (u) { return { url: u, method: 'bootstrap' }; });
  }

  // ---- strategy: mDNS via capacitor-zeroconf ------------------------------

  function getZeroconf() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ZeroConf) {
        return window.Capacitor.Plugins.ZeroConf;
      }
    } catch (e) {}
    if (window.ZeroConf) return window.ZeroConf;
    return null;
  }

  function mdnsDiscover(opts) {
    var zc = getZeroconf();
    if (!zc || typeof zc.watch !== 'function') {
      return Promise.resolve([]); // plugin not available — degrade gracefully.
    }
    var timeout = (opts && opts.timeout) || 5000;
    var found = [];
    var watches = [];

    return new Promise(function (resolve) {
      function done() {
        watches.forEach(function (w) {
          try { zc.unwatch({ type: w.type, domain: w.domain || 'local.' }); } catch (e) {}
        });
        resolve(found);
      }
      var pending = MDNS_SERVICE_TYPES.length;
      MDNS_SERVICE_TYPES.forEach(function (type) {
        try {
          watches.push({ type: type });
          zc.watch({ type: type, domain: 'local.' }, function (result) {
            try {
              if (result && result.action === 'resolved' && result.service) {
                var svc = result.service;
                var ipv4 = (svc.ipv4Addresses && svc.ipv4Addresses[0]) ||
                  (svc.addresses && svc.addresses[0]) || svc.hostname;
                var port = svc.port;
                var url = hostToUrl(ipv4, port, false);
                if (url) found.push({ url: normOrigin(url), method: 'mdns', name: svc.name });
              }
            } catch (e) {}
          }).then(function () {}, function () {});
        } catch (e) {}
        if (--pending === 0) { /* all watches started */ }
      });
      setTimeout(done, timeout);
    });
  }

  // ---- strategy: backend-relay (harvest dht/pubsub/rendezvous/mdns) --------

  /*
   * Ask a reachable node for everything it found via the heavy libp2p methods.
   * Returns [{url, method}] where method reflects how the NODE found the peer
   * when that's reported, else 'dht' (the catch-all libp2p relay tag).
   */
  function relayHarvest(base, opts) {
    base = trimSlash(base);
    var timeout = (opts && opts.timeout) || 6000;
    var fetchFn = (typeof window.__hlNativeFetch === 'function')
      ? window.__hlNativeFetch : window.fetch.bind(window);
    var results = [];

    function post(path, body) {
      return withTimeout(fetchFn(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify(body || {}),
      }).then(function (r) { return r.ok ? r.json() : null; }), timeout).catch(function () { return null; });
    }
    function get(path) {
      return withTimeout(fetchFn(base + path, { method: 'GET', mode: 'cors' })
        .then(function (r) { return r.ok ? r.json() : null; }), timeout).catch(function () { return null; });
    }

    function collect(json, method) {
      extractUrls(json, []).forEach(function (u) {
        results.push({ url: normOrigin(u), method: method });
      });
    }

    return Promise.all([
      // libp2p peer discovery — runs mdns + dht + pubsub on the node.
      post('/api/peers/discover', { limit: 50, timeout: Math.round(timeout / 1000) })
        .then(function (j) { collect(j, 'dht'); }),
      // MCP server registry discovery — libp2p + websocket + manual.
      post('/discovery/servers', {
        methods: ['libp2p', 'websocket', 'manual'],
        compatible_only: false,
      }).then(function (j) { collect(j, 'rendezvous'); }),
      get('/discovery/servers').then(function (j) { collect(j, 'rendezvous'); }),
      get('/api/v0/mcp_discovery').then(function (j) { collect(j, 'pubsub'); }),
    ]).then(function () {
      // De-dup, dropping the node we asked.
      var seen = {};
      var out = [];
      results.forEach(function (r) {
        if (!r.url || r.url === normOrigin(base)) return;
        if (seen[r.url]) { mergeMethod(seen[r.url], r.method); return; }
        seen[r.url] = r;
        out.push(r);
      });
      return out;
    });
  }

  function mergeMethod(cand, method) {
    cand.methods = cand.methods || [];
    if (method && cand.methods.indexOf(method) === -1) cand.methods.push(method);
  }

  // ---- strategy: in-browser js-libp2p (optional) --------------------------

  function browserLibp2pDiscover(opts) {
    var L = window.HallucinateLibp2p;
    if (!L || typeof L.discover !== 'function') return Promise.resolve([]);
    return Promise.resolve()
      .then(function () { return L.discover(opts || {}); })
      .then(function (list) {
        var out = [];
        (list || []).forEach(function (item) {
          extractUrls(item, []).forEach(function (u) {
            out.push({ url: normOrigin(u), method: item.method || 'pubsub' });
          });
        });
        return out;
      })
      .catch(function () { return []; });
  }

  // ---- orchestrator -------------------------------------------------------

  /*
   * Run all enabled discovery methods, merge + health-check, and return a
   * latency-ranked list of healthy backends.
   *
   * opts = {
   *   methods:   subset of METHODS (default all),
   *   timeout:   per-probe timeout ms (default 4000),
   *   relayHops: how many relay rounds to chase (default 1),
   *   onResult:  fn(candidate) called as each healthy backend is confirmed,
   *   onProgress fn({phase, method, message}) for UI status,
   * }
   */
  function discoverAll(opts) {
    opts = opts || {};
    var want = opts.methods || METHODS;
    var timeout = opts.timeout || 4000;
    var relayHops = opts.relayHops == null ? 1 : opts.relayHops;
    var onResult = typeof opts.onResult === 'function' ? opts.onResult : function () {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};

    var byOrigin = {}; // origin -> Candidate
    var probed = {}; // origin -> Promise

    function want_(m) { return want.indexOf(m) !== -1; }

    function record(cand, method, source) {
      var origin = cand.origin || normOrigin(cand.url);
      var existing = byOrigin[origin];
      if (!existing) {
        existing = byOrigin[origin] = {
          url: trimSlash(cand.url), origin: origin,
          methods: [], sources: [],
          latencyMs: cand.latencyMs != null ? cand.latencyMs : null,
          healthy: !!cand.healthy, info: cand.info || null,
        };
      }
      if (method && existing.methods.indexOf(method) === -1) existing.methods.push(method);
      if (source && existing.sources.indexOf(source) === -1) existing.sources.push(source);
      if (cand.latencyMs != null) existing.latencyMs = cand.latencyMs;
      if (cand.info && !existing.info) existing.info = cand.info;
      return existing;
    }

    // Probe a raw candidate {url, method}; on success record + announce.
    function probeCandidate(c, source) {
      var origin = normOrigin(c.url);
      if (!probed[origin]) {
        probed[origin] = probe(c.url, { timeout: timeout }).then(function (live) {
          if (live) {
            var rec = record(live, c.method, source);
            mergeMethod(rec, c.method);
            try { onResult(rec); } catch (e) {}
            return rec;
          }
          return null;
        });
      } else {
        // already probing/probed — still tag the method.
        probed[origin].then(function (rec) { if (rec) { mergeMethod(rec, c.method); record(rec, c.method, source); } });
      }
      return probed[origin];
    }

    // 1) gather initial candidates from light methods.
    var initial = [];
    if (want_('bootstrap')) {
      onProgress({ phase: 'start', method: 'bootstrap', message: 'Checking known / seed endpoints…' });
      bootstrapCandidates().forEach(function (c) { initial.push({ c: c, source: 'bootstrap' }); });
    }

    var mdnsPromise = want_('mdns')
      ? (onProgress({ phase: 'start', method: 'mdns', message: 'Browsing mDNS (Bonjour/NSD)…' }), mdnsDiscover({ timeout: Math.max(timeout, 5000) }))
      : Promise.resolve([]);

    var libp2pPromise = (want_('dht') || want_('pubsub') || want_('rendezvous'))
      ? browserLibp2pDiscover({ timeout: timeout, methods: want })
      : Promise.resolve([]);

    // Kick off initial bootstrap probes immediately.
    var initialProbes = initial.map(function (x) { return probeCandidate(x.c, x.source); });

    // Add mDNS + browser-libp2p candidates as they arrive.
    var extraProbes = Promise.all([mdnsPromise, libp2pPromise]).then(function (res) {
      var more = [].concat(res[0] || [], res[1] || []);
      return Promise.all(more.map(function (c) { return probeCandidate(c, c.method); }));
    });

    // 2) once we have live nodes, relay-harvest the heavy libp2p methods.
    function relayRound(hopsLeft) {
      if (hopsLeft <= 0) return Promise.resolve();
      var live = Object.keys(byOrigin).map(function (k) { return byOrigin[k]; })
        .filter(function (c) { return c.healthy; });
      if (!live.length) return Promise.resolve();
      onProgress({ phase: 'relay', method: 'dht', message: 'Harvesting peers via reachable node (dht/pubsub/rendezvous/mdns)…' });
      return Promise.all(live.map(function (node) {
        return relayHarvest(node.url, { timeout: Math.max(timeout, 6000) }).then(function (peers) {
          return Promise.all(peers.map(function (p) {
            var alreadyKnown = !!byOrigin[normOrigin(p.url)];
            return probeCandidate(p, 'relay:' + node.origin).then(function () {
              return alreadyKnown;
            });
          }));
        });
      })).then(function () {
        return relayRound(hopsLeft - 1);
      });
    }

    return Promise.all(initialProbes.concat([extraProbes]))
      .then(function () { return relayRound(relayHops); })
      .then(function () {
        var list = Object.keys(byOrigin)
          .map(function (k) { return byOrigin[k]; })
          .filter(function (c) { return c.healthy; });
        // Default all backend-relay-found nodes that lack a method to 'dht'.
        list.forEach(function (c) { if (!c.methods.length) c.methods.push('bootstrap'); });
        list.sort(function (a, b) {
          return (a.latencyMs == null ? 1e9 : a.latencyMs) - (b.latencyMs == null ? 1e9 : b.latencyMs);
        });
        return list;
      });
  }

  window.HallucinateDiscovery = {
    METHODS: METHODS,
    discoverAll: discoverAll,
    probe: probe,
    extractUrls: extractUrls,
    _bootstrapCandidates: bootstrapCandidates,
  };
})();
