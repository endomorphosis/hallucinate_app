/**
 * Unified Backend Connector
 * 
 * Provides a single interface for all dashboard views to communicate with
 * the handsfree backend API (/v1/ipfs/*) and individual MCP daemons.
 * 
 * Usage:
 *   <script src="components/backend-connector.js"></script>
 *   <script>
 *     const backend = new BackendConnector();
 *     const status = await backend.getStatus();
 *     const models = await backend.accelerate.listModels();
 *   </script>
 */

class BackendConnector {
  constructor(options = {}) {
    // Load ports from localStorage settings or use defaults
    const settings = this._loadSettings();
    this.ports = {
      handsfree: options.handsfreePort || settings.handsfreePort || 8080,
      ipfsKit: options.ipfsKitPort || settings.ipfsKitPort || 8014,
      ipfsDatasets: options.ipfsDatasetsPort || settings.ipfsDatasetsPort || 3002,
      ipfsAccelerate: options.ipfsAcceleratePort || settings.ipfsAcceleratePort || 3003,
      swissknife: options.swissKnifePort || settings.swissKnifePort || 8765,
    };
    this.timeout = options.timeout || 8000;
    this.baseUrl = `http://localhost:${this.ports.handsfree}`;

    // Sub-routers
    this.kit = new IPFSKitClient(this);
    this.datasets = new IPFSDatasetsClient(this);
    this.accelerate = new IPFSAccelerateClient(this);
    this.vector = new VectorSearchClient(this);
    this.scraping = new WebScrapingClient(this);
    this.workflow = new WorkflowClient(this);
  }

  _loadSettings() {
    try {
      return JSON.parse(localStorage.getItem('appSettings') || '{}');
    } catch { return {}; }
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeout || this.timeout);
    try {
      const resp = await fetch(url, {
        ...options,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }
      return await resp.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async _post(path, body = {}, options = {}) {
    return this._fetch(path, { method: 'POST', body: JSON.stringify(body), ...options });
  }

  // --- Unified Status ---
  async getStatus() {
    return this._fetch('/v1/ipfs/status');
  }

  // --- Health Check All Services ---
  async healthCheckAll() {
    const checks = [
      { name: 'handsfree', url: `http://localhost:${this.ports.handsfree}/v1/ipfs/status` },
      { name: 'ipfs-kit', url: `http://localhost:${this.ports.ipfsKit}/api/mcp/status` },
      { name: 'ipfs-datasets', url: `http://localhost:${this.ports.ipfsDatasets}/health/ready` },
      { name: 'ipfs-accelerate', url: `http://localhost:${this.ports.ipfsAccelerate}/api/mcp/status` },
      { name: 'swissknife', url: `http://localhost:${this.ports.swissknife}/health` },
    ];

    const results = {};
    await Promise.allSettled(checks.map(async (svc) => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 3000);
        const resp = await fetch(svc.url, { signal: ctrl.signal });
        results[svc.name] = { online: resp.ok, status: resp.status };
      } catch (e) {
        results[svc.name] = { online: false, error: e.message };
      }
    }));
    return results;
  }
}

// --- IPFS Kit Client ---
class IPFSKitClient {
  constructor(connector) { this.c = connector; }

  async add(data, options = {}) {
    return this.c._post('/v1/ipfs/add', { data, ...options });
  }
  async cat(cid) {
    return this.c._fetch(`/v1/ipfs/cat?cid=${encodeURIComponent(cid)}`);
  }
  async pin(cid) {
    return this.c._post('/v1/ipfs/pin', { cid });
  }
  async unpin(cid) {
    return this.c._post('/v1/ipfs/unpin', { cid });
  }
  async listPins(type = 'all') {
    return this.c._fetch(`/v1/ipfs/list_pins?type=${encodeURIComponent(type)}`);
  }
  async stat(cid) {
    return this.c._fetch(`/v1/ipfs/stat?cid=${encodeURIComponent(cid)}`);
  }
  async dagGet(cid) {
    return this.c._fetch(`/v1/ipfs/dag/get?cid=${encodeURIComponent(cid)}`);
  }
  async dagPut(data) {
    return this.c._post('/v1/ipfs/dag/put', { data });
  }
  async namePublish(value, options = {}) {
    return this.c._post('/v1/ipfs/name/publish', { value, ...options });
  }
  async nameResolve(name) {
    return this.c._fetch(`/v1/ipfs/name/resolve?name=${encodeURIComponent(name)}`);
  }
  async resolve(cid) {
    return this.c._fetch(`/v1/ipfs/resolve?cid=${encodeURIComponent(cid)}`);
  }
}

