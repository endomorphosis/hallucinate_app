/**
 * MCP Tool Catalog helper (pure, dependency-free, browser + node)
 *
 * Correctly computes the *true* MCP tool count across every server generation
 * the app talks to. The IPFS MCP++ servers (kit / datasets / accelerate) expose
 * a HIERARCHICAL tool schema to avoid context bloat: `tools/list` returns four
 * plumbing "meta-tools" (tools_list_categories / tools_list_tools /
 * tools_get_schema / tools_dispatch) plus a flat `<category>.<tool>` surface.
 *
 * Counting the raw `tools/list` length is wrong two ways:
 *   1. it counts the 4 meta-tools as if they were real domain tools, and
 *   2. when a server returns only the reduced meta-tool set (no flat
 *      descriptors inlined) it under-reports the true total, which actually
 *      lives in `tools_list_categories` (sum of per-category counts).
 *
 * This module is the single source of truth for that computation so both the
 * unified tool explorer and any other consumer report the same, correct number.
 *
 * Usage (browser):  <script src="components/mcp-tool-catalog.js"></script>
 *                   const cat = window.MCPToolCatalog.summarize(listJson, catJson);
 * Usage (node):     const MCPToolCatalog = require('./mcp-tool-catalog');
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MCPToolCatalog = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The four hierarchical facade meta-tools. These are plumbing, not domain
  // tools, so they must never be counted as part of a server's tool surface.
  const META_TOOL_NAMES = [
    'tools_list_categories',
    'tools_list_tools',
    'tools_get_schema',
    'tools_dispatch',
  ];
  const META_TOOLS = new Set(META_TOOL_NAMES);

  function toolName(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      return entry.name || entry.tool || entry.id || null;
    }
    return null;
  }

  function isMetaTool(name) {
    return META_TOOLS.has(name);
  }

  /**
   * Pull the raw tool array out of the many shapes a tools/list response can
   * take: a bare array, {tools}, {result:{tools}}, {data:{tools}}, or a
   * name->descriptor object map.
   */
  function extractToolList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.tools)) return data.tools;
    if (data.result && Array.isArray(data.result.tools)) return data.result.tools;
    if (data.data && Array.isArray(data.data.tools)) return data.data.tools;
    if (data.tools && typeof data.tools === 'object') {
      return Object.keys(data.tools).map((name) => {
        const v = data.tools[name];
        return v && typeof v === 'object' ? Object.assign({ name }, v) : { name };
      });
    }
    return [];
  }

  /**
   * Unwrap an MCP CallToolResult / JSON-RPC envelope down to its structured
   * payload object. Handles:
   *   { structuredContent: {...} }
   *   { content: [{ type: 'text', text: '<json>' }] }
   *   { result: <envelope> }  (JSON-RPC)
   *   <plain object>          (already unwrapped, e.g. /tools/execute)
   */
  function unwrapToolResult(data) {
    if (data == null || typeof data !== 'object') return data;
    if (data.result !== undefined && data.jsonrpc !== undefined) {
      return unwrapToolResult(data.result);
    }
    if (data.structuredContent && typeof data.structuredContent === 'object') {
      return data.structuredContent;
    }
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          try {
            return JSON.parse(block.text);
          } catch (_e) {
            /* fall through to next block */
          }
        }
      }
    }
    // A JSON-RPC result that wasn't a CallToolResult envelope.
    if (data.result !== undefined && typeof data.result === 'object') {
      return data.result;
    }
    return data;
  }

  function coerceCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /**
   * Normalize the many `categories` shapes into [{ name, count }]:
   *   [{ name, count }]                          (canonical, kit/datasets meta)
   *   [{ name, tool_count }] / [{ name, total }]
   *   ['core', 'storage']                        (names only, count unknown)
   *   { core: 3, storage: 5 }                    (name -> count)
   *   { core: { count: 3 } } / { core: [...] }   (name -> descriptor / list)
   */
  function extractCategoryCounts(categories) {
    if (!categories) return [];
    const out = [];
    if (Array.isArray(categories)) {
      for (const c of categories) {
        if (typeof c === 'string') {
          out.push({ name: c, count: null });
        } else if (c && typeof c === 'object') {
          const name = c.name || c.category || c.id || null;
          const count = coerceCount(
            c.count != null ? c.count : c.tool_count != null ? c.tool_count : c.total
          );
          out.push({ name, count });
        }
      }
      return out;
    }
    if (typeof categories === 'object') {
      for (const name of Object.keys(categories)) {
        const v = categories[name];
        let count = null;
        if (typeof v === 'number') count = coerceCount(v);
        else if (Array.isArray(v)) count = v.length;
        else if (v && typeof v === 'object') {
          count = coerceCount(v.count != null ? v.count : v.tool_count != null ? v.tool_count : v.total);
        }
        out.push({ name, count });
      }
      return out;
    }
    return [];
  }

  function sumCategoryCounts(cats) {
    if (!cats.length) return null;
    let sum = 0;
    let known = 0;
    for (const c of cats) {
      if (typeof c.count === 'number' && Number.isFinite(c.count)) {
        sum += c.count;
        known += 1;
      }
    }
    return known > 0 ? sum : null;
  }

  function inlineTotal(data) {
    if (!data || typeof data !== 'object') return null;
    const candidates = [
      data.total,
      data.total_tools,
      data.tool_count,
      data.result && data.result.total,
      data.result && data.result.total_tools,
      data.result && data.result.tool_count,
    ];
    for (const c of candidates) {
      const n = coerceCount(c);
      if (n != null && n > 0) return n;
    }
    return null;
  }

  function inlineCategories(data) {
    if (!data || typeof data !== 'object') return [];
    if (data.categories) return extractCategoryCounts(data.categories);
    if (data.result && data.result.categories) return extractCategoryCounts(data.result.categories);
    return [];
  }

  /**
   * Summarize a tools/list response (optionally augmented with a separately
   * fetched tools_list_categories payload) into a correct, de-duplicated
   * catalog.
   *
   * @param {*} listData        the tools/list response
   * @param {*} [categoriesData] optional tools_list_categories response
   * @returns {{
   *   total: number,            true domain tool count (excludes meta-tools)
   *   domainTools: Array,       raw tool entries minus meta-tools
   *   metaTools: Array,         the meta-tool entries present
   *   categories: Array,        [{name, count}] when known
   *   hierarchical: boolean,    server uses the meta-tool facade
   *   reduced: boolean,         hierarchical AND no per-tool detail available
   *                             (caller should fetch tools_list_categories)
   *   source: string            how `total` was derived
   * }}
   */
  function summarize(listData, categoriesData) {
    const raw = extractToolList(listData);
    const metaTools = [];
    const domainTools = [];
    let hasDottedName = false;
    for (const entry of raw) {
      const name = toolName(entry);
      if (name && isMetaTool(name)) {
        metaTools.push(entry);
      } else {
        if (name && name.indexOf('.') !== -1) hasDottedName = true;
        domainTools.push(entry);
      }
    }

    let categories = inlineCategories(listData);
    let categoriesFromInline = categories.length > 0;
    if (!categories.length && categoriesData != null) {
      const unwrapped = unwrapToolResult(categoriesData);
      categories = extractCategoryCounts((unwrapped && unwrapped.categories) || unwrapped);
      categoriesFromInline = false;
    }

    const hierarchical = metaTools.length > 0 || hasDottedName || categories.length > 0;

    // Precedence for the authoritative total:
    //   1. an explicit inline total the server reports (it knows best),
    //   2. the sum of per-category counts (inline or fetched),
    //   3. the flat domain-tool count (post-facade full-flat surface),
    //   4. 0 with reduced=true so the caller knows to fetch categories.
    let total = null;
    let source = 'flat';

    const explicit = inlineTotal(listData);
    const catSum = sumCategoryCounts(categories);

    if (explicit != null && explicit >= domainTools.length) {
      total = explicit;
      source = 'inline_total';
    } else if (catSum != null && catSum >= domainTools.length) {
      total = catSum;
      source = categoriesFromInline ? 'inline_categories' : 'categories_payload';
    } else if (domainTools.length > 0) {
      total = domainTools.length;
      source = 'flat_domain';
    } else if (explicit != null) {
      total = explicit;
      source = 'inline_total';
    } else if (catSum != null) {
      total = catSum;
      source = 'categories_payload';
    } else {
      total = 0;
      source = 'flat';
    }

    const reduced = hierarchical && domainTools.length === 0 && catSum == null && explicit == null;

    return {
      total,
      domainTools,
      metaTools,
      categories,
      hierarchical,
      reduced,
      source,
    };
  }

  /**
   * Convenience: does this tools/list look like a hierarchical facade server
   * that we should probe with tools_list_categories for the true count?
   */
  function isHierarchical(listData) {
    return summarize(listData).hierarchical;
  }

  /**
   * Convenience: the correct tool count for a tools/list response, honoring a
   * fetched categories payload when supplied.
   */
  function toolCount(listData, categoriesData) {
    return summarize(listData, categoriesData).total;
  }

  return {
    META_TOOL_NAMES,
    META_TOOLS,
    toolName,
    isMetaTool,
    extractToolList,
    unwrapToolResult,
    extractCategoryCounts,
    sumCategoryCounts,
    inlineTotal,
    inlineCategories,
    summarize,
    isHierarchical,
    toolCount,
  };
});
