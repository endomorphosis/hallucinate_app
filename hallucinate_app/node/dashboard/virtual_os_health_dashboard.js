/**
 * Virtual AI OS health dashboard.
 *
 * The dashboard consumes the OS observability DashboardSnapshot shape, but it
 * also accepts the lighter VirtualOSDaemonManager getAllStatus() map so tests
 * and desktop shells can render without starting live daemons or Python
 * services.
 */

const EMPTY_SNAPSHOT = Object.freeze({
  generated_at: null,
  health: 'unknown',
  components: [],
  daemons: [],
  metrics: [],
  events: [],
  traces: [],
  mcp_dag: null,
  notices: [],
  metadata: {}
});

const HEALTH_STATES = new Set([
  'healthy',
  'degraded',
  'starting',
  'unhealthy',
  'stopped',
  'unknown'
]);

const COMPONENT_TITLES = Object.freeze({
  ipfs_kit_py: 'IPFS Kit',
  ipfs_datasets_py: 'IPFS Datasets',
  ipfs_accelerate_py: 'IPFS Accelerate',
  swissknife: 'SwissKnife',
  mcp_plus_plus: 'MCP++ Service Mesh'
});

export class VirtualOSHealthDashboard {
  constructor(options = {}) {
    this.options = {
      refreshIntervalMs: 0,
      showRefreshButton: true,
      ...options
    };
    this.element = options.element || options.container || null;
    this.eventBus = options.eventBus || createNoopEventBus();
    this.healthSource = options.healthSource || options.snapshotProvider || options.daemonManager || null;
    this.snapshot = normalizeVirtualOSHealthSnapshot(options.snapshot || EMPTY_SNAPSHOT);
    this.initialized = false;
    this.refreshTimer = null;
    this._handleRefresh = this.refresh.bind(this);
    this._handleSnapshotEvent = this._handleSnapshotEvent.bind(this);
  }

  async init() {
    if (this.initialized) {
      return true;
    }
    if (!this.element) {
      throw new Error('VirtualOSHealthDashboard requires an element or container.');
    }

    this.element.classList?.add('virtual-os-health-dashboard');
    this._registerEvents();
    await this.refresh();
    this._startRefreshTimer();
    this.initialized = true;
    return true;
  }

  async refresh() {
    const sourceSnapshot = await this._loadSnapshot();
    this.snapshot = normalizeVirtualOSHealthSnapshot(sourceSnapshot);
    const html = this.render();
    emitEvent(this.eventBus, 'virtual-os-health:refreshed', { snapshot: this.snapshot });
    return html;
  }

  render(snapshot = this.snapshot) {
    const normalized = normalizeVirtualOSHealthSnapshot(snapshot);
    this.snapshot = normalized;
    const html = renderVirtualOSHealthHTML(normalized, this.options);

    if (this.element) {
      this.element.innerHTML = html;
      const refreshButton = this.element.querySelector?.('[data-virtual-os-action="refresh"]');
      refreshButton?.addEventListener?.('click', this._handleRefresh);
    }

    return html;
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.initialized = false;
  }

  async _loadSnapshot() {
    if (this.healthSource) {
      return getSnapshotFromSource(this.healthSource);
    }
    return this.snapshot;
  }

  _registerEvents() {
    registerEvent(this.eventBus, 'virtual-os-health:refresh', this._handleRefresh);
    registerEvent(this.eventBus, 'virtual-os-health:snapshot', this._handleSnapshotEvent);
    registerEvent(this.eventBus, 'virtual-os:snapshot', this._handleSnapshotEvent);
  }

  _startRefreshTimer() {
    const intervalMs = Number(this.options.refreshIntervalMs || 0);
    if (intervalMs <= 0) {
      return;
    }
    this.refreshTimer = setInterval(() => {
      this.refresh().catch((error) => {
        emitEvent(this.eventBus, 'virtual-os-health:error', { error });
      });
    }, intervalMs);
    if (typeof this.refreshTimer.unref === 'function') {
      this.refreshTimer.unref();
    }
  }

