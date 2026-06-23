/**
 * Menu Generator
 * 
 * Programmatically generates the Electron application menu from configuration.
 * This enables easier testing and maintenance of menu items.
 */

import { Menu, shell, dialog, app } from 'electron';
import {
  mcpServers,
  dashboards,
  toolsMenu,
  fileMenu,
  viewMenu,
  helpMenu,
  configMenu,
  resolveViewPath
} from './menu_config.js';

const RELEASES_URL = 'https://github.com/endomorphosis/hallucinate_app/releases';
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/endomorphosis/hallucinate_app/releases/latest';

function parseVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isNaN(part) ? 0 : part));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

/**
 * Menu Generator Class
 * Builds Electron menu from configuration
 */
export class MenuGenerator {
  constructor(options = {}) {
    this.daemonManager = options.daemonManager;
    this.navigateToView = options.navigateToView;
    this.createSwissKnifeWindow = options.createSwissKnifeWindow;
    this.createMCPDashboardWindow = options.createMCPDashboardWindow;
    this.mainWindow = options.mainWindow;
    
    // Track menu generation for testing
    this.generatedMenu = null;
    this.menuItems = new Map();
  }

  /**
   * Generate the complete application menu
   */
  generate() {
    const template = [
      this.generateFileMenu(),
      this.generateDashboardsMenu(),
      this.generateMCPServersMenu(),
      this.generateToolsMenu(),
      this.generateConfigMenu(),
      this.generateViewMenu(),
      this.generateHelpMenu()
    ];

    this.generatedMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(this.generatedMenu);
    
    return this.generatedMenu;
  }

  /**
   * Generate File Menu
   */
  generateFileMenu() {
    return {
      label: 'File',
      submenu: fileMenu.items.map(item => this.buildMenuItem(item, 'File'))
    };
  }

  /**
   * Generate Dashboards Menu
   */
  generateDashboardsMenu() {
    const submenu = [];

    // Main Dashboard
    submenu.push({
      label: dashboards.main.label,
      accelerator: dashboards.main.accelerator,
      click: () => this.navigateToView(resolveViewPath(dashboards.main.path))
    });

    submenu.push({ type: 'separator' });

    // Dashboard sections
    const sections = ['mcpServers', 'testing', 'security', 'database', 'system'];
    sections.forEach((sectionKey, index) => {
      const section = dashboards[sectionKey];
      if (section && section.items) {
        submenu.push({
          label: section.label,
          submenu: section.items.map(item => ({
            label: item.label,
            click: () => this.navigateToView(resolveViewPath(item.path))
          }))
        });

        // Add separator between sections (except after last)
        if (index < sections.length - 1) {
          submenu.push({ type: 'separator' });
        }
      }
    });

    return {
      label: 'Dashboards',
      submenu
    };
  }

  /**
   * Generate MCP Servers Menu
   */
  generateMCPServersMenu() {
    const submenu = [];

    // Daemon Manager control
    submenu.push({
      label: '🎛️ MCP Control Panel',
      accelerator: 'CmdOrCtrl+M',
      click: () => this.navigateToView(resolveViewPath('views/daemon_manager.html'))
    });

    submenu.push({ type: 'separator' });

    // Global controls
    submenu.push({
      label: '🚀 Start All MCP Servers',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: async () => {
        if (this.daemonManager) {
          await this.daemonManager.startAll();
        }
      }
    });

    submenu.push({
      label: '🛑 Stop All MCP Servers',
      accelerator: 'CmdOrCtrl+Shift+X',
      click: async () => {
        if (this.daemonManager) {
          await this.daemonManager.stopAll();
        }
      }
    });

    submenu.push({
      label: '🔄 Restart All MCP Servers',
      accelerator: 'CmdOrCtrl+Shift+R',
      click: async () => {
        if (this.daemonManager) {
          await this.daemonManager.stopAll();
          setTimeout(async () => await this.daemonManager.startAll(), 2000);
        }
      }
    });

    submenu.push({ type: 'separator' });

    // Individual MCP server controls
    mcpServers.forEach(server => {
      submenu.push(this.generateServerSubmenu(server));
    });

    return {
      label: 'MCP Servers',
      submenu
    };
  }

