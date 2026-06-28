/**
 * Schema-Driven UI Renderer
 * 
 * Auto-generates interactive UI forms and result panels from MCP-IDL
 * InterfaceDescriptor method signatures. This bridges the ORB/IDL type system
 * into the hallucinate app's vanilla JS dashboard views.
 * 
 * Given a method's inputSchema and outputSchema, it generates:
 * - Input forms with typed widgets (text, number, checkbox, JSON, CID picker)
 * - Result renderers (table, object view, list, status badge)
 * - Invocation handlers that call the backend and display results
 * 
 * Usage:
 *   <div id="schema-ui"></div>
 *   <script src="components/schema-driven-ui-renderer.js"></script>
 *   <script>
 *     const renderer = new SchemaDrivenUIRenderer(document.getElementById('schema-ui'));
 *     renderer.loadProfile(profileDescriptor);
 *   </script>
 */

(function () {
  'use strict';

  const HANDSFREE_PORT = localStorage.getItem('handsfreePort') || '8080';
  const BASE_URL = `http://localhost:${HANDSFREE_PORT}/v1/ipfs`;

  // Widget type selection based on schema property type and name
  function selectWidget(propName, propSchema) {
    if (propSchema.type === 'boolean') return 'checkbox';
    if (propSchema.type === 'number' || propSchema.type === 'integer') return 'number';
    if (propSchema.type === 'array') return 'json-editor';
    if (propSchema.type === 'object') return 'json-editor';
    if (propName.includes('cid') || propName.includes('CID')) return 'cid-picker';
    if (propName.includes('did') || propName.includes('DID')) return 'did-input';
    if (propName.includes('url') || propName.includes('URL')) return 'url-input';
    return 'text-input';
  }

  // Render kind for output based on schema shape
  function selectRenderKind(schema) {
    if (!schema || !schema.properties) return 'object';
    const keys = Object.keys(schema.properties);
    if (keys.some(k => schema.properties[k].type === 'array')) return 'table';
    if (keys.length <= 3) return 'status';
    return 'object';
  }

  class SchemaDrivenUIRenderer {
    constructor(container, options = {}) {
      this.container = container;
      this.backendUrl = options.backendUrl || BASE_URL;
      this.profile = null;
      this.container.innerHTML = `
        <div class="sdui-wrapper" style="font-family:system-ui,-apple-system,sans-serif;">
          <div class="sdui-header" style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
            <h3 style="margin:0;font-size:1.1rem;">Schema-Driven Interface</h3>
            <span class="sdui-badge" style="background:#4a6cf7;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">IDL Auto-UI</span>
          </div>
          <div class="sdui-profile-selector" style="margin-bottom:12px;"></div>
          <div class="sdui-operations" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;"></div>
          <div class="sdui-form-area" style="margin-bottom:16px;"></div>
          <div class="sdui-result-area"></div>
        </div>
      `;
    }

    /**
     * Load a profile descriptor and generate UI for all its methods
     */
    loadProfile(profile) {
      this.profile = profile;
      const header = this.container.querySelector('.sdui-header h3');
      header.textContent = profile.meta?.name || profile.name || 'Interface';

      const ops = this.container.querySelector('.sdui-operations');
      ops.innerHTML = '';

      const methods = profile.methods || [];
      methods.forEach((method) => {
        const btn = document.createElement('button');
        btn.style.cssText = 'padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;transition:all 0.2s;';
        btn.textContent = method.name;
        btn.title = method.description || '';
        btn.addEventListener('click', () => this._renderOperationForm(method));
        btn.addEventListener('mouseenter', () => { btn.style.background = '#4a6cf7'; btn.style.color = '#fff'; btn.style.borderColor = '#4a6cf7'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; btn.style.color = '#111'; btn.style.borderColor = '#d1d5db'; });
        ops.appendChild(btn);
      });
    }

    /**
     * Load multiple profiles and show a selector
     */
    loadProfiles(profiles) {
      const selector = this.container.querySelector('.sdui-profile-selector');
      selector.innerHTML = '';
      const select = document.createElement('select');
      select.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;';
      profiles.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = p.meta?.name || p.name || `Profile ${i}`;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => this.loadProfile(profiles[select.value]));
      selector.appendChild(select);
      if (profiles.length > 0) this.loadProfile(profiles[0]);
    }

    /**
     * Render an operation form from a method signature
     */
    _renderOperationForm(method) {
      const area = this.container.querySelector('.sdui-form-area');
      const schema = method.inputSchema || method.input_schema || {};
      const properties = schema.properties || {};
      const required = schema.required || [];

      area.innerHTML = `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;font-size:0.95rem;">${method.name}</h4>
            <span style="font-size:11px;color:#6b7280;">${method.description || ''}</span>
          </div>
          <form class="sdui-form" style="display:grid;gap:10px;">
            ${Object.entries(properties).map(([key, prop]) => this._renderField(key, prop, required.includes(key))).join('')}
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button type="submit" style="background:#4a6cf7;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:500;">
                Invoke ${method.name}
              </button>
              <button type="button" class="sdui-clear" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:8px 16px;border-radius:6px;cursor:pointer;">
                Clear
              </button>
            </div>
          </form>
        </div>
      `;

      const form = area.querySelector('.sdui-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._invokeOperation(method, form);
      });
      area.querySelector('.sdui-clear').addEventListener('click', () => form.reset());
    }

    _renderField(name, prop, isRequired) {
      const widget = selectWidget(name, prop);
      const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const reqMark = isRequired ? '<span style="color:#ef4444;">*</span>' : '';

      switch (widget) {
        case 'checkbox':
          return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input type="checkbox" name="${name}" ${prop.default ? 'checked' : ''}>
            ${label} ${reqMark}
          </label>`;
        case 'number':
          return `<label style="font-size:13px;display:flex;flex-direction:column;gap:4px;">
            ${label} ${reqMark}
            <input type="number" name="${name}" value="${prop.default || ''}" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;">
          </label>`;
        case 'json-editor':
          return `<label style="font-size:13px;display:flex;flex-direction:column;gap:4px;">
            ${label} ${reqMark} <span style="font-size:11px;color:#6b7280;">(JSON)</span>
            <textarea name="${name}" rows="3" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-family:monospace;font-size:12px;" placeholder='${JSON.stringify(prop.default || (prop.type === 'array' ? [] : {}))}'></textarea>
          </label>`;
        case 'cid-picker':
          return `<label style="font-size:13px;display:flex;flex-direction:column;gap:4px;">
            ${label} ${reqMark} <span style="font-size:11px;color:#3b82f6;">CID</span>
            <input type="text" name="${name}" placeholder="bafy..." style="padding:6px;border:1px solid #3b82f6;border-radius:4px;font-family:monospace;">
          </label>`;
        case 'url-input':
          return `<label style="font-size:13px;display:flex;flex-direction:column;gap:4px;">
            ${label} ${reqMark}
            <input type="url" name="${name}" placeholder="https://..." style="padding:6px;border:1px solid #d1d5db;border-radius:4px;">
          </label>`;
        default:
          return `<label style="font-size:13px;display:flex;flex-direction:column;gap:4px;">
            ${label} ${reqMark}
            <input type="text" name="${name}" value="${prop.default || ''}" placeholder="${prop.description || ''}" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;">
          </label>`;
      }
    }

    async _invokeOperation(method, form) {
      const resultArea = this.container.querySelector('.sdui-result-area');
      resultArea.innerHTML = '<div style="color:#6b7280;font-size:13px;">Invoking...</div>';

      // Build request body from form
      const formData = new FormData(form);
      const body = {};
      const schema = method.inputSchema || method.input_schema || {};
      const properties = schema.properties || {};

      for (const [key, value] of formData.entries()) {
        const prop = properties[key] || {};
        if (prop.type === 'boolean') {
          body[key] = value === 'on';
        } else if (prop.type === 'number' || prop.type === 'integer') {
          body[key] = Number(value);
        } else if (prop.type === 'array' || prop.type === 'object') {
          try { body[key] = JSON.parse(value); } catch { body[key] = value; }
        } else {
          if (value) body[key] = value;
        }
      }

      // Add unchecked checkboxes as false
      Object.keys(properties).forEach(k => {
        if (properties[k].type === 'boolean' && !(k in body)) body[k] = false;
      });

      // Determine endpoint path from data_contracts
      let path = `/${method.name}`;
      let httpMethod = 'POST';
      if (this.profile && this.profile.data_contracts) {
        const contract = this.profile.data_contracts.operations.find(op => op.method === method.name);
        if (contract) {
          path = contract.path;
          httpMethod = contract.http_method || 'POST';
        }
      }

      try {
        const opts = { method: httpMethod, headers: { 'Content-Type': 'application/json' } };
        let url = `${this.backendUrl}${path}`;
        if (httpMethod === 'GET') {
          const params = new URLSearchParams();
          Object.entries(body).forEach(([k, v]) => { if (v !== '' && v !== undefined) params.set(k, String(v)); });
          if (params.toString()) url += `?${params}`;
        } else {
          opts.body = JSON.stringify(body);
        }

        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 15000);
        opts.signal = ctrl.signal;

        const resp = await fetch(url, opts);
        const data = await resp.json();
        this._renderResult(method, data, resp.ok);
      } catch (e) {
        resultArea.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;color:#dc2626;font-size:13px;">
          <strong>Error:</strong> ${e.message}
        </div>`;
      }
    }

    _renderResult(method, data, success) {
      const resultArea = this.container.querySelector('.sdui-result-area');
      const outputSchema = method.outputSchema || method.output_schema || {};
      const renderKind = selectRenderKind(outputSchema);
      const statusColor = success ? '#10b981' : '#ef4444';
      const statusText = success ? 'Success' : 'Error';

      let contentHtml = '';
      switch (renderKind) {
        case 'table': {
          const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
          if (arrayKey && data[arrayKey].length > 0) {
            const items = data[arrayKey].slice(0, 20);
            const cols = typeof items[0] === 'object' ? Object.keys(items[0]).slice(0, 5) : ['value'];
            contentHtml = `
              <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
                <tr>${cols.map(c => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${c}</th>`).join('')}</tr>
                ${items.map(item => `<tr>${cols.map(c => `<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:11px;">${typeof item === 'object' ? (item[c] ?? '') : item}</td>`).join('')}</tr>`).join('')}
              </table>
              ${data[arrayKey].length > 20 ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">Showing 20 of ${data[arrayKey].length}</div>` : ''}
            `;
          } else {
            contentHtml = `<pre style="font-size:11px;overflow-x:auto;margin:8px 0;">${JSON.stringify(data, null, 2)}</pre>`;
          }
          break;
        }
        case 'status':
          contentHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:8px;">
            ${Object.entries(data).map(([k, v]) => `
              <div style="background:#f9fafb;padding:8px;border-radius:4px;text-align:center;">
                <div style="font-size:11px;color:#6b7280;">${k}</div>
                <div style="font-size:14px;font-weight:600;font-family:monospace;">${typeof v === 'object' ? JSON.stringify(v).substring(0, 30) : v}</div>
              </div>
            `).join('')}
          </div>`;
          break;
        default:
          contentHtml = `<pre style="font-size:11px;overflow-x:auto;margin:8px 0;max-height:300px;overflow-y:auto;">${JSON.stringify(data, null, 2)}</pre>`;
      }

      resultArea.innerHTML = `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-top:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};"></span>
            <span style="font-weight:600;font-size:13px;">${method.name}</span>
            <span style="font-size:11px;color:${statusColor};">${statusText}</span>
            <span style="font-size:11px;color:#6b7280;margin-left:auto;">render: ${renderKind}</span>
          </div>
          ${contentHtml}
        </div>
      `;
    }
  }

  // Export for global access in dashboard views
  if (typeof window !== 'undefined') {
    window.SchemaDrivenUIRenderer = SchemaDrivenUIRenderer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SchemaDrivenUIRenderer };
  }
})();
