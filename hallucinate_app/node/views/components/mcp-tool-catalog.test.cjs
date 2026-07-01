/**
 * Headless unit tests for mcp-tool-catalog.js — run with:
 *   node mcp-tool-catalog.test.cjs
 *
 * The helper is a browser IIFE component (node/ is an ES-module package, so the
 * component .js files are never imported by node in production — the renderer
 * loads them via <script> and reads window.MCPToolCatalog). To exercise the pure
 * logic headlessly we evaluate the source in a vm sandbox that supplies a
 * CommonJS `module`, so the UMD wrapper hands us its exports.
 *
 * Fixtures mirror the REAL response shapes of the ipfs_kit / ipfs_datasets /
 * ipfs_accelerate MCP++ servers across generations (verified against the
 * swissknife connector-libp2p fixture and the servers' own dashboards).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCatalog() {
  const src = fs.readFileSync(path.join(__dirname, 'mcp-tool-catalog.js'), 'utf8');
  const sandbox = { module: { exports: {} }, self: undefined, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'mcp-tool-catalog.js' });
  return sandbox.module.exports;
}

const MCPToolCatalog = loadCatalog();

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}

const META = ['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch'];
function metaEntries() {
  return META.map((name) => ({ name }));
}
function flat(prefix, n) {
  return Array.from({ length: n }, (_, i) => ({ name: `${prefix}.tool_${i}` }));
}

console.log('mcp-tool-catalog');

// 1. Post-facade full-flat hierarchical surface (e.g. kit: 4 meta + 87 flat).
test('full-flat hierarchical: excludes the 4 meta-tools, counts domain tools', () => {
  const listData = { tools: [...metaEntries(), ...flat('storage', 87)] };
  const s = MCPToolCatalog.summarize(listData);
  assert.strictEqual(s.total, 87, 'total should be 87 domain tools, not 91');
  assert.strictEqual(s.metaTools.length, 4);
  assert.strictEqual(s.domainTools.length, 87);
  assert.strictEqual(s.hierarchical, true);
  assert.strictEqual(s.reduced, false);
  assert.strictEqual(s.source, 'flat_domain');
});

// 2. Reduced meta-only surface + separately fetched categories (the true count).
test('reduced meta-only + categories payload: sums per-category counts', () => {
  const listData = { tools: metaEntries() };
  const before = MCPToolCatalog.summarize(listData);
  assert.strictEqual(before.reduced, true, 'reduced when only meta-tools and no counts');
  assert.strictEqual(before.total, 0);

  // tools_list_categories over REST /mcp/tools/call -> CallToolResult envelope.
  const categoriesData = {
    content: [{ type: 'text', text: JSON.stringify({ categories: [{ name: 'core', count: 3 }, { name: 'storage', count: 5 }] }) }],
    isError: false,
  };
  const s = MCPToolCatalog.summarize(listData, categoriesData);
  assert.strictEqual(s.total, 8, 'core(3) + storage(5) = 8');
  assert.strictEqual(s.reduced, false);
  assert.strictEqual(s.source, 'categories_payload');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(s.categories)),
    [{ name: 'core', count: 3 }, { name: 'storage', count: 5 }]
  );
});

// 3. Reduced meta-only, no categories available -> flagged reduced for the caller.
test('reduced meta-only, no categories: total 0, reduced=true (caller must fetch)', () => {
  const s = MCPToolCatalog.summarize({ tools: metaEntries() });
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.reduced, true);
  assert.strictEqual(s.hierarchical, true);
});

// 4. Accelerate inline `total` is authoritative (it knows its own surface).
test('inline total is honored (accelerate data.total)', () => {
  const listData = { tools: [...metaEntries(), ...flat('hardware', 106)], total: 106 };
  const s = MCPToolCatalog.summarize(listData);
  assert.strictEqual(s.total, 106);
  assert.strictEqual(s.source, 'inline_total');
});

// 4b. Inline total wins even when the list was reduced to meta-only.
test('inline total wins over a reduced list', () => {
  const s = MCPToolCatalog.summarize({ tools: metaEntries(), total: 106 });
  assert.strictEqual(s.total, 106);
  assert.strictEqual(s.reduced, false);
  assert.strictEqual(s.source, 'inline_total');
});

// 5. Inline categories object-map (accelerate data.categories: {name:{count}}).
test('inline categories object-map is summed', () => {
  const listData = { tools: metaEntries(), categories: { hardware: { count: 5 }, models: { count: 8 } } };
  const s = MCPToolCatalog.summarize(listData);
  assert.strictEqual(s.total, 13);
  assert.strictEqual(s.source, 'inline_categories');
  assert.strictEqual(s.reduced, false);
});

// 6. Plain flat legacy server (no meta, no total).
test('flat legacy list: counts entries, not hierarchical', () => {
  const s = MCPToolCatalog.summarize({ tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.hierarchical, false);
  assert.strictEqual(s.reduced, false);
});

// 7. JSON-RPC wrapped tools/list ({result:{tools}}).
test('JSON-RPC wrapped tools/list is unwrapped', () => {
  const listData = { jsonrpc: '2.0', id: 1, result: { tools: [...metaEntries(), ...flat('x', 12)] } };
  const s = MCPToolCatalog.summarize(listData);
  assert.strictEqual(s.total, 12);
  assert.strictEqual(s.source, 'flat_domain');
});

// 8. Bare array response.
test('bare array response', () => {
  const s = MCPToolCatalog.summarize([{ name: 'x' }, { name: 'y' }]);
  assert.strictEqual(s.total, 2);
});

// 9. Categories via JSON-RPC + structuredContent envelope.
test('categories via structuredContent envelope', () => {
  const listData = { tools: metaEntries() };
  const categoriesData = { jsonrpc: '2.0', id: 2, result: { structuredContent: { categories: [{ name: 'a', count: 2 }, { name: 'b', count: 4 }] } } };
  const s = MCPToolCatalog.summarize(listData, categoriesData);
  assert.strictEqual(s.total, 6);
  assert.strictEqual(s.source, 'categories_payload');
});

// 10. Category names-only array (no counts) does not fabricate a total.
test('category names without counts: no fabricated total', () => {
  const listData = { tools: metaEntries() };
  const categoriesData = { categories: ['core', 'storage', 'p2p'] };
  const s = MCPToolCatalog.summarize(listData, categoriesData);
  assert.strictEqual(MCPToolCatalog.sumCategoryCounts(s.categories), null);
  assert.strictEqual(s.total, 0, 'cannot know the count from names alone');
  assert.strictEqual(s.categories.length, 3);
});

// 11. Object-map tools/list (name -> descriptor) is normalized.
test('object-map tools/list is normalized to entries', () => {
  const listData = { tools: { alpha: { description: 'a' }, beta: { description: 'b' } } };
  const s = MCPToolCatalog.summarize(listData);
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.domainTools[0].name, 'alpha');
});

// 12. Dotted flat tools mark the server hierarchical even without meta-tools.
test('dotted flat tools mark the server hierarchical even without meta-tools', () => {
  const s = MCPToolCatalog.summarize({ tools: [{ name: 'storage.ipfs_add' }, { name: 'core.health_check' }] });
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.hierarchical, true);
  assert.strictEqual(s.source, 'flat_domain');
});

// 13. toolCount / isHierarchical convenience wrappers.
test('convenience wrappers agree with summarize', () => {
  const listData = { tools: [...metaEntries(), ...flat('s', 5)] };
  assert.strictEqual(MCPToolCatalog.toolCount(listData), 5);
  assert.strictEqual(MCPToolCatalog.isHierarchical(listData), true);
  assert.strictEqual(MCPToolCatalog.isHierarchical({ tools: [{ name: 'a' }] }), false);
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error('FAILED');
} else {
  console.log('OK');
}
