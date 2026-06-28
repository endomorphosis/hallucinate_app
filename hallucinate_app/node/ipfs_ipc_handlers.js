/**
 * IPFS IPC Handlers for Hallucinate App Electron Main Process
 *
 * Registers ipcMain.handle() for all IPFS operations, proxying requests
 * to the handsfree FastAPI backend at /v1/ipfs/* endpoints.
 *
 * Channel contract matches docs/integration/ipfs-ipc-bridge.ts
 */

import { ipcMain } from 'electron';

const HANDSFREE_BASE_URL = process.env.HANDSFREE_BACKEND_URL || 'http://127.0.0.1:8080';
const REQUEST_TIMEOUT_MS = Number(process.env.IPFS_IPC_TIMEOUT_MS || 30000);

/**
 * IPC Channel names - must match preload.cjs and ipfs-ipc-bridge.ts
 */
const IPFS_IPC_CHANNELS = {
  STATUS: 'ipfs:status',
  ADD: 'ipfs:add',
  CAT: 'ipfs:cat',
  PIN: 'ipfs:pin',
  UNPIN: 'ipfs:unpin',
  RESOLVE: 'ipfs:resolve',
  EMBED: 'ipfs:embed',
  GENERATE: 'ipfs:generate',
  CAPABILITIES: 'ipfs:capabilities',
  HARDWARE_PROFILE: 'ipfs:hardware_profile',
  LIST_MODELS: 'ipfs:list_models',
  LIST_DATASETS: 'ipfs:list_datasets',
  INFERENCE: 'ipfs:inference',
  LIST_PINS: 'ipfs:list_pins',
  STAT: 'ipfs:stat',
  DAG_GET: 'ipfs:dag_get',
  DAG_PUT: 'ipfs:dag_put',
  NAME_PUBLISH: 'ipfs:name_publish',
  NAME_RESOLVE: 'ipfs:name_resolve',
  SEARCH_MODELS: 'ipfs:search_models',
  METRICS: 'ipfs:metrics',
  ENDPOINTS: 'ipfs:endpoints',
};

/**
 * Make an HTTP request to the handsfree backend with timeout.
 */