// --- IPFS Datasets Client ---
class IPFSDatasetsClient {
  constructor(connector) { this.c = connector; }

  async embed(texts, options = {}) {
    return this.c._post('/v1/ipfs/embed', { texts, ...options });
  }
  async generate(prompt, options = {}) {
    return this.c._post('/v1/ipfs/generate', { prompt, ...options });
  }
  async listDatasets(options = {}) {
    return this.c._fetch('/v1/ipfs/list_datasets');
  }
  async searchDatasets(query) {
    return this.c._fetch(`/v1/ipfs/search_datasets?query=${encodeURIComponent(query)}`);
  }
}

// --- IPFS Accelerate Client ---
class IPFSAccelerateClient {
  constructor(connector) { this.c = connector; }

  async capabilities() {
    return this.c._fetch('/v1/ipfs/capabilities');
  }
  async hardwareProfile() {
    return this.c._fetch('/v1/ipfs/hardware_profile');
  }
  async listModels() {
    return this.c._fetch('/v1/ipfs/list_models');
  }
  async searchModels(query) {
    return this.c._fetch(`/v1/ipfs/search_models?query=${encodeURIComponent(query)}`);
  }
  async inference(model, data, options = {}) {
    return this.c._post('/v1/ipfs/inference', { model, data, ...options });
  }
  async metrics() {
    return this.c._fetch('/v1/ipfs/metrics');
  }
  async endpoints() {
    return this.c._fetch('/v1/ipfs/endpoints');
  }
}

// --- Vector Store & Search Client ---
class VectorSearchClient {
  constructor(connector) { this.c = connector; }

  async index(content, metadata = {}, collection = 'default') {
    return this.c._post('/v1/ipfs/vector/index', { content, metadata, collection });
  }
  async search(query, collection = 'default', top_k = 10) {
    return this.c._post('/v1/ipfs/vector/search', { query, collection, top_k });
  }
  async metadata(collection = 'default') {
    return this.c._post('/v1/ipfs/vector/metadata', { collection });
  }
  async semanticSearch(query, top_k = 10, filters = {}) {
    return this.c._post('/v1/ipfs/search/semantic', { query, top_k, filters });
  }
  async similaritySearch(query, threshold = 0.7, max_results = 20) {
    return this.c._post('/v1/ipfs/search/similarity', { query, threshold, max_results });
  }
  async facetedSearch(query, facets = [], filters = {}) {
    return this.c._post('/v1/ipfs/search/faceted', { query, facets, filters });
  }
}

// --- Web Scraping Client ---
class WebScrapingClient {
  constructor(connector) { this.c = connector; }

  async scrapeUrl(url, options = {}) {
    return this.c._post('/v1/ipfs/scrape/url', { url, ...options });
  }
  async scrapeBatch(urls, options = {}) {
    return this.c._post('/v1/ipfs/scrape/batch', { urls, ...options });
  }
}

// --- Workflow Client ---
class WorkflowClient {
  constructor(connector) { this.c = connector; }

  async execute(workflow_id, step, params = {}) {
    return this.c._post('/v1/ipfs/workflow/execute', { workflow_id, step, params });
  }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BackendConnector, IPFSKitClient, IPFSDatasetsClient, IPFSAccelerateClient, VectorSearchClient, WebScrapingClient, WorkflowClient };
}