  /**
   * Generate submenu for individual MCP server
   */
  generateServerSubmenu(server) {
    const submenu = [];

    // Start/Stop/Restart controls
    submenu.push({
      label: '▶️ Start Server',
      click: async () => {
        if (this.daemonManager) {
          await this.daemonManager.startDaemon(server.id);
        }
      }
    });

    submenu.push({
      label: '⏹️ Stop Server',
      click: async () => {
        if (this.daemonManager) {
          await this.daemonManager.stopDaemon(server.id);
        }
      }
    });

    submenu.push({
      label: '🔄 Restart Server',
      click: async () => {
        if (this.daemonManager) {
          await this.daemonManager.restartDaemon(server.id);
        }
      }
    });

    submenu.push({ type: 'separator' });

    // Dashboard access
    if (server.dashboardPath) {
      submenu.push({
        label: '📊 Open Web Dashboard',
        accelerator: server.accelerator,
        click: () => {
          if (this.createMCPDashboardWindow) {
            this.createMCPDashboardWindow(`${server.displayName} MCP Dashboard`, server.webDashboardUrl);
          }
        }
      });
    }

    submenu.push({
      label: '🌐 Open in Browser',
      click: () => {
        shell.openExternal(server.webDashboardUrl);
      }
    });

    // Server-specific tools
    if (server.tools && server.tools.length > 0) {
      submenu.push({ type: 'separator' });
      
      const toolsSubmenu = server.tools.map(tool => {
        if (tool.type === 'separator') {
          return { type: 'separator' };
        }
        
        return {
          label: tool.label,
          click: () => {
            if (tool.url) {
              shell.openExternal(tool.url);
            } else if (tool.action) {
              this.handleAction(tool.action, tool);
            }
          }
        };
      });

      submenu.push({
        label: `🔧 ${server.displayName} Tools`,
        submenu: toolsSubmenu
      });
    }

    submenu.push({ type: 'separator' });

    // View logs
    submenu.push({
      label: '📋 View Logs',
      click: async () => {
        if (this.daemonManager) {
          const logs = await this.daemonManager.getLogs(server.id, 100);
          console.log(`${server.name} Logs:`, logs);
        }
      }
    });

    return {
      label: `${server.icon} ${server.displayName} MCP (Port ${server.port})`,
      submenu
    };
  }

  /**
   * Generate Tools Menu
   */
  generateToolsMenu() {
    const submenu = [];

    // MCP Server tools organized by server
    mcpServers.forEach(server => {
      if (server.tools && server.tools.length > 0) {
        const toolItems = server.tools.map(tool => {
          if (tool.type === 'separator') {
            return { type: 'separator' };
          }

          return {
            label: tool.label,
            click: () => {
              if (tool.url) {
                shell.openExternal(tool.url);
              } else if (tool.action) {
                this.handleAction(tool.action, tool);
              }
            }
          };
        });

        // Add dashboard access at end
        toolItems.push({ type: 'separator' });
        toolItems.push({
          label: '📊 Open Dashboard',
          click: () => {
            if (this.createMCPDashboardWindow) {
              this.createMCPDashboardWindow(`${server.displayName} MCP Dashboard`, server.webDashboardUrl);
            }
          }
        });

        submenu.push({
          label: `${server.icon} ${server.displayName} Tools`,
          submenu: toolItems
        });
      }
    });

    return {
      label: 'Tools',
      submenu
    };
  }

  /**
   * Generate Configuration Menu
   */
  generateConfigMenu() {
    return {
      label: configMenu.label,
      submenu: configMenu.items.map(item => this.buildMenuItem(item, 'Configuration'))
    };
  }

  /**
   * Generate View Menu
   */
  generateViewMenu() {
    return {
      label: 'View',
      submenu: viewMenu.items.map(item => this.buildMenuItem(item, 'View'))
    };
  }

  /**
   * Generate Help Menu
   */
  generateHelpMenu() {
    return {
      label: 'Help',
      submenu: helpMenu.items.map(item => this.buildMenuItem(item, 'Help'))
    };
  }

  /**
   * Build a menu item from configuration
   */
  buildMenuItem(item, menuName) {
    if (item.type === 'separator') {
      return { type: 'separator' };
    }

    if (item.role) {
      const menuItem = { role: item.role };
      if (item.accelerator) menuItem.accelerator = item.accelerator;
      return menuItem;
    }

    const menuItem = {
      label: item.label
    };

    if (item.accelerator) {
      menuItem.accelerator = item.accelerator;
    }

    if (item.enabled !== undefined) {
      menuItem.enabled = item.enabled;
    }

    if (item.submenu) {
      menuItem.submenu = item.submenu.map(subItem => this.buildMenuItem(subItem, menuName));
    } else if (item.action) {
      menuItem.click = () => this.handleAction(item.action, item);
    } else if (item.url) {
      menuItem.click = () => shell.openExternal(item.url);
    } else if (item.path) {
      menuItem.click = () => this.navigateToView(resolveViewPath(item.path));
    }

    // Store for testing
    if (item.testable) {
      this.menuItems.set(`${menuName}:${item.label}`, {
        ...item,
        menuName,
        menuItem
      });
    }

    return menuItem;
  }

  /**
   * Open the settings view for a specific MCP server.
   */
  openServerConfig(item = {}) {
    const settingsPath = resolveViewPath('views/settings.html');
    const serverId = item?.serverId;

    if (!serverId) {
      this.navigateToView(settingsPath);
      return;
    }

    const hasServerConfig = mcpServers.some(server => server.id === serverId);
    if (!hasServerConfig) {
      console.warn(`Unknown MCP server config requested: ${serverId}`);
      this.navigateToView(settingsPath);
      return;
    }

    const win = this.mainWindow;
    if (win && !win.isDestroyed()) {
      win.loadFile(settingsPath, { query: { server: serverId } });
      return;
    }

    this.navigateToView(settingsPath);
  }

