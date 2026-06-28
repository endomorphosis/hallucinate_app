/**
 * Unified MCP Tool Explorer
 * 
 * Discovers and displays all available MCP tools from all 3 IPFS daemons
 * (kit, datasets, accelerate) plus the handsfree backend in a single unified view.
 * 
 * Usage:
 *   <div id="unified-tool-explorer"></div>
 *   <script src="components/unified-tool-explorer.js"></script>
 */

(function () {
  'use strict';

  const ENDPOINTS = [
    { name: 'IPFS Kit', port: 8004, listPath: '/mcp/tools/list', callPath: '/mcp/tools/call', color: '#3b82f6' },
    { name: 'IPFS Datasets', port: 3002, listPath: '/mcp/tools/list', callPath: '/mcp/tools/call', color: '#10b981' },
    { name: 'IPFS Accelerate', port: 3003, listPath: '/mcp/tools/list', callPath: '/mcp/tools/call', color: '#f59e0b' },
    { name: 'Handsfree API', port: 8080, listPath: '/v1/ipfs/status', callPath: null, color: '#8b5cf6' },
  ];

  class UnifiedToolExplorer {
    constructor(container) {
      this.container = container;
      this.allTools = [];
      this.filteredTools = [];
      this.filterText = '';
      this.filterDaemon = '';
      this.render();
      this.discover();
    }

    render() {
      this.container.innerHTML = `
        <div class="ute-container" style="
          border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #fff;
        ">
          <div class="ute-header" style="
            padding: 14px 18px; background: linear-gradient(135deg, #1e293b, #334155);
            display: flex; align-items: center; justify-content: space-between;
          ">
            <h3 style="margin: 0; font-size: 15px; color: #f1f5f9;">
              <i class="fas fa-tools" style="margin-right: 6px;"></i>
              Unified MCP Tool Explorer
            </h3>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="ute-count" style="font-size: 12px; color: #94a3b8;">Discovering...</span>
              <button class="ute-refresh" style="
                background: #475569; border: none; border-radius: 4px;
                padding: 4px 10px; cursor: pointer; font-size: 12px; color: #e2e8f0;
              ">Refresh</button>
            </div>
          </div>

          <div class="ute-filters" style="
            padding: 12px 18px; background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex; gap: 10px; flex-wrap: wrap;
          ">
            <input class="ute-search" type="text" placeholder="Search tools..." style="
              flex: 1; min-width: 200px; padding: 7px 12px;
              border: 1px solid #cbd5e0; border-radius: 6px; font-size: 13px;
            ">
            <select class="ute-daemon-filter" style="
              padding: 7px 12px; border: 1px solid #cbd5e0; border-radius: 6px; font-size: 13px;
            ">
              <option value="">All Daemons</option>
              <option value="IPFS Kit">IPFS Kit</option>
              <option value="IPFS Datasets">IPFS Datasets</option>
              <option value="IPFS Accelerate">IPFS Accelerate</option>
              <option value="Handsfree API">Handsfree API</option>
            </select>
          </div>

          <div class="ute-daemon-status" style="
            padding: 10px 18px; display: flex; gap: 10px; flex-wrap: wrap;
            border-bottom: 1px solid #e2e8f0;
          "></div>

          <div class="ute-tools-list" style="
            max-height: 500px; overflow-y: auto; padding: 12px 18px;
          ">
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
              <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
              <p>Discovering tools from all MCP daemons...</p>
            </div>
          </div>
        </div>
      `;

      this.container.querySelector('.ute-refresh').addEventListener('click', () => this.discover());
      this.container.querySelector('.ute-search').addEventListener('input', (e) => {
        this.filterText = e.target.value.toLowerCase();
        this.applyFilters();
      });
      this.container.querySelector('.ute-daemon-filter').addEventListener('change', (e) => {
        this.filterDaemon = e.target.value;
        this.applyFilters();
      });
    }

    async discover() {
      const statusBar = this.container.querySelector('.ute-daemon-status');
      const countEl = this.container.querySelector('.ute-count');
      this.allTools = [];
      statusBar.innerHTML = '';

      const results = await Promise.allSettled(
        ENDPOINTS.map(async (ep) => {
          const badge = document.createElement('span');
          badge.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px;
            padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
            background: ${ep.color}15; color: ${ep.color}; border: 1px solid ${ep.color}40;
          `;
          badge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;"></span> ${ep.name}`;
          statusBar.appendChild(badge);

          try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 5000);
            const resp = await fetch(`http://127.0.0.1:${ep.port}${ep.listPath}`, { signal: ctrl.signal });
            
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            
            let tools = [];
            if (Array.isArray(data.tools)) tools = data.tools;
            else if (Array.isArray(data)) tools = data;
            else if (data.endpoints) {
              // Handsfree returns endpoint list
              tools = Object.entries(data).map(([k, v]) => ({
                name: k,
                description: typeof v === 'string' ? v : JSON.stringify(v),
              }));
            }

            // Tag each tool with its source daemon
            tools.forEach(t => { t._source = ep.name; t._color = ep.color; });
            
            // Update badge to green
            badge.querySelector('span').style.background = '#10b981';
            badge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span> ${ep.name} (${tools.length})`;
            
            return tools;
          } catch (e) {
            badge.querySelector('span').style.background = '#ef4444';
            badge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> ${ep.name} (offline)`;
            return [];
          }
        })
      );

      results.forEach(r => {
        if (r.status === 'fulfilled') this.allTools.push(...r.value);
      });

      countEl.textContent = `${this.allTools.length} tools found`;
      this.applyFilters();
    }

    applyFilters() {
      this.filteredTools = this.allTools.filter(t => {
        if (this.filterDaemon && t._source !== this.filterDaemon) return false;
        if (this.filterText) {
          const text = `${t.name} ${t.description || ''}`.toLowerCase();
          if (!text.includes(this.filterText)) return false;
        }
        return true;
      });
      this.renderToolsList();
    }

    renderToolsList() {
      const list = this.container.querySelector('.ute-tools-list');
      
      if (this.filteredTools.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8;">
          ${this.allTools.length === 0 ? 'No tools discovered. Are the MCP daemons running?' : 'No tools match filters.'}
        </div>`;
        return;
      }

      // Group by source
      const grouped = {};
      this.filteredTools.forEach(t => {
        if (!grouped[t._source]) grouped[t._source] = [];
        grouped[t._source].push(t);
      });

      let html = '';
      for (const [source, tools] of Object.entries(grouped)) {
        const color = tools[0]._color || '#6b7280';
        html += `<div style="margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: 700; color: ${color}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
            ${source} (${tools.length})
          </div>`;
        
        tools.forEach(t => {
          const desc = t.description ? t.description.slice(0, 80) : '';
          const hasSchema = t.inputSchema && t.inputSchema.properties;
          const paramCount = hasSchema ? Object.keys(t.inputSchema.properties).length : 0;
          
          html += `<div class="ute-tool-item" style="
            padding: 8px 12px; margin-bottom: 4px;
            border: 1px solid #f1f5f9; border-radius: 6px;
            display: flex; align-items: center; gap: 8px;
            transition: background 0.15s;
            cursor: default;
          " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <span style="
              width: 8px; height: 8px; border-radius: 2px;
              background: ${color}; flex-shrink: 0;
            "></span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${t.name}</div>
              ${desc ? `<div style="font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${desc}</div>` : ''}
            </div>
            ${paramCount > 0 ? `<span style="font-size: 10px; color: #94a3b8; background: #f1f5f9; padding: 2px 6px; border-radius: 8px;">${paramCount} params</span>` : ''}
          </div>`;
        });
        html += '</div>';
      }

      list.innerHTML = html;
    }

    static create(container, options = {}) {
      return new UnifiedToolExplorer(container, options);
    }
  }

  // Auto-initialize
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#unified-tool-explorer, [data-component="unified-tool-explorer"]').forEach(el => {
      new UnifiedToolExplorer(el);
    });
  });

  // Expose globally
  window.UnifiedToolExplorer = UnifiedToolExplorer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UnifiedToolExplorer };
  }
})();