  _handleSnapshotEvent(payload) {
    const snapshot = payload?.snapshot || payload;
    this.snapshot = normalizeVirtualOSHealthSnapshot(snapshot);
    this.render(this.snapshot);
  }
}

export async function getSnapshotFromSource(source) {
  if (!source) {
    return EMPTY_SNAPSHOT;
  }
  if (typeof source === 'function') {
    return source();
  }

  for (const methodName of [
    'dashboardSnapshot',
    'getDashboardSnapshot',
    'getHealthSnapshot',
    'healthSnapshot',
    'dashboard_snapshot',
    'getSnapshot',
    'snapshot'
  ]) {
    if (typeof source[methodName] === 'function') {
      return source[methodName]();
    }
  }

  if (typeof source.getAllStatus === 'function') {
    return snapshotFromDaemonStatus(await source.getAllStatus(), {
      metadata: { source: 'virtual_os_daemon_manager' }
    });
  }

  if (typeof source.getStatus === 'function') {
    return snapshotFromDaemonStatus(await source.getStatus(), {
      metadata: { source: 'daemon_status' }
    });
  }

  if (source.dashboard_snapshot && typeof source.dashboard_snapshot === 'object') {
    return source.dashboard_snapshot;
  }

  if (source.snapshot && typeof source.snapshot === 'object') {
    return source.snapshot;
  }

  return source;
}

export function snapshotFromDaemonStatus(statuses, options = {}) {
  const daemons = normalizeDaemonRows(statuses);
  const components = daemons.map((daemon) => ({
    component: daemon.component,
    title: daemon.title,
    state: daemon.state,
    daemon_id: daemon.daemon_id,
    last_heartbeat_at: daemon.checked_at || daemon.observed_at || null,
    stale: daemon.stale,
    message: daemon.message || daemon.last_error || '',
    metadata: {
      daemon_status: daemon.status,
      endpoint: daemon.endpoint,
      restart_count: daemon.restart_count
    }
  }));
  return normalizeVirtualOSHealthSnapshot({
    generated_at: options.generated_at || new Date().toISOString(),
    components,
    daemons,
    metrics: [],
    events: [],
    traces: [],
    mcp_dag: options.mcp_dag || null,
    notices: options.notices || [],
    metadata: options.metadata || {}
  });
}

export function normalizeVirtualOSHealthSnapshot(input = EMPTY_SNAPSHOT) {
  if (looksLikeDaemonStatusMap(input)) {
    return snapshotFromDaemonStatus(input);
  }

  const raw = input && typeof input === 'object' ? input : EMPTY_SNAPSHOT;
  let daemons = normalizeDaemonRows(raw.daemons || raw.heartbeats || raw.daemon_boot || raw.daemonBoot || raw.daemon_status || raw.daemonStatus || []);
  let components = normalizeComponentRows(raw.components || raw.component_health || raw.componentHealth || []);

  if (components.length === 0 && daemons.length > 0) {
    components = daemons.map((daemon) => ({
      component: daemon.component,
      title: daemon.title,
      state: daemon.state,
      daemon_id: daemon.daemon_id,
      last_heartbeat_at: daemon.checked_at || daemon.observed_at || null,
      stale: daemon.stale,
      message: daemon.message || daemon.last_error || '',
      metrics: [],
      metadata: {
        daemon_status: daemon.status,
        endpoint: daemon.endpoint
      }
    }));
  }

  const mcpDag = normalizeMcpDag(raw.mcp_dag || raw.mcpDag || raw.event_dag || raw.eventDag || null);
  const health = normalizeHealthState(raw.health || raw.aggregate_health || rollupHealth([...components, ...daemons]));
  const notices = normalizeStringArray(raw.notices);
  const errors = normalizeStringArray(raw.errors || raw.boot?.errors);
  const metadata = normalizeObject(raw.metadata);
  const mcpMesh = normalizeMcpMesh(raw.mcp_mesh || raw.mcpMesh || {}, {
    mcpDag,
    components,
    daemons
  });
  const degradedMode = normalizeDegradedMode(raw, {
    health,
    components,
    daemons,
    notices,
    errors,
    mcpMesh
  });

  return {
    generated_at: raw.generated_at || raw.generatedAt || raw.generated || null,
    health,
    components,
    daemons,
    metrics: normalizeArray(raw.metrics),
    events: normalizeArray(raw.events),
    traces: normalizeArray(raw.traces),
    mcp_dag: mcpDag,
    mcpMesh,
    degradedMode,
    notices,
    errors,
    metadata,
    boot: raw.boot || null
  };
}