async function backendRequest(method, path, body = null) {
  const url = `${HANDSFREE_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        error: true,
        status: response.status,
        message: errorText,
      };
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: true, status: 408, message: 'Request timeout' };
    }
    return {
      error: true,
      status: 503,
      message: `Backend unavailable: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Register all IPFS IPC handlers on the main process.
 * Call this once during app initialization (after app.whenReady()).
 */
export function registerIPFSIPCHandlers() {
  // GET /v1/ipfs/status - Aggregated health of all IPFS subsystems
  ipcMain.handle(IPFS_IPC_CHANNELS.STATUS, async () => {
    return backendRequest('GET', '/v1/ipfs/status');
  });

  // POST /v1/ipfs/add - Store content, returns CID
  ipcMain.handle(IPFS_IPC_CHANNELS.ADD, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/add', {
      data: request.data,
      filename: request.filename || null,
      pin: request.pin !== false,
    });
  });

  // POST /v1/ipfs/cat - Retrieve content by CID
  ipcMain.handle(IPFS_IPC_CHANNELS.CAT, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/cat', {
      cid: request.cid,
    });
  });

  // POST /v1/ipfs/pin - Pin content by CID
  ipcMain.handle(IPFS_IPC_CHANNELS.PIN, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/pin', {
      cid: request.cid,
    });
  });

  // POST /v1/ipfs/unpin - Unpin content by CID
  ipcMain.handle(IPFS_IPC_CHANNELS.UNPIN, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/unpin', {
      cid: request.cid,
    });
  });

  // POST /v1/ipfs/resolve - Resolve CID metadata
  ipcMain.handle(IPFS_IPC_CHANNELS.RESOLVE, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/resolve', {
      cid: request.cid,
    });
  });

  // POST /v1/ipfs/embed - Generate embeddings
  ipcMain.handle(IPFS_IPC_CHANNELS.EMBED, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/embed', {
      texts: request.texts,
      model_name: request.model_name || null,
      provider: request.provider || null,
    });
  });

  // POST /v1/ipfs/generate - LLM text generation
  ipcMain.handle(IPFS_IPC_CHANNELS.GENERATE, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/generate', {
      prompt: request.prompt,
      model_name: request.model_name || null,
      provider: request.provider || null,
      max_tokens: request.max_tokens || null,
    });
  });

  // GET /v1/ipfs/capabilities - Hardware capabilities
  ipcMain.handle(IPFS_IPC_CHANNELS.CAPABILITIES, async () => {
    return backendRequest('GET', '/v1/ipfs/capabilities');
  });

  // GET /v1/ipfs/hardware_profile - Detailed hardware profile
  ipcMain.handle(IPFS_IPC_CHANNELS.HARDWARE_PROFILE, async () => {
    return backendRequest('GET', '/v1/ipfs/hardware_profile');
  });

  // GET /v1/ipfs/list_models - List available models
  ipcMain.handle(IPFS_IPC_CHANNELS.LIST_MODELS, async () => {
    return backendRequest('GET', '/v1/ipfs/list_models');
  });

  // POST /v1/ipfs/list_datasets - List/search datasets
  ipcMain.handle(IPFS_IPC_CHANNELS.LIST_DATASETS, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/list_datasets', {
      query: request?.query || null,
      limit: request?.limit || 20,
    });
  });

  // POST /v1/ipfs/inference - Direct model inference
  ipcMain.handle(IPFS_IPC_CHANNELS.INFERENCE, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/inference', {
      model_name: request.model_name,
      inputs: request.inputs,
      parameters: request.parameters || {},
    });
  });

  // GET /v1/ipfs/list_pins - List pinned CIDs
  ipcMain.handle(IPFS_IPC_CHANNELS.LIST_PINS, async () => {
    return backendRequest('GET', '/v1/ipfs/list_pins');
  });

  // POST /v1/ipfs/stat - Object statistics
  ipcMain.handle(IPFS_IPC_CHANNELS.STAT, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/stat', { cid: request.cid });
  });

  // POST /v1/ipfs/dag/get - Get DAG node
  ipcMain.handle(IPFS_IPC_CHANNELS.DAG_GET, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/dag/get', { cid: request.cid });
  });

  // POST /v1/ipfs/dag/put - Store DAG node
  ipcMain.handle(IPFS_IPC_CHANNELS.DAG_PUT, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/dag/put', { data: request.data });
  });

  // POST /v1/ipfs/name/publish - Publish CID to IPNS
  ipcMain.handle(IPFS_IPC_CHANNELS.NAME_PUBLISH, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/name/publish', { value: request.cid || request.value });
  });

  // POST /v1/ipfs/name/resolve - Resolve IPNS name
  ipcMain.handle(IPFS_IPC_CHANNELS.NAME_RESOLVE, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/name/resolve', { value: request.name || request.value });
  });

  // POST /v1/ipfs/search_models - Search AI models
  ipcMain.handle(IPFS_IPC_CHANNELS.SEARCH_MODELS, async (_event, request) => {
    return backendRequest('POST', '/v1/ipfs/search_models', { query: request?.query || '' });
  });

  // GET /v1/ipfs/metrics - Performance metrics
  ipcMain.handle(IPFS_IPC_CHANNELS.METRICS, async () => {
    return backendRequest('GET', '/v1/ipfs/metrics');
  });

  // GET /v1/ipfs/endpoints - List inference endpoints
  ipcMain.handle(IPFS_IPC_CHANNELS.ENDPOINTS, async () => {
    return backendRequest('GET', '/v1/ipfs/endpoints');
  });

  console.log('[IPFS IPC] Registered handlers for channels:', Object.values(IPFS_IPC_CHANNELS).join(', '));
}

/**
 * Remove all IPFS IPC handlers (for cleanup/testing).
 */
export function removeIPFSIPCHandlers() {
  for (const channel of Object.values(IPFS_IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}

export { IPFS_IPC_CHANNELS, HANDSFREE_BASE_URL };
export default { registerIPFSIPCHandlers, removeIPFSIPCHandlers, IPFS_IPC_CHANNELS };
