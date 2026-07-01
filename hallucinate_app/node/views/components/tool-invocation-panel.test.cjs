/**
 * Headless unit tests for the tool-invocation-panel.js lazy schema-fetch
 * helpers — run with:
 *   node --test tool-invocation-panel.test.cjs
 *
 * node/ is an ES-module package, so this browser component .js is never
 * require()d by node in production (the renderer loads it via <script> and
 * reads window.ToolInvocationPanel). To exercise the pure logic headlessly we
 * evaluate the source in a vm sandbox that supplies a synthetic CommonJS
 * `module` (and no window/document, so the browser guards no-op), exposing the
 * guarded exports.
 *
 * These lock the fix for the hierarchical-facade form gap: flat
 * <category>.<tool> tools ship a stub inputSchema ({type:object}, no
 * properties), so the panel lazily fetches the real schema via the
 * tools_get_schema meta-tool, sending {category, tool} — the arg shape BOTH the
 * ipfs_kit_py and ipfs_datasets_py servers accept.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPanel() {
  const src = fs.readFileSync(
    path.join(__dirname, 'tool-invocation-panel.js'), 'utf8');
  const sandbox = { module: { exports: {} }, self: undefined, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'tool-invocation-panel.js' });
  return sandbox.module.exports;
}

const P = loadPanel();

const realSchema = {
  type: 'object',
  properties: { cid: { type: 'string', description: 'Content ID' } },
  required: ['cid'],
};

// ---- splitDottedToolName -------------------------------------------------

test('splitDottedToolName splits on the first dot', () => {
  assert.deepStrictEqual(
    { ...P.splitDottedToolName('storage.pin_add') },
    { category: 'storage', tool: 'pin_add' });
});

test('splitDottedToolName keeps later dots in the tool part', () => {
  assert.deepStrictEqual(
    { ...P.splitDottedToolName('data.load.csv') },
    { category: 'data', tool: 'load.csv' });
});

test('splitDottedToolName returns null for a bare (dot-less) name', () => {
  assert.strictEqual(P.splitDottedToolName('health_check'), null);
});

test('splitDottedToolName returns null for malformed/non-string input', () => {
  assert.strictEqual(P.splitDottedToolName('.x'), null);
  assert.strictEqual(P.splitDottedToolName('x.'), null);
  assert.strictEqual(P.splitDottedToolName(''), null);
  assert.strictEqual(P.splitDottedToolName(null), null);
  assert.strictEqual(P.splitDottedToolName(42), null);
});

// ---- extractSchemaFromToolResult ----------------------------------------

test('extracts datasets {status,schema} from structuredContent', () => {
  const data = {
    content: [{ type: 'text',
      text: JSON.stringify({ status: 'success', schema: realSchema }) }],
    structuredContent: { status: 'success', schema: realSchema },
    isError: false,
  };
  const s = P.extractSchemaFromToolResult(data);
  assert.ok(s && s.properties && s.properties.cid);
  assert.strictEqual(s.properties.cid.type, 'string');
});

test('extracts through a JSON-RPC result envelope', () => {
  const data = {
    jsonrpc: '2.0', id: 1,
    result: {
      structuredContent: { status: 'success', schema: realSchema },
      isError: false,
    },
  };
  const s = P.extractSchemaFromToolResult(data);
  assert.ok(s && s.properties.cid);
});

test('extracts a schema returned directly (has properties, no wrapper)', () => {
  const s = P.extractSchemaFromToolResult({ structuredContent: realSchema });
  assert.strictEqual(s.properties.cid.type, 'string');
});

test('extracts a schema nested under inputSchema', () => {
  const s = P.extractSchemaFromToolResult(
    { structuredContent: { inputSchema: realSchema } });
  assert.ok(s.properties.cid);
});

test('parses schema from the text content block when structuredContent absent', () => {
  const data = {
    content: [{ type: 'text',
      text: JSON.stringify({ status: 'success', schema: realSchema }) }],
    isError: false,
  };
  const s = P.extractSchemaFromToolResult(data);
  assert.ok(s && s.properties.cid);
});

test('returns null for an error / propertyless / stub / empty result', () => {
  assert.strictEqual(P.extractSchemaFromToolResult(
    { structuredContent: { status: 'error', error: 'not found' } }), null);
  // A stub schema (no properties) must NOT be treated as usable.
  assert.strictEqual(P.extractSchemaFromToolResult(
    { structuredContent: { type: 'object' } }), null);
  assert.strictEqual(P.extractSchemaFromToolResult(
    { structuredContent: { schema: { type: 'object', properties: {} } } }), null);
  assert.strictEqual(P.extractSchemaFromToolResult(null), null);
});

// ---- fetchToolSchemaVia (the wire shape that matters) --------------------

test('fetchToolSchemaVia POSTs {name:tools_get_schema, arguments:{category,tool}}', async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return {
      json: async () => ({
        structuredContent: { status: 'success', schema: realSchema },
        isError: false,
      }),
    };
  };
  const schema = await P.fetchToolSchemaVia(
    fakeFetch, 'http://127.0.0.1:8014/mcp/tools/call', 'storage', 'pin_add');

  assert.strictEqual(captured.url, 'http://127.0.0.1:8014/mcp/tools/call');
  assert.strictEqual(captured.opts.method, 'POST');
  assert.strictEqual(
    captured.opts.headers['Content-Type'], 'application/json');
  const body = JSON.parse(captured.opts.body);
  assert.strictEqual(body.name, 'tools_get_schema');
  // Must send {category, tool} — NOT {name} (datasets rejects {name}).
  assert.deepStrictEqual(body.arguments, { category: 'storage', tool: 'pin_add' });
  assert.ok(!('name' in body.arguments));
  assert.ok(schema && schema.properties.cid);
});

test('fetchToolSchemaVia returns null when no resolvable schema comes back', async () => {
  const fakeFetch = async () => ({
    json: async () => ({ structuredContent: { status: 'error', error: 'unknown' } }),
  });
  const schema = await P.fetchToolSchemaVia(
    fakeFetch, 'http://x/mcp/tools/call', 'a', 'b');
  assert.strictEqual(schema, null);
});

// ---- META_TOOL_NAMES -----------------------------------------------------

test('META_TOOL_NAMES contains exactly the four facade meta-tools', () => {
  assert.deepStrictEqual(
    [...P.META_TOOL_NAMES].sort(),
    ['tools_dispatch', 'tools_get_schema',
      'tools_list_categories', 'tools_list_tools']);
});
