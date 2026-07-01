/**
 * Menu Configuration
 * 
 * Centralized configuration for the Electron application menu.
 * This allows for programmatic menu generation and easier maintenance.
 */

import path from 'path';
import url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * Daemon ports are environment-configurable so the app keeps working when a
 * default port is already taken (e.g. a dev machine where 8014 is in use).
 * These mirror the defaults/overrides used by mcp_daemon_manager.js so the menu
 * URLs always point at the port the daemon actually binds.
 */
const KIT_PORT = Number(process.env.MCP_KIT_PORT) || 8014;
const DATASETS_PORT = Number(process.env.MCP_DATASETS_PORT) || 3002;
const ACCELERATE_PORT = Number(process.env.MCP_ACCELERATE_PORT) || 3003;
const SWISSKNIFE_PORT = Number(process.env.MCP_SWISSKNIFE_PORT) || 3004;
const DATASETS_DASHBOARD_PORT = Number(process.env.MCP_DATASETS_DASHBOARD_PORT) || 8899;
const KIT_BASE = `http://127.0.0.1:${KIT_PORT}`;
const DATASETS_BASE = `http://127.0.0.1:${DATASETS_PORT}`;
const ACCELERATE_BASE = `http://127.0.0.1:${ACCELERATE_PORT}`;
const SWISSKNIFE_BASE = `http://127.0.0.1:${SWISSKNIFE_PORT}`;

/**
 * MCP Server Configuration
 * Each MCP server includes metadata for menu generation and testing
 */
export const mcpServers = [
  {
    id: 'ipfs-kit',
    name: 'IPFS Kit MCP',
    displayName: 'IPFS Kit',
    icon: '📦',
    port: KIT_PORT,
    dashboardPath: 'views/ipfs_kit_dashboard.html',
    webDashboardUrl: `${KIT_BASE}/dashboard`,
    accelerator: 'CmdOrCtrl+Alt+1',
    tools: [
      { label: 'Add to IPFS', url: `${KIT_BASE}/tools/add` },
      { label: 'Get from IPFS', url: `${KIT_BASE}/tools/get` },
      { label: 'Pin Content', url: `${KIT_BASE}/tools/pin` },
      { label: 'IPFS Status', url: `${KIT_BASE}/status` },
      { type: 'separator' },
      { label: 'Configure IPFS Node', url: `${KIT_BASE}/config` }
    ]
  },
  {
    id: 'ipfs-datasets',
    name: 'IPFS Datasets MCP',
    displayName: 'IPFS Datasets',
    icon: '📚',
    port: DATASETS_PORT,
    dashboardPath: 'views/ipfs_datasets_dashboard.html',
    webDashboardUrl: `http://127.0.0.1:${DATASETS_DASHBOARD_PORT}/mcp`,
    accelerator: 'CmdOrCtrl+Alt+2',
    tools: [
      { label: 'Load HuggingFace Dataset', url: `${DATASETS_BASE}/tools/load` },
      { label: 'Create Custom Dataset', url: `${DATASETS_BASE}/tools/create` },
      { label: 'Transform Dataset', url: `${DATASETS_BASE}/tools/transform` },
      { label: 'Export Dataset', url: `${DATASETS_BASE}/tools/export` },
      { type: 'separator' },
      { label: 'GraphRAG PDF Processing', url: `${DATASETS_BASE}/tools/graphrag` },
      { label: 'Legal Dataset Scraper', url: `${DATASETS_BASE}/tools/scraper` }
    ]
  },
  {
    id: 'ipfs-accelerate',
    name: 'IPFS Accelerate MCP',
    displayName: 'IPFS Accelerate',
    icon: '⚡',
    port: ACCELERATE_PORT,
    dashboardPath: 'views/ipfs_accelerate_dashboard.html',
    webDashboardUrl: `${ACCELERATE_BASE}/dashboard`,
    accelerator: 'CmdOrCtrl+Alt+3',
    tools: [
      { label: 'Model Inference', url: `${ACCELERATE_BASE}/tools/inference` },
      { label: 'Batch Processing', url: `${ACCELERATE_BASE}/tools/batch` },
      { label: 'Distributed Training', url: `${ACCELERATE_BASE}/tools/training` },
      { type: 'separator' },
      { label: 'GPU Monitor', url: `${ACCELERATE_BASE}/tools/gpu` },
      { label: 'Performance Metrics', url: `${ACCELERATE_BASE}/metrics` }
    ]
  },
  {
    id: 'swissknife',
    name: 'SwissKnife MCP',
    displayName: 'SwissKnife',
    icon: '🔪',
    port: SWISSKNIFE_PORT,
    dashboardPath: null, // Uses special window
    webDashboardUrl: `${SWISSKNIFE_BASE}/dashboard`,
    accelerator: 'CmdOrCtrl+Alt+4',
    tools: [
      { label: 'Terminal', action: 'openSwissKnifeApp', app: 'terminal' },
      { label: 'Code Editor', action: 'openSwissKnifeApp', app: 'editor' },
      { label: 'File Manager', action: 'openSwissKnifeApp', app: 'files' },
      { label: 'AI Chat', action: 'openSwissKnifeApp', app: 'chat' },
      { type: 'separator' },
      { label: 'Music Studio', action: 'openSwissKnifeApp', app: 'music' },
      { label: 'Video Player', action: 'openSwissKnifeApp', app: 'video' }
    ]
  }
];