  /**
   * Handle custom actions
   */
  handleAction(action, item) {
    switch (action) {
      case 'navigateHome':
        this.navigateToView(resolveViewPath('views/dashboard.html'));
        break;

      case 'navigateBack':
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.goBack();
        }
        break;

      case 'navigateForward':
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.goForward();
        }
        break;

      case 'openSettings':
        if (this.navigateToView) {
          this.navigateToView(resolveViewPath('views/settings.html'));
        }
        break;

      case 'openSwissKnifeWindow':
        if (this.createSwissKnifeWindow) {
          this.createSwissKnifeWindow();
        }
        break;

      case 'openSwissKnifeApp': {
        const appName = typeof item?.app === 'string' ? item.app.trim() : '';
        if (appName.length === 0) {
          console.warn('SwissKnife app menu item is missing an app id.');
          break;
        }

        if (this.createSwissKnifeWindow) {
          this.openSwissKnifeApp(item);
        }
        break;
      }

      case 'openServerConfig': {
        const serverId = typeof item?.serverId === 'string' ? item.serverId.trim() : '';
        if (serverId) {
          this.navigateToView(resolveViewPath(`views/settings.html?server=${encodeURIComponent(serverId)}`));
        } else {
          if (serverId) {
            console.warn(`Unknown MCP server configuration requested: ${serverId}`);
          }
          this.navigateToView(resolveViewPath('views/settings.html'));
        }
        break;
      }

      case 'resetConfig':
        dialog.showMessageBox({
          type: 'warning',
          buttons: ['Reset', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Reset Configuration',
          message: 'Reset all settings to defaults?',
          detail: 'This will clear all stored configuration and reload the application. This action cannot be undone.'
        }).then(({ response }) => {
          if (response === 0) {
            const win = this.mainWindow;
            if (win && !win.isDestroyed()) {
              win.webContents.session.clearStorageData({ storages: ['localstorage', 'cookies', 'indexdb'] })
                .then(() => {
                  console.log('Configuration reset to defaults.');
                  win.webContents.reload();
                })
                .catch(err => console.error('Failed to clear storage during config reset:', err));
            }
          }
        });
        break;

      case 'checkUpdates': {
        this.checkForUpdates().catch(err => {
          console.error('Failed to check for updates:', err);
        });
        break;
      }

      case 'showAbout': {
        const currentVersion = app.getVersion();
        dialog.showMessageBox({
          type: 'info',
          title: 'About Hallucinate App',
          message: `Hallucinate App v${currentVersion}`,
          detail: `A comprehensive platform for IPFS-powered AI development.

Includes:
• IPFS Kit MCP Server
• IPFS Datasets MCP Server
• IPFS Accelerate MCP Server
• SwissKnife Virtual Desktop

© 2025 Endomorphosis`
        });
        break;
      }

      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  /**
   * Check GitHub releases for a newer application version.
   */
  async checkForUpdates() {
    const currentVersion = app.getVersion();

    try {
      const response = await fetch(LATEST_RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `hallucinate_app/${currentVersion}`
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub releases request failed with HTTP ${response.status}`);
      }

      const latestRelease = await response.json();
      const latestVersion = latestRelease?.tag_name;

      if (typeof latestVersion !== 'string' || latestVersion.length === 0) {
        throw new Error('GitHub latest release response did not include a tag name');
      }

      const releaseUrl = latestRelease.html_url || RELEASES_URL;
      const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      const { response: selectedButton } = await dialog.showMessageBox(this.mainWindow, {
        type: updateAvailable ? 'info' : 'none',
        title: 'Check for Updates',
        message: updateAvailable
          ? `Update available: ${latestVersion}`
          : `Hallucinate App is up to date (${currentVersion})`,
        detail: updateAvailable
          ? `Current version: ${currentVersion}\nLatest version: ${latestVersion}`
          : `Latest release: ${latestVersion}`,
        buttons: updateAvailable ? ['Open Release Page', 'Close'] : ['Open Releases Page', 'Close'],
        defaultId: 0,
        cancelId: 1
      });

      if (selectedButton === 0) {
        await shell.openExternal(updateAvailable ? releaseUrl : RELEASES_URL);
      }
    } catch (err) {
      console.error('Unable to check GitHub releases:', err);

      const { response: selectedButton } = await dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        title: 'Check for Updates',
        message: `Current version: ${currentVersion}`,
        detail: 'Unable to reach GitHub releases. You can open the releases page to check manually.',
        buttons: ['Open Releases Page', 'Close'],
        defaultId: 0,
        cancelId: 1
      });

      if (selectedButton === 0) {
        await shell.openExternal(RELEASES_URL);
      }
    }
  }

  /**
   * Get all testable menu items (for testing framework)
   */
  getTestableItems() {
    return Array.from(this.menuItems.values());
  }

  /**
   * Test if a menu item exists and is accessible
   */
  testMenuItem(menuName, itemLabel) {
    const key = `${menuName}:${itemLabel}`;
    return this.menuItems.has(key);
  }
}

export default MenuGenerator;