export function renderVirtualOSHealthHTML(snapshot, options = {}) {
  const normalized = normalizeVirtualOSHealthSnapshot(snapshot);
  const generatedAt = formatTimestamp(normalized.generated_at);
  const degradedReason = normalized.degradedMode.reason || 'No degraded mode reason reported.';

  return `
    <section class="virtual-os-health-shell" data-health-state="${escapeAttribute(normalized.health)}">
      <header class="virtual-os-health-header">
        <div>
          <h2>Virtual AI OS Health</h2>
          <p class="virtual-os-health-updated">Updated ${escapeHTML(generatedAt)}</p>
        </div>
        <div class="virtual-os-health-header-actions">
          <span class="${stateClass('virtual-os-state', normalized.health)}" data-testid="virtual-os-health-state">${escapeHTML(formatState(normalized.health))}</span>
          ${options.showRefreshButton === false ? '' : '<button type="button" class="virtual-os-refresh-button" data-virtual-os-action="refresh">Refresh</button>'}
        </div>
      </header>

      <div class="virtual-os-summary-grid">
        ${renderSummaryTile('Components', String(normalized.components.length), rollupHealth(normalized.components))}
        ${renderSummaryTile('Daemons', String(normalized.daemons.length), rollupHealth(normalized.daemons))}
        ${renderSummaryTile('MCP++ Mesh', formatState(normalized.mcpMesh.state), normalized.mcpMesh.state)}
      </div>

      <section class="virtual-os-degraded-mode" data-degraded-active="${normalized.degradedMode.active ? 'true' : 'false'}">
        <div class="virtual-os-section-heading">
          <h3>Degraded Mode</h3>
          <span class="${stateClass('virtual-os-state', normalized.degradedMode.active ? 'degraded' : 'healthy')}">${normalized.degradedMode.active ? 'Active' : 'Inactive'}</span>
        </div>
        <p data-testid="virtual-os-degraded-reason">${escapeHTML(degradedReason)}</p>
      </section>

      <section class="virtual-os-health-section" data-section="components">
        <div class="virtual-os-section-heading">
          <h3>Component Health</h3>
          <span>${escapeHTML(String(normalized.components.length))}</span>
        </div>
        ${renderComponentTable(normalized.components)}
      </section>

      <section class="virtual-os-health-section" data-section="daemons">
        <div class="virtual-os-section-heading">
          <h3>Daemon Status</h3>
          <span>${escapeHTML(String(normalized.daemons.length))}</span>
        </div>
        ${renderDaemonTable(normalized.daemons)}
      </section>

      <section class="virtual-os-health-section" data-section="mcp-mesh">
        <div class="virtual-os-section-heading">
          <h3>MCP++ Mesh Status</h3>
          <span class="${stateClass('virtual-os-state', normalized.mcpMesh.state)}">${escapeHTML(formatState(normalized.mcpMesh.state))}</span>
        </div>
        ${renderMcpMesh(normalized.mcpMesh)}
      </section>

      ${renderNotices(normalized.notices, normalized.errors)}
    </section>
  `.trim();
}

function renderSummaryTile(label, value, state) {
  return `
    <div class="virtual-os-summary-tile" data-summary="${escapeAttribute(label.toLowerCase().replace(/\W+/g, '-'))}">
      <span class="virtual-os-summary-label">${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      <span class="${stateClass('virtual-os-state', state)}">${escapeHTML(formatState(state))}</span>
    </div>
  `;
}