export const dashboardMcpServers = mcpServers.filter(server => server.dashboardPath);

/**
 * Dashboard Configuration
 * Organized by category for logical menu structure
 */
export const dashboards = {
  main: {
    label: 'Main Dashboard',
    accelerator: 'CmdOrCtrl+D',
    path: 'views/dashboard.html',
    testable: true
  },
  
  mcpServers: {
    label: 'IPFS MCP Servers',
    items: dashboardMcpServers.map(server => ({
      label: `${server.displayName} Dashboard`,
      path: server.dashboardPath,
      serverId: server.id,
      testable: true
    }))
  },
  
  testing: {
    label: 'Testing & Benchmarks',
    items: [
      {
        label: 'Test Interface',
        path: 'views/test_interface.html',
        testable: true
      },
      {
        label: 'Benchmark Dashboard',
        path: 'views/benchmark_dashboard.html',
        testable: true
      },
      {
        label: 'Model Tester',
        path: 'views/model_tester.html',
        testable: true
      }
    ]
  },
  
  security: {
    label: 'Security & Authentication',
    items: [
      {
        label: 'Auth Dashboard',
        path: 'views/auth_dashboard.html',
        testable: true
      },
      {
        label: 'Security Test Dashboard',
        path: 'views/security_test_dashboard.html',
        testable: true
      }
    ]
  },
  
  database: {
    label: 'Database & Storage',
    items: [
      {
        label: 'Database Backup Dashboard',
        path: 'views/database_backup_dashboard.html',
        testable: true
      },
      {
        label: 'PyArrow Content Index',
        path: 'views/pyarrow_content_index_dashboard.html',
        testable: true
      }
    ]
  },
  
  system: {
    label: 'System Management',
    items: [
      {
        label: 'Daemon Manager',
        path: 'views/daemon_manager.html',
        testable: true
      },
      {
        label: 'Usage Dashboard',
        path: 'views/usage_dashboard.html',
        testable: true
      }
    ]
  }
};

/**
 * Tools Configuration
 * Quick access tools grouped by MCP server
 */
export const toolsMenu = {
  swissknife: {
    label: '🖥️ SwissKnife Virtual Desktop',
    accelerator: 'CmdOrCtrl+D',
    action: 'openSwissKnifeWindow',
    testable: true
  },
  quickTools: [
    {
      label: 'Model Tester',
      path: 'views/model_tester.html',
      testable: true
    },
    {
      label: 'Test Interface',
      path: 'views/test_interface.html',
      testable: true
    },
    {
      label: 'Benchmark Dashboard',
      path: 'views/benchmark_dashboard.html',
      testable: true
    }
  ]
};

/**
 * File Menu Configuration
 */
export const fileMenu = {
  items: [
    {
      label: 'Home',
      accelerator: 'CommandOrControl+H',
      action: 'navigateHome',
      testable: true
    },
    { type: 'separator' },
    {
      label: 'Settings',
      accelerator: 'CommandOrControl+,',
      action: 'openSettings',
      testable: true
    },
    { type: 'separator' },
    {
      role: 'quit',
      accelerator: 'CommandOrControl+Q'
    }
  ]
};

/**
 * View Menu Configuration
 */
