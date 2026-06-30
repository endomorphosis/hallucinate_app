/**
 * Universal MCP Tool Invocation Panel
 *
 * A reusable component that:
 * 1. Fetches available tools from a daemon's tools/list endpoint
 * 2. Auto-generates an input form from the tool's inputSchema
 * 3. Invokes the selected tool via tools/call
 * 4. Displays the JSON response and invocation receipt
 *
 * Usage:
 *   <div id="tool-invocation-panel" data-daemon="ipfs-kit" data-port="8004"></div>
 *   <script src="components/tool-invocation-panel.js"></script>
 *
 * Or create programmatically:
 *   ToolInvocationPanel.create(container, { daemon: 'ipfs-kit', port: 8004 });
 */

(function () {
  'use strict';

  const REQUEST_TIMEOUT_MS = 15000;

  const DAEMON_CONFIGS = {
    'ipfs-kit': { port: 8004, toolsListPath: '/mcp/tools/list', toolsCallPath: '/mcp/tools/call' },
    'ipfs-datasets': { port: 3002, toolsListPath: '/mcp/tools/list', toolsCallPath: '/mcp/tools/call' },
    'ipfs-accelerate': { port: 3003, toolsListPath: '/mcp/tools/list', toolsCallPath: '/mcp/tools/call' },
  };

  class ToolInvocationPanel {
    constructor(container, options = {}) {
      this.container = container;
      this.daemon = options.daemon || container.dataset.daemon || 'ipfs-kit';
      this.port = options.port || parseInt(container.dataset.port) || DAEMON_CONFIGS[this.daemon]?.port || 8004;
      this.config = DAEMON_CONFIGS[this.daemon] || DAEMON_CONFIGS['ipfs-kit'];
      this.tools = [];
      this.selectedTool = null;
      this.render();
      this.loadTools();
    }

    render() {
      this.container.innerHTML = `
        <div class="tip-container" style="
          border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #fff;
        ">
          <div class="tip-header" style="
            padding: 12px 16px; background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex; align-items: center; justify-content: space-between;
          ">
            <h3 style="margin: 0; font-size: 14px; color: #1e293b;">
              MCP Tool Invocation — <span class="tip-daemon-label">${this.daemon}</span>
            </h3>
            <button class="tip-refresh-btn" style="
              background: none; border: 1px solid #cbd5e0; border-radius: 4px;
              padding: 4px 10px; cursor: pointer; font-size: 12px; color: #475569;
            ">Refresh Tools</button>
          </div>

          <div class="tip-body" style="padding: 16px;">
            <div class="tip-tool-select" style="margin-bottom: 12px;">
              <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">
                Select Tool
              </label>
              <select class="tip-tool-dropdown" style="
                width: 100%; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px;
                font-size: 13px; background: #fff;
              ">
                <option value="">Loading tools...</option>
              </select>
            </div>

            <div class="tip-schema-info" style="
              margin-bottom: 12px; padding: 8px; background: #f1f5f9;
              border-radius: 4px; font-size: 12px; color: #64748b; display: none;
            "></div>

            <div class="tip-arguments" style="margin-bottom: 12px;"></div>

            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="tip-invoke-btn" style="
                padding: 8px 16px; background: #3b82f6; color: white;
                border: none; border-radius: 4px; cursor: pointer;
                font-size: 13px; font-weight: 500;
              " disabled>Invoke Tool</button>
              <span class="tip-timing" style="font-size: 11px; color: #94a3b8;"></span>
            </div>
          </div>

          <div class="tip-response" style="
            border-top: 1px solid #e2e8f0; padding: 12px 16px;
            display: none; background: #f8fafc;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 600; color: #475569;">Response</span>
              <span class="tip-status-badge" style="
                font-size: 11px; padding: 2px 8px; border-radius: 10px;
              "></span>
            </div>
            <pre class="tip-response-body" style="
              margin: 0; padding: 10px; background: #1e293b; color: #e2e8f0;
              border-radius: 4px; font-size: 12px; overflow: auto; max-height: 300px;
              white-space: pre-wrap; word-break: break-word;
            "></pre>
          </div>

          <div class="tip-receipt" style="
            border-top: 1px solid #e2e8f0; padding: 12px 16px;
            display: none; background: #fffbeb;
          ">
            <span style="font-size: 12px; font-weight: 600; color: #92400e;">Invocation Receipt</span>
            <pre class="tip-receipt-body" style="
              margin: 4px 0 0; padding: 8px; background: #fef3c7; color: #78350f;
              border-radius: 4px; font-size: 11px; overflow: auto; max-height: 150px;
              white-space: pre-wrap;
            "></pre>
          </div>
        </div>
      `;

      this.container.querySelector('.tip-refresh-btn').addEventListener('click', () => this.loadTools());
      this.container.querySelector('.tip-tool-dropdown').addEventListener('change', (e) => this.onToolSelected(e.target.value));
      this.container.querySelector('.tip-invoke-btn').addEventListener('click', () => this.invoke());
    }

    // Resolve the daemon's live port from the daemon manager. The MCP daemon
    // manager may bind a daemon to a fallback port when its preferred port is
    // already taken (e.g. by another process), so the hard-coded data-port is
    // only a default — always prefer the actual runtime port/endpoint.
    async resolveLivePort() {
      try {
        const getAll = window.electronAPI?.daemon?.getAll;
        if (typeof getAll !== 'function') return;
        const all = await getAll();
        const info = all && all[this.daemon];
        if (!info) return;
        let livePort = info.port;
        if (!livePort && typeof info.endpoint === 'string') {
          const m = info.endpoint.match(/:(\d+)\b/);
          if (m) livePort = parseInt(m[1], 10);
        }
        if (livePort && Number.isFinite(livePort)) {
          this.port = livePort;
        }
      } catch { /* keep the default port */ }
    }

    async loadTools() {
      const dropdown = this.container.querySelector('.tip-tool-dropdown');
      dropdown.innerHTML = '<option value="">Loading...</option>';

      await this.resolveLivePort();

      try {
        // Try IPC first
        let tools = null;
        if (window.electronAPI?.daemon?.dashboardToolsList) {
          try {
            const result = await window.electronAPI.daemon.dashboardToolsList(this.daemon);
            if (result?.tools || result?.receipt?.status === 'ok') {
              tools = result.tools || [];
            }
          } catch { /* fall through */ }
        }

        // Direct HTTP fallback
        if (!tools) {
          const url = `http://127.0.0.1:${this.port}${this.config.toolsListPath}`;
          const resp = await this.fetchWithTimeout(url);
          const data = await resp.json();
          tools = (data.result && data.result.tools) || data.tools || data || [];
        }

        this.tools = Array.isArray(tools) ? tools : [];

        if (this.tools.length === 0) {
          dropdown.innerHTML = '<option value="">No tools available</option>';
          return;
        }

        dropdown.innerHTML = '<option value="">-- Select a tool --</option>' +
          this.tools.map(t =>
            `<option value="${t.name}">${t.name}${t.description ? ' - ' + t.description.slice(0, 60) : ''}</option>`
          ).join('');

      } catch (err) {
        dropdown.innerHTML = `<option value="">Error: ${err.message}</option>`;
        this.tools = [];
      }
    }

    onToolSelected(toolName) {
      this.selectedTool = this.tools.find(t => t.name === toolName) || null;
      const invokeBtn = this.container.querySelector('.tip-invoke-btn');
      const argsContainer = this.container.querySelector('.tip-arguments');
      const schemaInfo = this.container.querySelector('.tip-schema-info');

      if (!this.selectedTool) {
        invokeBtn.disabled = true;
        argsContainer.innerHTML = '';
        schemaInfo.style.display = 'none';
        return;
      }

      invokeBtn.disabled = false;

      // Show schema info
      if (this.selectedTool.description) {
        schemaInfo.textContent = this.selectedTool.description;
        schemaInfo.style.display = 'block';
      } else {
        schemaInfo.style.display = 'none';
      }

      // Auto-generate form from inputSchema
      const schema = this.selectedTool.inputSchema;
      if (schema && schema.properties) {
        argsContainer.innerHTML = this.generateFormFromSchema(schema);
      } else {
        argsContainer.innerHTML = `
          <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">
            Arguments (JSON)
          </label>
          <textarea class="tip-raw-args" style="
            width: 100%; height: 80px; padding: 8px; border: 1px solid #cbd5e0;
            border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical;
          " placeholder='{}'>{}</textarea>
        `;
      }
    }

    generateFormFromSchema(schema) {
      const props = schema.properties || {};
      const required = new Set(schema.required || []);
      let html = '';

      for (const [name, prop] of Object.entries(props)) {
        const isRequired = required.has(name);
        const label = `${name}${isRequired ? ' *' : ''}`;
        const type = prop.type || 'string';
        const desc = prop.description || '';

        html += `<div style="margin-bottom: 8px;">`;
        html += `<label style="font-size: 12px; font-weight: 500; color: #475569; display: block; margin-bottom: 2px;">
          ${label} <span style="color: #94a3b8; font-weight: 400;">(${type})</span>
        </label>`;

        if (desc) {
          html += `<span style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px;">${desc}</span>`;
        }

        if (type === 'boolean') {
          html += `<select class="tip-field" data-field="${name}" style="padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 12px;">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>`;
        } else if (prop.enum) {
          html += `<select class="tip-field" data-field="${name}" style="padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 12px; width: 100%;">
            ${prop.enum.map(v => `<option value="${v}">${v}</option>`).join('')}
          </select>`;
        } else if (type === 'integer' || type === 'number') {
          html += `<input class="tip-field" data-field="${name}" type="number" style="
            width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 12px;
          " placeholder="${prop.default !== undefined ? prop.default : ''}" />`;
        } else {
          html += `<input class="tip-field" data-field="${name}" type="text" style="
            width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 12px;
          " placeholder="${prop.default !== undefined ? prop.default : ''}" />`;
        }

        html += `</div>`;
      }

      return html;
    }

    collectArguments() {
      // Check if raw JSON textarea exists
      const rawArgs = this.container.querySelector('.tip-raw-args');
      if (rawArgs) {
        try {
          return JSON.parse(rawArgs.value || '{}');
        } catch {
          return {};
        }
      }

      // Collect from generated form fields
      const args = {};
      const fields = this.container.querySelectorAll('.tip-field');
      for (const field of fields) {
        const name = field.dataset.field;
        let value = field.value;
        if (!value && !field.required) continue;

        // Type coercion
        const schema = this.selectedTool?.inputSchema?.properties?.[name];
        const type = schema?.type;
        if (type === 'boolean') value = value === 'true';
        else if (type === 'integer') value = parseInt(value, 10);
        else if (type === 'number') value = parseFloat(value);

        if (value !== '' && value !== null && !Number.isNaN(value)) {
          args[name] = value;
        }
      }
      return args;
    }

    async invoke() {
      if (!this.selectedTool) return;

      const invokeBtn = this.container.querySelector('.tip-invoke-btn');
      const timing = this.container.querySelector('.tip-timing');
      const responseSection = this.container.querySelector('.tip-response');
      const responseBody = this.container.querySelector('.tip-response-body');
      const statusBadge = this.container.querySelector('.tip-status-badge');
      const receiptSection = this.container.querySelector('.tip-receipt');
      const receiptBody = this.container.querySelector('.tip-receipt-body');

      invokeBtn.disabled = true;
      invokeBtn.textContent = 'Invoking...';
      timing.textContent = '';

      const args = this.collectArguments();
      const startTime = performance.now();

      try {
        const url = `http://127.0.0.1:${this.port}${this.config.toolsCallPath}`;
        const resp = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.selectedTool.name, arguments: args }),
        });

        const elapsed = Math.round(performance.now() - startTime);
        timing.textContent = `${elapsed}ms`;

        const data = await resp.json();

        responseSection.style.display = 'block';
        responseBody.textContent = JSON.stringify(data, null, 2);

        if (resp.ok) {
          statusBadge.textContent = `${resp.status} OK`;
          statusBadge.style.background = '#d1fae5';
          statusBadge.style.color = '#065f46';
        } else {
          statusBadge.textContent = `${resp.status} Error`;
          statusBadge.style.background = '#fee2e2';
          statusBadge.style.color = '#991b1b';
        }

        // Generate invocation receipt
        const receipt = {
          tool_name: this.selectedTool.name,
          daemon_id: this.daemon,
          server_package: this.daemon === 'ipfs-kit' ? 'ipfs_kit_py' :
            this.daemon === 'ipfs-datasets' ? 'ipfs_datasets_py' : 'ipfs_accelerate_py',
          transport: 'http',
          endpoint: `http://127.0.0.1:${this.port}`,
          rpc_path: this.config.toolsCallPath,
          arguments_hash: this.hashArgs(args),
          upstream_status: resp.ok ? 'success' : 'error',
          http_status: resp.status,
          latency_ms: elapsed,
          timestamp: new Date().toISOString(),
        };

        receiptSection.style.display = 'block';
        receiptBody.textContent = JSON.stringify(receipt, null, 2);

      } catch (err) {
        const elapsed = Math.round(performance.now() - startTime);
        timing.textContent = `${elapsed}ms (failed)`;

        responseSection.style.display = 'block';
        responseBody.textContent = `Error: ${err.message}`;
        statusBadge.textContent = 'Network Error';
        statusBadge.style.background = '#fee2e2';
        statusBadge.style.color = '#991b1b';

        receiptSection.style.display = 'none';
      } finally {
        invokeBtn.disabled = false;
        invokeBtn.textContent = 'Invoke Tool';
      }
    }

    hashArgs(args) {
      const str = JSON.stringify(args);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return 'args:' + Math.abs(hash).toString(16);
    }

    async fetchWithTimeout(url, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    static create(container, options) {
      return new ToolInvocationPanel(container, options);
    }
  }

  // Auto-initialize panels with data attributes
  function init() {
    const panels = document.querySelectorAll('[id="tool-invocation-panel"], [data-component="tool-invocation-panel"]');
    for (const panel of panels) {
      if (!panel._tipInstance) {
        panel._tipInstance = new ToolInvocationPanel(panel);
      }
    }
  }

  // Expose globally
  window.ToolInvocationPanel = ToolInvocationPanel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
