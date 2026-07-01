/**
 * Headless integration tests for the MCP daemon manager's live tools/list
 * telemetry (mcp_daemon_manager.js `_invokeLiveTool` -> `tool_count`).
 *
 * These lock in the fix for the recurring "the report doesn't look like it's
 * reporting the number of tools correctly" complaint at the SECOND flat-count
 * site (the main-process live probe): the count must now match the visible
 * unified tool explorer by (a) excluding the 4 hierarchical facade meta-tools,
 * (b) honoring an inline total the server reports, and (c) following up with
 * tools_list_categories when a server returns only the reduced meta surface --
 * all WITHOUT regressing the `live_ok` gate.
 *
 * Run: node --test mcp-daemon-tool-count.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MCPDaemonManager } from './mcp_daemon_manager.js';

const META = ['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch'];
const realFetch = global.fetch;

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); }
  };
}

function configFor(mgr, id) {
  const config = mgr.daemonConfigs.find((c) => c.id === id);
  assert.ok(config, `daemon config ${id} exists`);
  return config;
}

/** Install a routing fetch stub; returns the recorded call log. */
function installFetch(routes) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET' });
    for (const route of routes) {
      if (route.match(u, opts)) return route.respond(u, opts);
    }
    throw new Error(`unexpected fetch: ${opts.method || 'GET'} ${u}`);
  };
  return calls;
}

test('ipfs-kit full-flat tools/list excludes the 4 facade meta-tools', async () => {
  const mgr = new MCPDaemonManager();
  const config = configFor(mgr, 'ipfs-kit');
  const listBody = {
    tools: [
      ...META.map((name) => ({ name })),
      { name: 'core.health_check' },
      { name: 'core.version' },
      { name: 'storage.ipfs_add' }
    ]
  };
  const calls = installFetch([
    { match: (u) => u.endsWith('/mcp/tools/list'), respond: () => jsonResponse(listBody) }
  ]);
  try {
    const live = await mgr._invokeLiveTool(config, 'tools/list');
    assert.equal(live.ok, true);
    assert.equal(live.tool_count, 3, 'counts 3 domain tools, not 7 (excludes the 4 meta-tools)');
    for (const meta of META) {
      assert.ok(!live.tools_sample.includes(meta), `sample omits meta-tool ${meta}`);
    }
    assert.deepEqual([...live.tools_sample].sort(), ['core.health_check', 'core.version', 'storage.ipfs_add']);
    assert.equal(calls.length, 1, 'no categories follow-up for a full-flat server');
  } finally {
    global.fetch = realFetch;
  }
});

test('ipfs-accelerate honors the server-reported inline total', async () => {
  const mgr = new MCPDaemonManager();
  const config = configFor(mgr, 'ipfs-accelerate');
  // JSON-RPC tools/list envelope that inlines the authoritative total; only a
  // couple of descriptors are inlined, so a flat count would badly under-report.
  const rpcResult = {
    jsonrpc: '2.0',
    id: 1,
    result: {
      tools: [
        ...META.map((name) => ({ name })),
        { name: 'hardware.get_info' },
        { name: 'inference.run' }
      ],
      total: 106,
      categories: [
        { name: 'hardware', count: 40 },
        { name: 'inference', count: 66 }
      ]
    }
  };
  const calls = installFetch([
    { match: (u, o) => u.endsWith('/mcp') && o.method === 'POST', respond: () => jsonResponse(rpcResult) }
  ]);
  try {
    const live = await mgr._invokeLiveTool(config, 'tools/list');
    assert.equal(live.ok, true);
    assert.equal(live.tool_count, 106, 'uses the inline total, not the 2 inlined descriptors');
    assert.equal(calls.length, 1, 'inline total needs no follow-up');
  } finally {
    global.fetch = realFetch;
  }
});

test('ipfs-datasets reduced tools/list resolves the true total via tools_list_categories', async () => {
  const mgr = new MCPDaemonManager();
  const config = configFor(mgr, 'ipfs-datasets');
  const reducedList = { tools: META.map((name) => ({ name })) }; // only the meta-tools
  const categoriesBody = {
    categories: [
      { name: 'core', count: 3 },
      { name: 'storage', count: 5 },
      { name: 'analytics', count: 317 }
    ]
  }; // sums to 325
  const calls = installFetch([
    { match: (u, o) => u.endsWith('/auth/login') && o.method === 'POST', respond: () => jsonResponse({ access_token: 'test-token' }) },
    { match: (u, o) => u.endsWith('/tools/list') && (o.method || 'GET') === 'GET', respond: () => jsonResponse(reducedList) },
    { match: (u, o) => u.endsWith('/tools/execute/tools_list_categories') && o.method === 'POST', respond: () => jsonResponse(categoriesBody) }
  ]);
  try {
    const live = await mgr._invokeLiveTool(config, 'tools/list');
    assert.equal(live.ok, true, 'a reduced meta-only list still proves the endpoint works');
    assert.equal(live.tool_count, 325, 'true total recovered from tools_list_categories');
    assert.deepEqual(live.tools_sample, ['core', 'storage', 'analytics'], 'sample falls back to category names');
    assert.ok(
      calls.some((c) => c.url.endsWith('/tools/execute/tools_list_categories')),
      'performed the categories follow-up'
    );
  } finally {
    global.fetch = realFetch;
  }
});

test('ipfs-datasets keeps live_ok when the categories follow-up fails', async () => {
  const mgr = new MCPDaemonManager();
  const config = configFor(mgr, 'ipfs-datasets');
  const reducedList = { tools: META.map((name) => ({ name })) };
  installFetch([
    { match: (u) => u.endsWith('/auth/login'), respond: () => jsonResponse({ access_token: 't' }) },
    { match: (u) => u.endsWith('/tools/list'), respond: () => jsonResponse(reducedList) },
    { match: (u) => u.endsWith('/tools/execute/tools_list_categories'), respond: () => jsonResponse({}, { ok: false, status: 500 }) }
  ]);
  try {
    const live = await mgr._invokeLiveTool(config, 'tools/list');
    assert.equal(live.ok, true, 'the live_ok gate is independent of the true count');
    assert.equal(live.tool_count, 0, 'no confirmed domain tools when the follow-up is unavailable');
  } finally {
    global.fetch = realFetch;
  }
});

test('_summarizeLiveTools delegates to the shared MCPToolCatalog helper', () => {
  const mgr = new MCPDaemonManager();
  const summary = mgr._summarizeLiveTools({
    tools: [...META.map((name) => ({ name })), { name: 'core.x' }, { name: 'core.y' }]
  });
  assert.equal(summary.total, 2);
  assert.equal(summary.reduced, false);
  assert.equal(summary.metaTools.length, 4);
});