export const viewMenu = {
  items: [
    {
      label: 'Back',
      accelerator: 'Alt+Left',
      action: 'navigateBack',
      testable: true
    },
    {
      label: 'Forward',
      accelerator: 'Alt+Right',
      action: 'navigateForward',
      testable: true
    },
    { type: 'separator' },
    { role: 'reload', accelerator: 'CmdOrCtrl+R' },
    { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
    { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
    { type: 'separator' },
    { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
    { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
    { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
    { type: 'separator' },
    { role: 'togglefullscreen', accelerator: 'F11' }
  ]
};

/**
 * Help Menu Configuration
 */
export const helpMenu = {
  items: [
    {
      label: 'Documentation',
      submenu: mcpServers.map(server => ({
        label: `${server.displayName} Documentation`,
        url: `https://github.com/endomorphosis/${server.id.replace('-', '_')}_py`
      }))
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      action: 'checkUpdates'
    },
    {
      label: 'Report Issue',
      url: 'https://github.com/endomorphosis/hallucinate_app/issues/new'
    },
    { type: 'separator' },
    {
      label: 'About',
      action: 'showAbout'
    }
  ]
};

/**
 * Configuration Menu (Settings submenu)
 */
export const configMenu = {
  label: 'Configuration',
  items: [
    {
      label: '⚙️ MCP Server Settings',
      submenu: mcpServers.map(server => ({
        label: `${server.displayName} Configuration`,
        action: 'openServerConfig',
        serverId: server.id
      }))
    },
    { type: 'separator' },
    {
      label: '🌐 Network Settings',
      submenu: [
        { label: 'Port Configuration', enabled: false },
        { label: 'Proxy Settings', enabled: false },
        { label: 'IPFS Gateway', enabled: false }
      ]
    },
    {
      label: '🔐 Security Settings',
      submenu: [
        { label: 'API Keys', enabled: false },
        { label: 'Authentication', enabled: false },
        { label: 'Permissions', enabled: false }
      ]
    },
    { type: 'separator' },
    {
      label: 'Reset to Defaults',
      action: 'resetConfig'
    }
  ]
};

/**
 * Get the base directory for resolving paths
 */
export function getBasePath() {
  return path.join(__dirname, '..');
}

/**
 * Resolve a view path to absolute path
 */
export function resolveViewPath(viewPath) {
  return path.join(getBasePath(), 'node', viewPath);
}

/**
 * Get all testable menu items
 * Used by the testing framework
 */
export function getAllTestableItems() {
  const items = [];
  
  // File menu items
  fileMenu.items.forEach(item => {
    if (item.testable) items.push({ ...item, menu: 'File' });
  });
  
  // Dashboard items
  if (dashboards.main.testable) {
    items.push({ ...dashboards.main, menu: 'Dashboards' });
  }
  
  Object.values(dashboards).forEach(section => {
    if (section.items) {
      section.items.forEach(item => {
        if (item.testable) items.push({ ...item, menu: 'Dashboards', section: section.label });
      });
    }
  });
  
  // MCP Server global controls
  items.push(
    { label: 'MCP Control Panel', accelerator: 'CmdOrCtrl+M', path: 'views/daemon_manager.html', menu: 'MCP Servers', testable: true },
    { label: 'Start All MCP Servers', accelerator: 'CmdOrCtrl+Shift+S', action: 'startAll', menu: 'MCP Servers', testable: true },
    { label: 'Stop All MCP Servers', accelerator: 'CmdOrCtrl+Shift+X', action: 'stopAll', menu: 'MCP Servers', testable: true },
    { label: 'Restart All MCP Servers', accelerator: 'CmdOrCtrl+Shift+R', action: 'restartAll', menu: 'MCP Servers', testable: true }
  );
  
  // MCP Server controls for each server
  mcpServers.forEach(server => {
    items.push(
      { label: `Start ${server.displayName}`, serverId: server.id, action: 'start', menu: 'MCP Servers', testable: true },
      { label: `Stop ${server.displayName}`, serverId: server.id, action: 'stop', menu: 'MCP Servers', testable: true },
      { label: `Restart ${server.displayName}`, serverId: server.id, action: 'restart', menu: 'MCP Servers', testable: true },
      { label: `Open ${server.displayName} Dashboard`, serverId: server.id, action: 'openDashboard', menu: 'MCP Servers', testable: true }
    );
  });
  
  // Tools menu items
  if (toolsMenu.swissknife.testable) {
    items.push({ ...toolsMenu.swissknife, menu: 'Tools' });
  }
  toolsMenu.quickTools.forEach(item => {
    if (item.testable) items.push({ ...item, menu: 'Tools' });
  });
  
  // View menu items
  viewMenu.items.forEach(item => {
    if (item.testable) items.push({ ...item, menu: 'View' });
  });
  
  return items;
}

export default {
  mcpServers,
  dashboards,
  toolsMenu,
  fileMenu,
  viewMenu,
  helpMenu,
  configMenu,
  getBasePath,
  resolveViewPath,
  getAllTestableItems
};
