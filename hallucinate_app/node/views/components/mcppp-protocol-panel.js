/**
 * MCP++ Protocol Panel
 * 
 * Shows MCP++ profile negotiation status, capability discovery,
 * and execution envelope audit trail for all connected daemons.
 * 
 * Usage:
 *   <div id="mcppp-panel"></div>
 *   <script src="components/mcppp-protocol-panel.js"></script>
 */

(function () {
  'use strict';

  const PROFILES = [
    { id: 'profile-a-idl', name: 'MCP-IDL', desc: 'CID-addressed interface contracts' },
    { id: 'profile-b-cid-artifacts', name: 'CID Artifacts', desc: 'Immutable execution envelopes' },
    { id: 'profile-c-ucan', name: 'UCAN Delegation', desc: 'Capability delegation chains' },
    { id: 'profile-d-temporal-policy', name: 'Temporal Policy', desc: 'Policy-aware execution' },
    { id: 'profile-e-mcp-p2p', name: 'P2P Transport', desc: 'libp2p transport binding' },
  ];

  const DAEMONS = [
    { id: 'ipfs-kit', name: 'IPFS Kit', port: 8014 },
    { id: 'ipfs-datasets', name: 'IPFS Datasets', port: 3002 },
    { id: 'ipfs-accelerate', name: 'IPFS Accelerate', port: 3003 },
  ];

  class MCPPPProtocolPanel {
    constructor(container) {
      this.container = container;
      this.render();
      this.refresh();
    }

    render() {
      this.container.innerHTML = `
        <div class="mcppp-container" style="
          border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #fff;
        ">
          <div class="mcppp-header" style="
            padding: 14px 18px; background: linear-gradient(135deg, #7c3aed, #6d28d9);
            display: flex; align-items: center; justify-content: space-between;
          ">
            <h3 style="margin: 0; font-size: 15px; color: #f5f3ff;">
              <i class="fas fa-shield-alt" style="margin-right: 6px;"></i>
              MCP++ Protocol Status
            </h3>
            <button class="mcppp-refresh" style="
              background: #8b5cf6; border: none; border-radius: 4px;
              padding: 4px 10px; cursor: pointer; font-size: 12px; color: #ede9fe;
            ">Refresh</button>
          </div>

          <div class="mcppp-profiles" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0;">
            <div style="font-size: 12px; font-weight: 600; color: #6d28d9; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
              Available Profiles
            </div>
            <div class="mcppp-profile-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
              ${PROFILES.map(p => `
                <div class="mcppp-profile-card" data-profile="${p.id}" style="
                  padding: 8px 12px; border: 1px solid #e9d5ff; border-radius: 6px;
                  background: #faf5ff;
                ">
                  <div style="font-size: 12px; font-weight: 600; color: #7c3aed;">${p.name}</div>
                  <div style="font-size: 10px; color: #a78bfa; margin-top: 2px;">${p.desc}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="mcppp-daemons" style="padding: 14px 18px;">
            <div style="font-size: 12px; font-weight: 600; color: #6d28d9; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
              Daemon MCP++ Status
            </div>
            <div id="mcppp-daemon-list" style="display: flex; flex-direction: column; gap: 8px;">
              ${DAEMONS.map(d => `
                <div class="mcppp-daemon-row" data-daemon="${d.id}" style="
                  display: flex; align-items: center; gap: 12px;
                  padding: 10px 14px; border: 1px solid #f1f5f9; border-radius: 6px;
                  background: #fafafa;
                ">
                  <span class="mcppp-daemon-indicator" style="
                    width: 8px; height: 8px; border-radius: 50%; background: #94a3b8;
                  "></span>
                  <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: 500;">${d.name}</div>
                    <div class="mcppp-daemon-detail" style="font-size: 11px; color: #94a3b8;">Checking...</div>
                  </div>
                  <div class="mcppp-daemon-profiles" style="display: flex; gap: 4px; flex-wrap: wrap;"></div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="mcppp-envelope-log" style="
            padding: 14px 18px; border-top: 1px solid #e2e8f0; background: #faf5ff;
            max-height: 200px; overflow-y: auto; display: none;
          ">
            <div style="font-size: 12px; font-weight: 600; color: #6d28d9; margin-bottom: 8px;">
              Execution Envelope Log
            </div>
            <div id="mcppp-envelope-entries" style="font-size: 11px; font-family: monospace;"></div>
          </div>
        </div>
      `;

      this.container.querySelector('.mcppp-refresh').addEventListener('click', () => this.refresh());
    }

    async refresh() {
      const daemonApi = window?.electronAPI?.daemon;

      for (const daemon of DAEMONS) {
        const row = this.container.querySelector(`[data-daemon="${daemon.id}"]`);
        if (!row) continue;
        const indicator = row.querySelector('.mcppp-daemon-indicator');
        const detail = row.querySelector('.mcppp-daemon-detail');
        const profilesEl = row.querySelector('.mcppp-daemon-profiles');

        try {
          let mcppp = null;

          // Try getting status from daemon API
          if (daemonApi?.getAll) {
            const status = await daemonApi.getAll();
            mcppp = status?.[daemon.id]?.mcpPlusPlus;
          }

          // Fallback: check direct health
          if (!mcppp) {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 3000);
            const resp = await fetch(`http://localhost:${daemon.port}/api/mcp/status`, { signal: ctrl.signal });
            if (resp.ok) {
              mcppp = { available: true, state: 'available', mode: 'optional_additive', supports_profile_negotiation: true };
            }
          }

          if (mcppp && mcppp.available) {
            indicator.style.background = '#10b981';
            const state = mcppp.state || 'available';
            const mode = mcppp.mode || 'optional';
            detail.textContent = `${state} | mode: ${mode} | negotiation: ${mcppp.supports_profile_negotiation ? 'yes' : 'no'}`;
            detail.style.color = '#059669';

            // Show active profiles
            const profiles = mcppp.profiles || PROFILES.map(p => `mcp++/${p.id}`);
            profilesEl.innerHTML = profiles.map(p => {
              const shortName = p.replace('mcp++/', '').split('-').slice(1).join('-').slice(0, 8);
              return `<span style="padding: 2px 6px; background: #dcfce7; color: #166534; border-radius: 8px; font-size: 9px; font-weight: 600;">${shortName}</span>`;
            }).join('');
          } else {
            indicator.style.background = '#f59e0b';
            detail.textContent = 'MCP++ not available (standard MCP only)';
            detail.style.color = '#d97706';
            profilesEl.innerHTML = '';
          }
        } catch (e) {
          indicator.style.background = '#ef4444';
          detail.textContent = 'Offline';
          detail.style.color = '#ef4444';
          profilesEl.innerHTML = '';
        }
      }
    }

    // Log an execution envelope event
    logEnvelope(envelope) {
      const log = this.container.querySelector('.mcppp-envelope-log');
      const entries = this.container.querySelector('#mcppp-envelope-entries');
      if (!log || !entries) return;
      
      log.style.display = 'block';
      const entry = document.createElement('div');
      entry.style.cssText = 'padding: 4px 0; border-bottom: 1px solid #ede9fe;';
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${envelope.interface_cid?.slice(0, 12)}... → ${envelope.method || 'unknown'}`;
      entries.prepend(entry);

      // Keep only last 50 entries
      while (entries.children.length > 50) {
        entries.removeChild(entries.lastChild);
      }
    }
  }

  // Auto-initialize
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#mcppp-panel, [data-component="mcppp-protocol-panel"]').forEach(el => {
      new MCPPPProtocolPanel(el);
    });
  });

  window.MCPPPProtocolPanel = MCPPPProtocolPanel;
})();