function renderComponentTable(components) {
  if (!components.length) {
    return '<div class="virtual-os-empty">No component health reported.</div>';
  }
  const rows = components.map((component) => `
    <tr data-component="${escapeAttribute(component.component)}" data-state="${escapeAttribute(component.state)}">
      <td>
        <strong>${escapeHTML(component.title || displayComponentName(component.component))}</strong>
        <span>${escapeHTML(component.component)}</span>
      </td>
      <td><span class="${stateClass('virtual-os-state', component.state)}">${escapeHTML(formatState(component.state))}</span></td>
      <td>${escapeHTML(component.daemon_id || '')}</td>
      <td>${escapeHTML(component.message || degradedMessageFromMetadata(component.metadata) || '')}</td>
    </tr>
  `).join('');

  return `
    <table class="virtual-os-health-table">
      <thead>
        <tr>
          <th scope="col">Component</th>
          <th scope="col">Health</th>
          <th scope="col">Daemon</th>
          <th scope="col">Message</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderDaemonTable(daemons) {
  if (!daemons.length) {
    return '<div class="virtual-os-empty">No daemon status reported.</div>';
  }
  const rows = daemons.map((daemon) => `
    <tr data-daemon="${escapeAttribute(daemon.daemon_id)}" data-state="${escapeAttribute(daemon.state)}" data-status="${escapeAttribute(daemon.status)}">
      <td>
        <strong>${escapeHTML(daemon.title || displayComponentName(daemon.component))}</strong>
        <span>${escapeHTML(daemon.daemon_id)}</span>
      </td>
      <td><span class="${stateClass('virtual-os-state', daemon.state)}">${escapeHTML(formatState(daemon.state))}</span></td>
      <td>${escapeHTML(daemon.status || '')}</td>
      <td>${escapeHTML(daemon.pid == null ? '' : String(daemon.pid))}</td>
      <td>${escapeHTML(daemon.endpoint || '')}</td>
      <td>${escapeHTML(daemon.last_error || daemon.message || '')}</td>
    </tr>
  `).join('');

  return `
    <table class="virtual-os-health-table">
      <thead>
        <tr>
          <th scope="col">Daemon</th>
          <th scope="col">Health</th>
          <th scope="col">Status</th>
          <th scope="col">PID</th>
          <th scope="col">Endpoint</th>
          <th scope="col">Last Error</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderMcpMesh(mesh) {
  return `
    <div class="virtual-os-mcp-mesh" data-state="${escapeAttribute(mesh.state)}">
      <div class="virtual-os-mesh-stat">
        <span>Nodes</span>
        <strong data-testid="virtual-os-mcp-nodes">${escapeHTML(String(mesh.nodeCount))}</strong>
      </div>
      <div class="virtual-os-mesh-stat">
        <span>Edges</span>
        <strong data-testid="virtual-os-mcp-edges">${escapeHTML(String(mesh.edgeCount))}</strong>
      </div>
      <div class="virtual-os-mesh-stat">
        <span>Orphan Parents</span>
        <strong>${escapeHTML(String(mesh.orphanParentCount))}</strong>
      </div>
      <div class="virtual-os-mesh-stat">
        <span>Peers</span>
        <strong>${escapeHTML(String(mesh.peerCount))}</strong>
      </div>
      <p>${escapeHTML(mesh.reason || mesh.status || 'No MCP++ mesh detail reported.')}</p>
      ${mesh.profiles.length ? `<p class="virtual-os-mesh-profiles">${escapeHTML(mesh.profiles.join(', '))}</p>` : ''}
    </div>
  `;
}

function renderNotices(notices, errors) {
  const rows = [
    ...errors.map((message) => ({ type: 'error', message })),
    ...notices.map((message) => ({ type: 'notice', message }))
  ];
  if (!rows.length) {
    return '';
  }
  return `
    <section class="virtual-os-health-section" data-section="notices">
      <div class="virtual-os-section-heading">
        <h3>Notices</h3>
        <span>${escapeHTML(String(rows.length))}</span>
      </div>
      <ul class="virtual-os-notices">
        ${rows.map((row) => `<li data-notice-type="${escapeAttribute(row.type)}">${escapeHTML(row.message)}</li>`).join('')}
      </ul>
    </section>
  `;
}

function normalizeComponentRows(value) {
  return normalizeEntries(value).map(([key, row]) => {
    const item = normalizeObject(row);
    const component = String(
      item.component ||
      item.component_id ||
      item.componentId ||
      item.id ||
      key ||
      'unknown'
    );
    const metadata = normalizeObject(item.metadata);
    const stale = Boolean(item.stale);
    const state = stale
      ? 'unhealthy'
      : normalizeHealthState(item.state || item.health || item.status || metadata.health_state);
    return {
      component,
      title: item.title || item.name || metadata.title || displayComponentName(component),
      state,
      daemon_id: item.daemon_id || item.daemonId || item.daemon || null,
      last_heartbeat_at: item.last_heartbeat_at || item.lastHeartbeatAt || item.observed_at || null,
      stale,
      message: firstString(
        item.message,
        item.reason,
        item.error,
        item.last_error,
        item.lastError,
        metadata.degraded_reason,
        metadata.degraded_mode_reason,
        metadata.degradedModeReason,
        metadata.reason,
        degradedMessageFromMetadata(metadata)
      ),
      metrics: normalizeArray(item.metrics),
      metadata
    };
  });
}

function normalizeDaemonRows(value) {
  return normalizeEntries(value).map(([key, row]) => {
    const item = normalizeObject(row);
    const health = normalizeObject(item.health);
    const metadata = normalizeObject(item.metadata);
    const serviceStatus = normalizeObject(item.service_status || item.serviceStatus);
    const daemonId = String(item.daemon_id || item.daemonId || item.id || key || 'unknown');
    const component = String(item.component || item.component_id || item.componentId || daemonId);
    const stale = Boolean(item.stale || health.stale);
    const state = stale
      ? 'unhealthy'
      : normalizeHealthState(item.state || health.state || serviceStatus.state || item.health_state || item.status);
    const status = String(item.status || metadata.boot_status || state || 'unknown');
    const endpoint = formatEndpoint(item.endpoint || health.endpoint || serviceStatus.details?.endpoint);

    return {
      daemon_id: daemonId,
      component,
      title: item.title || item.name || displayComponentName(component),
      state,
      status,
      pid: item.pid == null ? null : item.pid,
      endpoint,
      observed_at: item.observed_at || item.observedAt || item.checked_at || item.checkedAt || health.checkedAt || health.checked_at || null,
      checked_at: item.checked_at || item.checkedAt || health.checkedAt || health.checked_at || null,
      uptime_seconds: item.uptime_seconds || item.uptimeSeconds || msToSeconds(item.uptimeMs),
      stale,
      restart_count: item.restart_count ?? item.restartCount ?? null,
      last_error: firstString(item.last_error, item.lastError, health.error, serviceStatus.message),
      message: firstString(item.message, health.reason, health.message, serviceStatus.message),
      metrics: normalizeArray(item.metrics),
      dependencies: normalizeStringArray(item.dependencies),
      metadata
    };
  });
}

function normalizeMcpDag(value) {
  if (!value || typeof value !== 'object') {
    return {
      nodes: [],
      edges: [],
      root_event_ids: [],
      orphan_parent_event_ids: [],
      trace_id: null,
      generated_at: null,
      metadata: {}
    };
  }
  return {
    nodes: normalizeArray(value.nodes),
    edges: normalizeArray(value.edges),
    root_event_ids: normalizeStringArray(value.root_event_ids || value.rootEventIds),
    orphan_parent_event_ids: normalizeStringArray(value.orphan_parent_event_ids || value.orphanParentEventIds),
    trace_id: value.trace_id || value.traceId || null,
    generated_at: value.generated_at || value.generatedAt || null,
    metadata: normalizeObject(value.metadata)
  };
}

function normalizeMcpMesh(value, context) {
  const mesh = normalizeObject(value);
  const mcpDag = context.mcpDag;
  const mcpComponent = context.components.find((component) => isMcpPlusPlus(component.component, component.title));
  const mcpDaemon = context.daemons.find((daemon) => (
    isMcpPlusPlus(daemon.daemon_id, daemon.title) ||
    isMcpPlusPlus(daemon.component, daemon.title)
  ));
  const metadata = {
    ...normalizeObject(mcpDag.metadata),
    ...normalizeObject(mcpComponent?.metadata),
    ...normalizeObject(mcpDaemon?.metadata),
    ...normalizeObject(mesh.metadata)
  };
  const nodeCount = numberOr(mesh.node_count, mesh.nodeCount, mesh.nodes, mcpDag.nodes.length);
  const edgeCount = numberOr(mesh.edge_count, mesh.edgeCount, mesh.edges, mcpDag.edges.length);
  const orphanParentCount = numberOr(
    mesh.orphan_parent_count,
    mesh.orphanParentCount,
    mcpDag.orphan_parent_event_ids.length
  );
  const peerIds = new Set(normalizeStringArray(mesh.peers || mesh.peer_ids || mesh.peerIds));
  for (const node of mcpDag.nodes) {
    const peerId = node?.peer_id || node?.peerId;
    if (peerId) {
      peerIds.add(String(peerId));
    }
  }

  const state = normalizeHealthState(
    mesh.state ||
    mesh.health ||
    metadata.state ||
    metadata.health ||
    mcpComponent?.state ||
    mcpDaemon?.state ||
    (nodeCount > 0 || edgeCount > 0 ? 'healthy' : 'unknown')
  );
  const profiles = normalizeStringArray(
    mesh.profiles ||
    mesh.mcpPlusPlusProfiles ||
    metadata.mcpPlusPlusProfiles ||
    metadata.mcp_plus_plus_profiles
  );

  return {
    state,
    status: String(mesh.status || mcpDaemon?.status || formatState(state)),
    nodeCount,
    edgeCount,
    orphanParentCount,
    peerCount: numberOr(mesh.peer_count, mesh.peerCount, peerIds.size),
    profiles,
    reason: firstString(
      mesh.reason,
      mesh.message,
      metadata.degraded_reason,
      metadata.degraded_mode_reason,
      metadata.degradedModeReason,
      metadata.reason,
      mcpDaemon?.last_error,
      mcpDaemon?.message,
      mcpComponent?.message
    ),
    metadata
  };
}

function normalizeDegradedMode(raw, context) {
  const metadata = normalizeObject(raw.metadata);
  const degradedMode = normalizeObject(raw.degraded_mode || raw.degradedMode);
  const active = Boolean(
    degradedMode.active ??
    degradedMode.enabled ??
    ['degraded', 'unhealthy', 'starting'].includes(context.health)
  );
  const reason = firstString(
    raw.degraded_reason,
    raw.degraded_mode_reason,
    raw.degradedReason,
    raw.degradedModeReason,
    degradedMode.reason,
    degradedMode.message,
    metadata.degraded_reason,
    metadata.degraded_mode_reason,
    metadata.degradedReason,
    metadata.degradedModeReason,
    metadata.degraded_mode?.reason,
    metadata.degradedMode?.reason,
    context.errors[0],
    context.notices[0],
    firstProblemMessage(context.components),
    firstProblemMessage(context.daemons),
    context.mcpMesh?.reason
  );
  return { active, reason };
}

function rollupHealth(rows) {
  const states = rows.map((row) => normalizeHealthState(row.state || row.health || row.status));
  if (!states.length) {
    return 'unknown';
  }
  if (states.includes('unhealthy')) {
    return 'unhealthy';
  }
  if (states.includes('degraded') || states.includes('starting') || states.includes('unknown')) {
    return 'degraded';
  }
  if (states.every((state) => state === 'stopped')) {
    return 'stopped';
  }
  if (states.includes('stopped')) {
    return 'degraded';
  }
  return 'healthy';
}

function firstProblemMessage(rows) {
  const row = rows.find((candidate) => ['degraded', 'starting', 'unhealthy', 'unknown', 'stopped'].includes(candidate.state));
  if (!row) {
    return '';
  }
  return firstString(row.message, row.last_error, degradedMessageFromMetadata(row.metadata));
}

function degradedMessageFromMetadata(metadata) {
  const value = normalizeObject(metadata);
  return firstString(
    value.message,
    value.reason,
    value.error,
    value.last_error,
    value.lastError,
    value.baseline?.message,
    value.details?.message,
    value.details?.error
  );
}

function normalizeHealthState(value) {
  if (value && typeof value === 'object') {
    return normalizeHealthState(value.state || value.status || value.ok);
  }
  if (value === true) {
    return 'healthy';
  }
  if (value === false) {
    return 'unhealthy';
  }
  const normalized = String(value || 'unknown').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  const aliases = {
    ok: 'healthy',
    pass: 'healthy',
    passed: 'healthy',
    up: 'healthy',
    ready: 'healthy',
    running: 'healthy',
    online: 'healthy',
    warn: 'degraded',
    warning: 'degraded',
    partial: 'degraded',
    pending: 'starting',
    booting: 'starting',
    failed: 'unhealthy',
    failure: 'unhealthy',
    error: 'unhealthy',
    crashed: 'unhealthy',
    down: 'unhealthy',
    offline: 'stopped'
  };
  const state = aliases[normalized] || normalized;
  return HEALTH_STATES.has(state) ? state : 'unknown';
}

function normalizeEntries(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value);
  }
  return [];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => item != null && item !== '').map((item) => String(item));
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function looksLikeDaemonStatusMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (
    value.components ||
    value.daemons ||
    value.heartbeats ||
    value.health ||
    value.mcp_dag ||
    value.mcpDag ||
    value.generated_at ||
    value.generatedAt
  ) {
    return false;
  }
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, item]) => (
    item &&
    typeof item === 'object' &&
    ('status' in item || 'health' in item || 'pid' in item || 'componentId' in item || 'component_id' in item)
  ));
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function numberOr(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.length;
    }
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return 0;
}

function msToSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 1000 : null;
}

function formatEndpoint(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (value.url) {
    return String(value.url);
  }
  if (value.host && value.port) {
    const protocol = value.protocol || 'http';
    const path = value.path || '';
    return `${protocol}://${value.host}:${value.port}${path}`;
  }
  return '';
}

function displayComponentName(component) {
  const key = String(component || '').trim();
  if (COMPONENT_TITLES[key]) {
    return COMPONENT_TITLES[key];
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isMcpPlusPlus(id, title = '') {
  const value = `${id || ''} ${title || ''}`.toLowerCase();
  return value.includes('mcp_plus_plus') || value.includes('mcp++') || value.includes('mcp plus plus');
}

function stateClass(prefix, state) {
  return `${prefix} ${prefix}--${normalizeHealthState(state)}`;
}

function formatState(state) {
  return normalizeHealthState(state).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value) {
  if (!value) {
    return 'not reported';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString();
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

function createNoopEventBus() {
  return {
    on() {},
    emit() {}
  };
}

function registerEvent(eventBus, eventName, handler) {
  if (typeof eventBus?.on === 'function') {
    eventBus.on(eventName, handler);
    return;
  }
  if (typeof eventBus?.addEventListener === 'function') {
    eventBus.addEventListener(eventName, handler);
  }
}

function emitEvent(eventBus, eventName, payload) {
  if (typeof eventBus?.emit === 'function') {
    eventBus.emit(eventName, payload);
    return;
  }
  if (typeof eventBus?.dispatchEvent === 'function' && typeof Event === 'function') {
    const event = new Event(eventName);
    event.detail = payload;
    eventBus.dispatchEvent(event);
  }
}

export default VirtualOSHealthDashboard;
