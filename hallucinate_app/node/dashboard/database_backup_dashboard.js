/**
 * Database Backup Dashboard - UI Component for managing database backups
 * 
 * This component provides a comprehensive interface for:
 * - Backing up multiple databases (OrbitDB, FireproofDB, DuckDB)
 * - Restoring backups from IPFS
 * - Scheduling automated backups
 * - Tracking backup history and status
 * - Visualizing backup metrics
 * 
 * Integrates with:
 * - IPFS Kit for storage
 * - PyArrow Content Index for metadata tracking
 * - UCAN authentication for secure operations
 */

// Import dependencies
import { databaseBackupBridge } from '../database_backup_bridge.js';
import { formatDate, formatFileSize } from './utils/formatters.js';
import MetricsCollector from './observability/metrics_collector.js';

/**
 * Database Backup Dashboard Component
 */
export class DatabaseBackupDashboard {
  /**
   * Create a new database backup dashboard
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.element - Container element
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.authManager - Auth manager for capability verification
   * @param {Object} options.resources - Shared resources
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.eventBus = options.eventBus;
    this.authManager = options.authManager;
    this.resources = options.resources || {};
    
    // State
    this.activeTab = 'backup';
    this.backups = {
      orbitdb: [],
      fireproofdb: [],
      duckdb: []
    };
    this.schedules = [];
    this.databaseTypes = [
      { id: 'orbitdb', name: 'OrbitDB', icon: 'database' },
      { id: 'fireproofdb', name: 'FireproofDB', icon: 'shield-alt' },
      { id: 'duckdb', name: 'DuckDB', icon: 'table' }
    ];
    this.selectedType = 'orbitdb';
    this.selectedBackupId = null;
    this.selectedScheduleId = null;
    this.isLoading = false;
    this.inProgressOperations = new Map();
    this.recentActivity = [];
    this.capabilities = {
      backup: {
        orbitdb: 'backup:orbitdb',
        fireproofdb: 'backup:fireproofdb',
        duckdb: 'backup:duckdb'
      },
      restore: {
        orbitdb: 'restore:orbitdb',
        fireproofdb: 'restore:fireproofdb',
        duckdb: 'restore:duckdb' 
      },
      schedule: 'backup:schedule',
      admin: 'backup:admin'
    };
    
    // Set up metrics collector
    this.metricsCollector = new MetricsCollector({
      component: 'database_backup_dashboard',
      logMetrics: true
    });
    
    // Bind methods
    this.render = this.render.bind(this);
    this.renderBackupTab = this.renderBackupTab.bind(this);
    this.renderRestoreTab = this.renderRestoreTab.bind(this);
    this.renderScheduleTab = this.renderScheduleTab.bind(this);
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handleTypeSelect = this.handleTypeSelect.bind(this);
    this.handleBackupClick = this.handleBackupClick.bind(this);
    this.handleRestoreClick = this.handleRestoreClick.bind(this);
    this.handleCreateScheduleClick = this.handleCreateScheduleClick.bind(this);
    this.handleDeleteScheduleClick = this.handleDeleteScheduleClick.bind(this);
    this.handleBackupSelect = this.handleBackupSelect.bind(this);
    this.handleScheduleSelect = this.handleScheduleSelect.bind(this);
    this.handleDeleteBackupClick = this.handleDeleteBackupClick.bind(this);
    this.initEventListeners = this.initEventListeners.bind(this);
    this.loadBackups = this.loadBackups.bind(this);
    this.loadSchedules = this.loadSchedules.bind(this);
    this.checkCapability = this.checkCapability.bind(this);
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the dashboard
   */
  async init() {
    // First render
    this.render();
    
    // Set up event listeners
    this.initEventListeners();
    
    // Initialize database backup bridge
    try {
      await databaseBackupBridge.init();
      console.log('Database backup bridge initialized');
    } catch (err) {
      console.error('Failed to initialize database backup bridge:', err);
      this.showError('Failed to initialize database backup system. Please check the console for details.');
    }
    
    // Load initial data
    await this.loadBackups(this.selectedType);
    await this.loadSchedules();
    
    // Notify that we're ready
    if (this.eventBus) {
      this.eventBus.emit('database-backup-dashboard-ready');
    }
  }
  
  /**
   * Initialize event listeners
   */
  initEventListeners() {
    // Set up tab switching
    const tabs = this.element.querySelectorAll('.nav-link');
    tabs.forEach(tab => {
      tab.addEventListener('click', this.handleTabClick);
    });
    
    // Set up database type selection
    const typeSelect = this.element.querySelector('#database-type-select');
    if (typeSelect) {
      typeSelect.addEventListener('change', this.handleTypeSelect);
    }
    
    // Set up backup button
    const backupBtn = this.element.querySelector('#backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', this.handleBackupClick);
    }
    
    // Set up restore button
    const restoreBtn = this.element.querySelector('#restore-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', this.handleRestoreClick);
    }
    
    // Set up create schedule button
    const createScheduleBtn = this.element.querySelector('#create-schedule-btn');
    if (createScheduleBtn) {
      createScheduleBtn.addEventListener('click', this.handleCreateScheduleClick);
    }

    // Listen for external events
    if (this.eventBus) {
      this.eventBus.on('refresh-backups', () => {
        this.loadBackups(this.selectedType);
      });
      
      this.eventBus.on('refresh-schedules', () => {
        this.loadSchedules();
      });
    }
    
    // Listen for database backup bridge events
    databaseBackupBridge.on('backup-started', this.handleBackupStarted.bind(this));
    databaseBackupBridge.on('backup-progress', this.handleBackupProgress.bind(this));
    databaseBackupBridge.on('backup-completed', this.handleBackupCompleted.bind(this));
    databaseBackupBridge.on('backup-error', this.handleBackupError.bind(this));
    
    databaseBackupBridge.on('restore-started', this.handleRestoreStarted.bind(this));
    databaseBackupBridge.on('restore-progress', this.handleRestoreProgress.bind(this));
    databaseBackupBridge.on('restore-completed', this.handleRestoreCompleted.bind(this));
    databaseBackupBridge.on('restore-error', this.handleRestoreError.bind(this));
    
    databaseBackupBridge.on('backups-listed', this.handleBackupsListed.bind(this));
    databaseBackupBridge.on('schedules-listed', this.handleSchedulesListed.bind(this));
    
    // Set up refresh interval for operation updates
    this.operationRefreshInterval = setInterval(() => {
      this.updateOperationsDisplay();
    }, 1000);
  }
  
  /**
   * Render the dashboard
   */
  render() {
    if (!this.element) return;

    this.element.innerHTML = `
      <div class="container-fluid p-0">
        <div class="row mb-4">
          <div class="col">
            <h2 class="mb-3">Database Backup & Restore</h2>
            <p class="text-muted">
              Manage database backups, restore from previous versions, and schedule automated backups.
              All backups are stored on IPFS for decentralized and secure storage.
            </p>
            
            <!-- Navigation tabs -->
            <ul class="nav nav-tabs" id="backup-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="nav-link ${this.activeTab === 'backup' ? 'active' : ''}" 
                        id="backup-tab" 
                        data-tab="backup" 
                        type="button">
                  <i class="fas fa-cloud-upload-alt"></i> Backup
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link ${this.activeTab === 'restore' ? 'active' : ''}" 
                        id="restore-tab" 
                        data-tab="restore" 
                        type="button">
                  <i class="fas fa-cloud-download-alt"></i> Restore
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link ${this.activeTab === 'schedule' ? 'active' : ''}" 
                        id="schedule-tab" 
                        data-tab="schedule" 
                        type="button">
                  <i class="fas fa-clock"></i> Scheduled Backups
                </button>
              </li>
            </ul>
          </div>
        </div>
        
        <!-- Tab content -->
        <div class="tab-content" id="backup-tab-content">
          ${this.activeTab === 'backup' ? this.renderBackupTab() : ''}
          ${this.activeTab === 'restore' ? this.renderRestoreTab() : ''}
          ${this.activeTab === 'schedule' ? this.renderScheduleTab() : ''}
        </div>
      </div>
      
      <!-- Modal templates -->
      <div class="modal fade" id="backup-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Create Database Backup</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label for="backup-collections" class="form-label">Collections/Tables (optional)</label>
                <input type="text" class="form-control" id="backup-collections" placeholder="Leave empty for all">
                <small class="text-muted">Comma-separated list of collections or tables to backup</small>
              </div>
              <div class="mb-3">
                <label for="backup-metadata" class="form-label">Custom Metadata (optional)</label>
                <textarea class="form-control" id="backup-metadata" rows="3" placeholder='{"description": "Example backup"}'></textarea>
                <small class="text-muted">JSON format metadata to store with the backup</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="confirm-backup-btn">Create Backup</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal fade" id="restore-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Restore Database</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i> Warning: Restoring may overwrite existing data. Consider creating a backup before proceeding.
              </div>
              <div class="mb-3">
                <label for="restore-collections" class="form-label">Collections/Tables (optional)</label>
                <input type="text" class="form-control" id="restore-collections" placeholder="Leave empty for all">
                <small class="text-muted">Comma-separated list of collections or tables to restore</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="confirm-restore-btn">Restore</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal fade" id="schedule-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Create Scheduled Backup</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label for="schedule-db-type" class="form-label">Database Type</label>
                <select class="form-select" id="schedule-db-type">
                  ${this.databaseTypes.map(type => `
                    <option value="${type.id}">${type.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="mb-3">
                <label for="schedule-collections" class="form-label">Collections/Tables (optional)</label>
                <input type="text" class="form-control" id="schedule-collections" placeholder="Leave empty for all">
                <small class="text-muted">Comma-separated list of collections or tables to backup</small>
              </div>
              <div class="mb-3">
                <label for="schedule-interval" class="form-label">Interval (hours)</label>
                <input type="number" class="form-control" id="schedule-interval" min="1" value="24">
                <small class="text-muted">Backup frequency in hours</small>
              </div>
              <div class="mb-3">
                <label for="schedule-description" class="form-label">Description</label>
                <input type="text" class="form-control" id="schedule-description" placeholder="e.g., Daily users backup">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="confirm-schedule-btn">Create Schedule</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Loading indicator -->
      <div id="loading-overlay" class="${this.isLoading ? 'visible' : 'hidden'}">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;

    // Initialize modals (if using Bootstrap)
    if (window.bootstrap) {
      const backupModal = this.element.querySelector('#backup-modal');
      if (backupModal) {
        new bootstrap.Modal(backupModal);
      }
      
      const restoreModal = this.element.querySelector('#restore-modal');
      if (restoreModal) {
        new bootstrap.Modal(restoreModal);
      }
      
      const scheduleModal = this.element.querySelector('#schedule-modal');
      if (scheduleModal) {
        new bootstrap.Modal(scheduleModal);
      }
    }
    
    // Set up modal action buttons
    const confirmBackupBtn = this.element.querySelector('#confirm-backup-btn');
    if (confirmBackupBtn) {
      confirmBackupBtn.addEventListener('click', async () => {
        const collectionsInput = this.element.querySelector('#backup-collections').value;
        const metadataInput = this.element.querySelector('#backup-metadata').value;
        
        let collections = null;
        if (collectionsInput.trim()) {
          collections = collectionsInput.split(',').map(c => c.trim());
        }
        
        let metadata = null;
        if (metadataInput.trim()) {
          try {
            metadata = JSON.parse(metadataInput);
          } catch (err) {
            return this.showError('Invalid JSON in metadata field');
          }
        }
        
        await this.createBackup(this.selectedType, collections, metadata);
        
        // Close modal
        if (window.bootstrap) {
          const modal = bootstrap.Modal.getInstance(this.element.querySelector('#backup-modal'));
          modal.hide();
        }
      });
    }
    
    const confirmRestoreBtn = this.element.querySelector('#confirm-restore-btn');
    if (confirmRestoreBtn) {
      confirmRestoreBtn.addEventListener('click', async () => {
        const collectionsInput = this.element.querySelector('#restore-collections').value;
        
        let collections = null;
        if (collectionsInput.trim()) {
          collections = collectionsInput.split(',').map(c => c.trim());
        }
        
        if (!this.selectedBackupId) {
          return this.showError('No backup selected for restore');
        }
        
        await this.restoreBackup(this.selectedType, this.selectedBackupId, collections);
        
        // Close modal
        if (window.bootstrap) {
          const modal = bootstrap.Modal.getInstance(this.element.querySelector('#restore-modal'));
          modal.hide();
        }
      });
    }
    
    const confirmScheduleBtn = this.element.querySelector('#confirm-schedule-btn');
    if (confirmScheduleBtn) {
      confirmScheduleBtn.addEventListener('click', async () => {
        const dbType = this.element.querySelector('#schedule-db-type').value;
        const collectionsInput = this.element.querySelector('#schedule-collections').value;
        const interval = parseInt(this.element.querySelector('#schedule-interval').value);
        const description = this.element.querySelector('#schedule-description').value;
        
        let collections = null;
        if (collectionsInput.trim()) {
          collections = collectionsInput.split(',').map(c => c.trim());
        }
        
        if (isNaN(interval) || interval < 1) {
          return this.showError('Invalid interval. Please enter a positive number.');
        }
        
        const schedule = {
          db_type: dbType,
          collections,
          interval,
          description,
          active: true
        };
        
        await this.createSchedule(schedule);
        
        // Close modal
        if (window.bootstrap) {
          const modal = bootstrap.Modal.getInstance(this.element.querySelector('#schedule-modal'));
          modal.hide();
        }
      });
    }
    
    // Set up action buttons in tables after render
    const deleteButtons = this.element.querySelectorAll('.delete-backup-btn');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', this.handleDeleteBackupClick);
    });
    
    const deleteScheduleButtons = this.element.querySelectorAll('.delete-schedule-btn');
    deleteScheduleButtons.forEach(btn => {
      btn.addEventListener('click', this.handleDeleteScheduleClick);
    });
    
    // Set up backup selection
    const backupRows = this.element.querySelectorAll('.backup-row');
    backupRows.forEach(row => {
      row.addEventListener('click', this.handleBackupSelect);
    });
    
    // Set up schedule selection
    const scheduleRows = this.element.querySelectorAll('.schedule-row');
    scheduleRows.forEach(row => {
      row.addEventListener('click', this.handleScheduleSelect);
    });
  }
  
  /**
   * Render the backup tab content
   * 
   * @returns {string} HTML content
   */
  renderBackupTab() {
    return `
      <div class="tab-pane fade show active" id="backup-tab-pane">
        <div class="row mt-4">
          <div class="col-md-4">
            <div class="card">
              <div class="card-header">
                <h5 class="card-title mb-0">Create Backup</h5>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label for="database-type-select" class="form-label">Database Type</label>
                  <select class="form-select" id="database-type-select">
                    ${this.databaseTypes.map(type => `
                      <option value="${type.id}" ${this.selectedType === type.id ? 'selected' : ''}>
                        ${type.name}
                      </option>
                    `).join('')}
                  </select>
                </div>
                <button class="btn btn-primary mt-2 w-100" id="backup-btn">
                  <i class="fas fa-cloud-upload-alt me-2"></i> Create Backup
                </button>
              </div>
            </div>
          </div>
          <div class="col-md-8">
            <div class="card">
              <div class="card-header">
                <h5 class="card-title mb-0">Recent Backups (${this.selectedType})</h5>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-striped table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Backup ID</th>
                        <th>Date</th>
                        <th>Collections</th>
                        <th>Documents</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.backups[this.selectedType] && this.backups[this.selectedType].length > 0 ? 
                        this.backups[this.selectedType].map(backup => `
                          <tr class="backup-row" data-backup-id="${backup.backup_id}">
                            <td>${backup.backup_id}</td>
                            <td>${formatDate(backup.timestamp)}</td>
                            <td>${Array.isArray(backup.collections) ? backup.collections.join(', ') : 
                                 (typeof backup.collections === 'object' ? Object.keys(backup.collections).join(', ') : 'All')}</td>
                            <td>${typeof backup.document_count === 'object' ? 
                                 Object.values(backup.document_count).reduce((a, b) => a + b, 0) : 
                                 (backup.document_count || 'N/A')}</td>
                            <td>
                              <button class="btn btn-sm btn-outline-danger delete-backup-btn" 
                                      data-backup-id="${backup.backup_id}">
                                <i class="fas fa-trash"></i>
                              </button>
                            </td>
                          </tr>
                        `).join('') :
                        `<tr><td colspan="5" class="text-center py-3">No backups found</td></tr>`
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Render the restore tab content
   * 
   * @returns {string} HTML content
   */
  renderRestoreTab() {
    return `
      <div class="tab-pane fade show active" id="restore-tab-pane">
        <div class="row mt-4">
          <div class="col-md-4">
            <div class="card">
              <div class="card-header">
                <h5 class="card-title mb-0">Restore Database</h5>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label for="restore-type-select" class="form-label">Database Type</label>
                  <select class="form-select" id="restore-type-select">
                    ${this.databaseTypes.map(type => `
                      <option value="${type.id}" ${this.selectedType === type.id ? 'selected' : ''}>
                        ${type.name}
                      </option>
                    `).join('')}
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Selected Backup</label>
                  <div class="p-2 border rounded bg-light">
                    <div id="selected-backup-info">
                      ${this.selectedBackupId ? 
                        (() => {
                          const backup = this.backups[this.selectedType].find(b => b.backup_id === this.selectedBackupId);
                          return backup ? `
                            <div class="d-flex justify-content-between align-items-center">
                              <div>
                                <strong>${backup.backup_id}</strong><br>
                                <small class="text-muted">${formatDate(backup.timestamp)}</small>
                              </div>
                              <div>
                                <span class="badge bg-primary">${backup.cid}</span>
                              </div>
                            </div>
                          ` : 'No backup selected';
                        })() : 
                        'No backup selected'
                      }
                    </div>
                  </div>
                </div>
                <button class="btn btn-danger mt-2 w-100" id="restore-btn" ${!this.selectedBackupId ? 'disabled' : ''}>
                  <i class="fas fa-cloud-download-alt me-2"></i> Restore
                </button>
              </div>
            </div>
            
            <div class="card mt-4">
              <div class="card-header">
                <h5 class="card-title mb-0">Alternative Restore</h5>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label for="cid-input" class="form-label">Restore from CID</label>
                  <input type="text" class="form-control" id="cid-input" placeholder="Enter IPFS CID...">
                  <small class="text-muted">Restore from a specific IPFS content identifier</small>
                </div>
                <button class="btn btn-outline-secondary w-100" id="restore-cid-btn">
                  <i class="fas fa-link me-2"></i> Restore from CID
                </button>
              </div>
            </div>
          </div>
          <div class="col-md-8">
            <div class="card">
              <div class="card-header">
                <h5 class="card-title mb-0">Available Backups (${this.selectedType})</h5>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Backup ID</th>
                        <th>Date</th>
                        <th>Collections</th>
                        <th>Documents</th>
                        <th>CID</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.backups[this.selectedType] && this.backups[this.selectedType].length > 0 ? 
                        this.backups[this.selectedType].map(backup => `
                          <tr class="backup-row ${this.selectedBackupId === backup.backup_id ? 'table-primary' : ''}" 
                              data-backup-id="${backup.backup_id}">
                            <td>${backup.backup_id}</td>
                            <td>${formatDate(backup.timestamp)}</td>
                            <td>${Array.isArray(backup.collections) ? backup.collections.join(', ') : 
                                 (typeof backup.collections === 'object' ? Object.keys(backup.collections).join(', ') : 'All')}</td>
                            <td>${typeof backup.document_count === 'object' ? 
                                 Object.values(backup.document_count).reduce((a, b) => a + b, 0) : 
                                 (backup.document_count || 'N/A')}</td>
                            <td><span class="badge bg-secondary">${backup.cid.substring(0, 12)}...</span></td>
                          </tr>
                        `).join('') :
                        `<tr><td colspan="5" class="text-center py-3">No backups found</td></tr>`
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Render the schedule tab content
   * 
   * @returns {string} HTML content
   */
  renderScheduleTab() {
    return `
      <div class="tab-pane fade show active" id="schedule-tab-pane">
        <div class="row mt-4">
          <div class="col-md-4">
            <div class="card">
              <div class="card-header">
                <h5 class="card-title mb-0">Scheduled Backups</h5>
              </div>
              <div class="card-body">
                <p>Create automated backup schedules to periodically backup your databases.</p>
                <button class="btn btn-primary mt-2 w-100" id="create-schedule-btn">
                  <i class="fas fa-plus me-2"></i> Create Schedule
                </button>
              </div>
            </div>
            
            <div class="card mt-4">
              <div class="card-header">
                <h5 class="card-title mb-0">Schedule Details</h5>
              </div>
              <div class="card-body">
                <div id="selected-schedule-info">
                  ${this.selectedScheduleId !== null ? 
                    (() => {
                      const schedule = this.schedules.find(s => s.id === this.selectedScheduleId);
                      if (!schedule) return 'No schedule selected';
                      
                      return `
                        <div class="mb-3">
                          <label class="form-label">Database</label>
                          <div class="form-control bg-light">${
                            this.databaseTypes.find(t => t.id === schedule.db_type)?.name || schedule.db_type
                          }</div>
                        </div>
                        <div class="mb-3">
                          <label class="form-label">Collections</label>
                          <div class="form-control bg-light">${
                            schedule.collections && schedule.collections.length > 0 ? 
                            schedule.collections.join(', ') : 'All'
                          }</div>
                        </div>
                        <div class="mb-3">
                          <label class="form-label">Interval</label>
                          <div class="form-control bg-light">${schedule.interval} hours</div>
                        </div>
                        <div class="mb-3">
                          <label class="form-label">Last Run</label>
                          <div class="form-control bg-light">${
                            schedule.last_run ? formatDate(schedule.last_run) : 'Never'
                          }</div>
                        </div>
                        <div class="d-grid gap-2">
                          <button class="btn btn-outline-danger delete-schedule-btn" data-schedule-id="${schedule.id}">
                            <i class="fas fa-trash me-2"></i> Delete Schedule
                          </button>
                        </div>
                      `;
                    })() : 
                    'Select a schedule to view details'
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-8">
            <div class="card">
              <div class="card-header">
                <h5 class="card-title mb-0">Schedule List</h5>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Database</th>
                        <th>Interval</th>
                        <th>Last Run</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.schedules && this.schedules.length > 0 ? 
                        this.schedules.map(schedule => `
                          <tr class="schedule-row ${this.selectedScheduleId === schedule.id ? 'table-primary' : ''}" 
                              data-schedule-id="${schedule.id}">
                            <td>${schedule.description || 'N/A'}</td>
                            <td>${this.databaseTypes.find(t => t.id === schedule.db_type)?.name || schedule.db_type}</td>
                            <td>${schedule.interval} hours</td>
                            <td>${schedule.last_run ? formatDate(schedule.last_run) : 'Never'}</td>
                            <td>
                              <span class="badge ${schedule.active ? 'bg-success' : 'bg-secondary'}">
                                ${schedule.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        `).join('') :
                        `<tr><td colspan="5" class="text-center py-3">No schedules found</td></tr>`
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div class="card mt-4">
              <div class="card-header">
                <h5 class="card-title mb-0">Recent Scheduled Backups</h5>
              </div>
              <div class="card-body p-0">
                <!-- This would show a log of recent scheduled backups that have run -->
                <div class="p-3 text-center text-muted">
                  <i class="fas fa-clock fa-2x mb-3"></i>
                  <p>Logs of scheduled backup runs will appear here</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Handle tab click event
   * 
   * @param {Event} e - Click event
   */
  handleTabClick(e) {
    const tab = e.target.dataset.tab;
    if (tab && tab !== this.activeTab) {
      this.activeTab = tab;
      this.render();
      
      // Reload data if needed
      if (tab === 'restore' || tab === 'backup') {
        this.loadBackups(this.selectedType);
      } else if (tab === 'schedule') {
        this.loadSchedules();
      }
    }
  }
  
  /**
   * Handle database type selection
   * 
   * @param {Event} e - Change event
   */
  handleTypeSelect(e) {
    const type = e.target.value;
    if (type && type !== this.selectedType) {
      this.selectedType = type;
      this.selectedBackupId = null;
      this.loadBackups(type);
      this.render();
    }
  }
  
  /**
   * Handle backup click event
   */
  handleBackupClick() {
    // Check capability
    this.checkCapability(this.capabilities.backup[this.selectedType]).then(hasCapability => {
      if (!hasCapability) {
        return this.showError('You do not have permission to create backups');
      }
      
      // Show backup modal
      if (window.bootstrap) {
        const modal = new bootstrap.Modal(this.element.querySelector('#backup-modal'));
        modal.show();
      }
    });
  }
  
  /**
   * Handle restore click event
   */
  handleRestoreClick() {
    // Check if a backup is selected
    if (!this.selectedBackupId) {
      return this.showError('Please select a backup to restore');
    }
    
    // Check capability
    this.checkCapability(this.capabilities.restore[this.selectedType]).then(hasCapability => {
      if (!hasCapability) {
        return this.showError('You do not have permission to restore backups');
      }
      
      // Show restore modal
      if (window.bootstrap) {
        const modal = new bootstrap.Modal(this.element.querySelector('#restore-modal'));
        modal.show();
      }
    });
  }
  
  /**
   * Handle create schedule click event
   */
  handleCreateScheduleClick() {
    // Check capability
    this.checkCapability(this.capabilities.schedule).then(hasCapability => {
      if (!hasCapability) {
        return this.showError('You do not have permission to create backup schedules');
      }
      
      // Show schedule modal
      if (window.bootstrap) {
        const modal = new bootstrap.Modal(this.element.querySelector('#schedule-modal'));
        modal.show();
      }
    });
  }
  
  /**
   * Handle delete schedule click event
   * 
   * @param {Event} e - Click event
   */
  handleDeleteScheduleClick(e) {
    e.stopPropagation();
    
    const scheduleId = parseInt(e.target.closest('.delete-schedule-btn').dataset.scheduleId);
    if (isNaN(scheduleId)) return;
    
    // Confirm deletion
    if (confirm('Are you sure you want to delete this schedule?')) {
      this.deleteSchedule(scheduleId);
    }
  }
  
  /**
   * Handle backup selection
   * 
   * @param {Event} e - Click event
   */
  handleBackupSelect(e) {
    const backupId = e.currentTarget.dataset.backupId;
    if (backupId) {
      this.selectedBackupId = backupId;
      
      // Update UI
      const rows = this.element.querySelectorAll('.backup-row');
      rows.forEach(row => {
        if (row.dataset.backupId === backupId) {
          row.classList.add('table-primary');
        } else {
          row.classList.remove('table-primary');
        }
      });
      
      // Update selected backup info
      const infoElement = this.element.querySelector('#selected-backup-info');
      if (infoElement) {
        const backup = this.backups[this.selectedType].find(b => b.backup_id === backupId);
        if (backup) {
          infoElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${backup.backup_id}</strong><br>
                <small class="text-muted">${formatDate(backup.timestamp)}</small>
              </div>
              <div>
                <span class="badge bg-primary">${backup.cid.substring(0, 12)}...</span>
              </div>
            </div>
          `;
          
          // Enable restore button
          const restoreBtn = this.element.querySelector('#restore-btn');
          if (restoreBtn) {
            restoreBtn.removeAttribute('disabled');
          }
        }
      }
    }
  }
  
  /**
   * Handle schedule selection
   * 
   * @param {Event} e - Click event
   */
  handleScheduleSelect(e) {
    const scheduleId = parseInt(e.currentTarget.dataset.scheduleId);
    if (!isNaN(scheduleId)) {
      this.selectedScheduleId = scheduleId;
      
      // Update UI
      const rows = this.element.querySelectorAll('.schedule-row');
      rows.forEach(row => {
        if (parseInt(row.dataset.scheduleId) === scheduleId) {
          row.classList.add('table-primary');
        } else {
          row.classList.remove('table-primary');
        }
      });
      
      // Update selected schedule info
      this.render();
    }
  }
  
  /**
   * Handle delete backup click event
   * 
   * @param {Event} e - Click event
   */
  handleDeleteBackupClick(e) {
    e.stopPropagation();
    
    const backupId = e.target.closest('.delete-backup-btn').dataset.backupId;
    if (backupId) {
      // Confirm deletion
      if (confirm('Are you sure you want to delete this backup?')) {
        this.deleteBackup(this.selectedType, backupId);
      }
    }
  }
  
  /**
   * Load backups for a database type
   * 
   * @param {string} dbType - Database type
   */
  async loadBackups(dbType) {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Load backups
      const result = await databaseBackupBridge.listBackups(dbType, authToken);
      
      if (result && result.success && result.backups) {
        this.backups[dbType] = result.backups;
        
        // If selected backup no longer exists, clear selection
        if (this.selectedBackupId) {
          const exists = this.backups[dbType].some(b => b.backup_id === this.selectedBackupId);
          if (!exists) {
            this.selectedBackupId = null;
          }
        }
      } else {
        console.error('Failed to load backups:', result);
      }
    } catch (err) {
      console.error('Error loading backups:', err);
      this.showError('Failed to load backups: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Load scheduled backups
   */
  async loadSchedules() {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Load schedules
      const result = await databaseBackupBridge.listSchedules(authToken);
      
      if (result && result.success && result.schedules) {
        this.schedules = result.schedules;
        
        // If selected schedule no longer exists, clear selection
        if (this.selectedScheduleId !== null) {
          const exists = this.schedules.some(s => s.id === this.selectedScheduleId);
          if (!exists) {
            this.selectedScheduleId = null;
          }
        }
      } else {
        console.error('Failed to load schedules:', result);
      }
    } catch (err) {
      console.error('Error loading schedules:', err);
      this.showError('Failed to load schedules: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Create a new backup
   * 
   * @param {string} dbType - Database type
   * @param {string[]} collections - Collections to backup
   * @param {Object} metadata - Custom metadata
   */
  async createBackup(dbType, collections, metadata) {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Determine which backup method to call
      let result;
      
      if (dbType === 'orbitdb') {
        result = await databaseBackupBridge.backupOrbitDB({
          collections,
          auth_token: authToken,
          metadata
        });
      } else if (dbType === 'fireproofdb') {
        result = await databaseBackupBridge.backupFireproofDB({
          collections,
          auth_token: authToken,
          metadata
        });
      } else if (dbType === 'duckdb') {
        result = await databaseBackupBridge.backupDuckDB({
          tables: collections,
          auth_token: authToken,
          metadata
        });
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      if (result && result.success) {
        this.showSuccess(`Backup created successfully. Backup ID: ${result.backup_id}`);
        
        // Reload backups
        await this.loadBackups(dbType);
      } else {
        this.showError('Failed to create backup: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error creating backup:', err);
      this.showError('Failed to create backup: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Restore from a backup
   * 
   * @param {string} dbType - Database type
   * @param {string} backupId - Backup ID
   * @param {string[]} collections - Collections to restore
   */
  async restoreBackup(dbType, backupId, collections) {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Determine which restore method to call
      let result;
      
      if (dbType === 'orbitdb') {
        result = await databaseBackupBridge.restoreOrbitDB({
          backup_id: backupId,
          auth_token: authToken,
          target_collections: collections
        });
      } else if (dbType === 'fireproofdb') {
        result = await databaseBackupBridge.restoreFireproofDB({
          backup_id: backupId,
          auth_token: authToken,
          target_collections: collections
        });
      } else if (dbType === 'duckdb') {
        result = await databaseBackupBridge.restoreDuckDB({
          backup_id: backupId,
          auth_token: authToken,
          target_tables: collections
        });
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      if (result && result.success) {
        this.showSuccess('Restore completed successfully');
        
        // Emit event so other components can update
        if (this.eventBus) {
          this.eventBus.emit('database-restored', {
            dbType,
            backupId,
            result
          });
        }
      } else {
        this.showError('Failed to restore: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error restoring backup:', err);
      this.showError('Failed to restore: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Delete a backup
   * 
   * @param {string} dbType - Database type
   * @param {string} backupId - Backup ID
   */
  async deleteBackup(dbType, backupId) {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Delete backup
      const result = await databaseBackupBridge.deleteBackup(dbType, backupId, authToken);
      
      if (result && result.success) {
        this.showSuccess('Backup deleted successfully');
        
        // If the deleted backup was selected, clear selection
        if (this.selectedBackupId === backupId) {
          this.selectedBackupId = null;
        }
        
        // Reload backups
        await this.loadBackups(dbType);
      } else {
        this.showError('Failed to delete backup: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error deleting backup:', err);
      this.showError('Failed to delete backup: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Create a new scheduled backup
   * 
   * @param {Object} schedule - Schedule information
   */
  async createSchedule(schedule) {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Create schedule
      const result = await databaseBackupBridge.scheduleBackup(schedule, authToken);
      
      if (result && result.success) {
        this.showSuccess('Schedule created successfully');
        
        // Reload schedules
        await this.loadSchedules();
      } else {
        this.showError('Failed to create schedule: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error creating schedule:', err);
      this.showError('Failed to create schedule: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Delete a scheduled backup
   * 
   * @param {number} scheduleId - Schedule ID
   */
  async deleteSchedule(scheduleId) {
    this.isLoading = true;
    this.render();
    
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      
      // Delete schedule
      const result = await databaseBackupBridge.deleteSchedule(scheduleId, authToken);
      
      if (result && result.success) {
        this.showSuccess('Schedule deleted successfully');
        
        // If the deleted schedule was selected, clear selection
        if (this.selectedScheduleId === scheduleId) {
          this.selectedScheduleId = null;
        }
        
        // Reload schedules
        await this.loadSchedules();
      } else {
        this.showError('Failed to delete schedule: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error deleting schedule:', err);
      this.showError('Failed to delete schedule: ' + err.message);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  
  /**
   * Get auth token for API calls
   * 
   * @returns {Promise<string>} Auth token
   */
  async getAuthToken() {
    if (!this.authManager) {
      this._showError('Auth manager not available');
      throw new Error('Auth manager not available');
    }
    
    try {
      // Try to get a capability token for admin access
      const token = await this.authManager.getSelfSignedToken(this.capabilities.admin);
      return token;
    } catch (err) {
      console.error('Error getting auth token:', err);
      throw err;
    }
  }
  
  /**
   * Check if a capability is available
   * 
   * @param {string} capability - Capability to check
   * @returns {Promise<boolean>} Whether the capability is available
   */
  async checkCapability(capability) {
    if (!this.authManager) {
      return false;
    }
    
    try {
      return await this.authManager.checkCapability(capability);
    } catch (err) {
      console.error('Error checking capability:', err);
      return false;
    }
  }
  
  /**
   * Show a success message
   * 
   * @param {string} message - Success message
   */
  showSuccess(message) {
    if (window.toastr) {
      window.toastr.success(message);
    } else {
      alert(message);
    }
  }
  
  /**
   * Show an error message
   * 
   * @param {string} message - Error message
   */
  showError(message) {
    if (window.toastr) {
      window.toastr.error(message);
    } else {
      alert(`Error: ${message}`);
    }
  }
  
  /**
   * Handle backup started event
   * 
   * @param {Object} data - Event data
   */
  handleBackupStarted(data) {
    // Add to in-progress operations
    this.inProgressOperations.set(data.operation_id, {
      id: data.operation_id,
      type: 'backup',
      db_type: data.db_type,
      collections: data.collections,
      status: 'starting',
      progress: 0,
      start_time: Date.now()
    });
    
    // Add to recent activity
    this.addActivityItem({
      type: 'backup',
      status: 'started',
      db_type: data.db_type,
      collections: data.collections,
      timestamp: Date.now()
    });
    
    // Update display
    this.updateOperationsDisplay();
  }
  
  /**
   * Handle backup progress event
   * 
   * @param {Object} data - Event data
   */
  handleBackupProgress(data) {
    // Update in-progress operation
    if (this.inProgressOperations.has(data.operation_id)) {
      const operation = this.inProgressOperations.get(data.operation_id);
      operation.status = data.status;
      operation.progress = data.progress;
      operation.last_updated = Date.now();
      
      // Update display
      this.updateOperationsDisplay();
    }
  }
  
  /**
   * Handle backup completed event
   * 
   * @param {Object} data - Event data
   */
  handleBackupCompleted(data) {
    // Remove from in-progress operations
    this.inProgressOperations.delete(data.operation_id);
    
    // Add to recent activity
    this.addActivityItem({
      type: 'backup',
      status: 'completed',
      db_type: data.db_type,
      backup_id: data.backup_id,
      cid: data.cid,
      timestamp: Date.now()
    });
    
    // Update metrics charts
    this.updateMetricsCharts();
    
    // Refresh backup list
    this.loadBackups(data.db_type);
    
    // Show success notification
    this.showSuccess(`Backup completed successfully. Backup ID: ${data.backup_id}`);
    
    // Update display
    this.updateOperationsDisplay();
  }
  
  /**
   * Handle backup error event
   * 
   * @param {Object} data - Event data
   */
  handleBackupError(data) {
    // Remove from in-progress operations
    this.inProgressOperations.delete(data.operation_id);
    
    // Add to recent activity
    this.addActivityItem({
      type: 'backup',
      status: 'error',
      db_type: data.db_type,
      error: data.error,
      timestamp: Date.now()
    });
    
    // Show error notification
    this.showError(`Backup failed: ${data.error}`);
    
    // Update display
    this.updateOperationsDisplay();
  }
  
  /**
   * Handle restore started event
   * 
   * @param {Object} data - Event data
   */
  handleRestoreStarted(data) {
    // Add to in-progress operations
    this.inProgressOperations.set(data.operation_id, {
      id: data.operation_id,
      type: 'restore',
      db_type: data.db_type,
      backup_id: data.backup_id,
      cid: data.cid,
      target_collections: data.target_collections,
      status: 'starting',
      progress: 0,
      start_time: Date.now()
    });
    
    // Add to recent activity
    this.addActivityItem({
      type: 'restore',
      status: 'started',
      db_type: data.db_type,
      backup_id: data.backup_id,
      timestamp: Date.now()
    });
    
    // Update display
    this.updateOperationsDisplay();
  }
  
  /**
   * Handle restore progress event
   * 
   * @param {Object} data - Event data
   */
  handleRestoreProgress(data) {
    // Update in-progress operation
    if (this.inProgressOperations.has(data.operation_id)) {
      const operation = this.inProgressOperations.get(data.operation_id);
      operation.status = data.status;
      operation.progress = data.progress;
      operation.last_updated = Date.now();
      
      // Update display
      this.updateOperationsDisplay();
    }
  }
  
  /**
   * Handle restore completed event
   * 
   * @param {Object} data - Event data
   */
  handleRestoreCompleted(data) {
    // Remove from in-progress operations
    this.inProgressOperations.delete(data.operation_id);
    
    // Add to recent activity
    this.addActivityItem({
      type: 'restore',
      status: 'completed',
      db_type: data.db_type,
      backup_id: data.backup_id,
      cid: data.cid,
      timestamp: Date.now()
    });
    
    // Show success notification
    this.showSuccess(`Restore completed successfully from backup ${data.backup_id}`);
    
    // Update display
    this.updateOperationsDisplay();
  }
  
  /**
   * Handle restore error event
   * 
   * @param {Object} data - Event data
   */
  handleRestoreError(data) {
    // Remove from in-progress operations
    this.inProgressOperations.delete(data.operation_id);
    
    // Add to recent activity
    this.addActivityItem({
      type: 'restore',
      status: 'error',
      db_type: data.db_type,
      backup_id: data.backup_id,
      error: data.error,
      timestamp: Date.now()
    });
    
    // Show error notification
    this.showError(`Restore failed: ${data.error}`);
    
    // Update display
    this.updateOperationsDisplay();
  }
  
  /**
   * Handle backups listed event
   * 
   * @param {Object} data - Event data
   */
  handleBackupsListed(data) {
    // Update stats
    const totalBackupsElement = this.element.querySelector('#total-backups');
    if (totalBackupsElement) {
      totalBackupsElement.textContent = data.count || 0;
    }
    
    // Update storage used
    const storageUsedElement = this.element.querySelector('#storage-used');
    if (storageUsedElement && data.total_size) {
      storageUsedElement.textContent = formatFileSize(data.total_size);
    }
    
    // Update last backup timestamp
    if (data.backups && data.backups.length > 0) {
      const lastBackup = data.backups[0]; // Assuming the first is the most recent
      const lastBackupElement = this.element.querySelector('#last-backup');
      if (lastBackupElement && lastBackup.timestamp) {
        lastBackupElement.textContent = formatDate(lastBackup.timestamp);
      }
    }
    
    // Update metrics charts
    this.updateMetricsCharts();
  }
  
  /**
   * Handle schedules listed event
   * 
   * @param {Object} data - Event data
   */
  handleSchedulesListed(data) {
    // Update metrics charts
    this.updateMetricsCharts();
  }
  
  /**
   * Update operations display
   */
  updateOperationsDisplay() {
    const operationsContainer = this.element.querySelector('#operations-container');
    if (!operationsContainer) return;
    
    // Get operations in reverse chronological order
    const operations = Array.from(this.inProgressOperations.values()).sort((a, b) => {
      return b.start_time - a.start_time;
    });
    
    // Remove any empty operations indicator
    const emptyIndicator = operationsContainer.querySelector('.no-operations');
    if (emptyIndicator && operations.length > 0) {
      emptyIndicator.remove();
    }
    
    if (operations.length === 0) {
      operationsContainer.innerHTML = '<div class="no-operations">No operations in progress</div>';
      return;
    }
    
    // Create or update operation elements
    operations.forEach(operation => {
      let operationElement = operationsContainer.querySelector(`[data-operation-id="${operation.id}"]`);
      
      // Create new element if it doesn't exist
      if (!operationElement) {
        operationElement = document.createElement('div');
        operationElement.classList.add('operation-item');
        operationElement.setAttribute('data-operation-id', operation.id);
        operationsContainer.appendChild(operationElement);
      }
      
      // Calculate elapsed time
      const elapsed = operation.last_updated ? 
        operation.last_updated - operation.start_time : 
        Date.now() - operation.start_time;
      
      // Get operation title
      const title = operation.type === 'backup' ? 
        `Backup ${this.databaseTypes.find(t => t.id === operation.db_type)?.name || operation.db_type}` : 
        `Restore ${this.databaseTypes.find(t => t.id === operation.db_type)?.name || operation.db_type}`;
      
      // Get status class
      const statusClass = operation.status;
      
      // Format for display
      operationElement.innerHTML = `
        <div class="operation-header">
          <div class="operation-title">${title}</div>
          <div class="operation-status ${statusClass}">${operation.status}</div>
        </div>
        <div class="operation-details">
          ${operation.type === 'backup' ? 
            `Collections: ${operation.collections ? (Array.isArray(operation.collections) ? operation.collections.join(', ') : operation.collections) : 'All'}` : 
            `Backup ID: ${operation.backup_id || 'N/A'}`
          }
        </div>
        <div class="operation-info">
          <div class="operation-elapsed">Elapsed: ${this.formatElapsedTime(elapsed)}</div>
          <div class="operation-progress">Progress: ${operation.progress}%</div>
        </div>
        <div class="operation-progress-container">
          <div class="operation-progress-bar ${operation.status}" style="width: ${operation.progress}%"></div>
        </div>
      `;
    });
    
    // Remove stale operation elements
    const operationIds = operations.map(op => op.id);
    operationsContainer.querySelectorAll('.operation-item').forEach(element => {
      const operationId = element.getAttribute('data-operation-id');
      if (!operationIds.includes(operationId)) {
        element.remove();
      }
    });
  }
  
  /**
   * Format elapsed time
   * 
   * @param {number} ms - Elapsed time in milliseconds
   * @returns {string} Formatted time string
   */
  formatElapsedTime(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }
  
  /**
   * Add activity item to recent activity
   * 
   * @param {Object} activity - Activity item
   */
  addActivityItem(activity) {
    // Add to beginning of recent activity list
    this.recentActivity.unshift(activity);
    
    // Limit to 20 items
    if (this.recentActivity.length > 20) {
      this.recentActivity.pop();
    }
    
    // Update recent activity display
    this.updateRecentActivityDisplay();
  }
  
  /**
   * Update recent activity display
   */
  updateRecentActivityDisplay() {
    const activityList = this.element.querySelector('#recent-activity-list');
    if (!activityList) return;
    
    if (this.recentActivity.length === 0) {
      activityList.innerHTML = '<div class="activity-empty">No recent activity to display</div>';
      return;
    }
    
    activityList.innerHTML = '';
    
    this.recentActivity.forEach(activity => {
      const activityItem = document.createElement('div');
      activityItem.classList.add('activity-item');
      
      // Get activity icon
      let icon = '';
      if (activity.type === 'backup') {
        if (activity.status === 'started') icon = '<i class="fas fa-cloud-upload-alt"></i>';
        else if (activity.status === 'completed') icon = '<i class="fas fa-check-circle"></i>';
        else if (activity.status === 'error') icon = '<i class="fas fa-exclamation-circle"></i>';
      } else if (activity.type === 'restore') {
        if (activity.status === 'started') icon = '<i class="fas fa-cloud-download-alt"></i>';
        else if (activity.status === 'completed') icon = '<i class="fas fa-check-circle"></i>';
        else if (activity.status === 'error') icon = '<i class="fas fa-exclamation-circle"></i>';
      }
      
      // Get activity message
      let message = '';
      if (activity.type === 'backup') {
        const dbName = this.databaseTypes.find(t => t.id === activity.db_type)?.name || activity.db_type;
        if (activity.status === 'started') {
          message = `Started backup of ${dbName}`;
        } else if (activity.status === 'completed') {
          message = `Completed backup of ${dbName} (ID: ${activity.backup_id})`;
        } else if (activity.status === 'error') {
          message = `Error backing up ${dbName}: ${activity.error}`;
        }
      } else if (activity.type === 'restore') {
        const dbName = this.databaseTypes.find(t => t.id === activity.db_type)?.name || activity.db_type;
        if (activity.status === 'started') {
          message = `Started restore of ${dbName} from backup ${activity.backup_id}`;
        } else if (activity.status === 'completed') {
          message = `Completed restore of ${dbName} from backup ${activity.backup_id}`;
        } else if (activity.status === 'error') {
          message = `Error restoring ${dbName}: ${activity.error}`;
        }
      }
      
      activityItem.innerHTML = `
        <div class="activity-icon">${icon}</div>
        <div class="activity-content">
          <div class="activity-message">${message}</div>
          <div class="activity-time">${formatDate(activity.timestamp)}</div>
        </div>
      `;
      
      activityList.appendChild(activityItem);
    });
  }
  
  /**
   * Initialize metrics charts
   */
  initMetricsCharts() {
    if (!window.Chart) {
      console.warn('Chart.js not available, skipping metrics charts');
      return;
    }
    
    // Create total backups chart
    this.totalBackupsChart = new Chart(
      document.getElementById('total-backups-chart'),
      {
        type: 'bar',
        data: {
          labels: this.databaseTypes.map(type => type.name),
          datasets: [{
            label: 'Total Backups',
            data: this.databaseTypes.map(type => 0),
            backgroundColor: [
              'rgba(54, 162, 235, 0.5)',
              'rgba(75, 192, 192, 0.5)',
              'rgba(255, 206, 86, 0.5)'
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(75, 192, 192, 1)',
              'rgba(255, 206, 86, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }
    );
    
    // Create backup frequency chart
    this.backupFrequencyChart = new Chart(
      document.getElementById('backup-frequency-chart'),
      {
        type: 'line',
        data: {
          labels: Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toLocaleDateString();
          }).reverse(),
          datasets: [{
            label: 'Backups per Day',
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }
    );
    
    // Create backup duration chart
    this.backupDurationChart = new Chart(
      document.getElementById('backup-duration-chart'),
      {
        type: 'bar',
        data: {
          labels: this.databaseTypes.map(type => type.name),
          datasets: [{
            label: 'Average Duration (seconds)',
            data: this.databaseTypes.map(type => 0),
            backgroundColor: [
              'rgba(54, 162, 235, 0.5)',
              'rgba(75, 192, 192, 0.5)',
              'rgba(255, 206, 86, 0.5)'
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(75, 192, 192, 1)',
              'rgba(255, 206, 86, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }
    );
    
    // Create storage usage chart
    this.storageUsageChart = new Chart(
      document.getElementById('storage-usage-chart'),
      {
        type: 'pie',
        data: {
          labels: this.databaseTypes.map(type => type.name),
          datasets: [{
            label: 'Storage Usage',
            data: this.databaseTypes.map(type => 0),
            backgroundColor: [
              'rgba(54, 162, 235, 0.5)',
              'rgba(75, 192, 192, 0.5)',
              'rgba(255, 206, 86, 0.5)'
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(75, 192, 192, 1)',
              'rgba(255, 206, 86, 1)'
            ],
            borderWidth: 1
          }]
        }
      }
    );
  }
  
  /**
   * Update metrics charts with current data
   */
  updateMetricsCharts() {
    // Get metrics from bridge
    const metrics = databaseBackupBridge.getOperationMetrics();
    
    // Exit if charts not initialized or metrics not available
    if (!this.totalBackupsChart || !metrics) return;
    
    // Update total backups chart
    this.totalBackupsChart.data.datasets[0].data = [
      metrics.gauges.total_backups.orbitdb || 0,
      metrics.gauges.total_backups.fireproofdb || 0,
      metrics.gauges.total_backups.duckdb || 0
    ];
    this.totalBackupsChart.update();
    
    // Update backup frequency chart (would need historical data)
    // This is just a placeholder - replace with actual data in a full implementation
    this.backupFrequencyChart.update();
    
    // Update backup duration chart
    // Calculate average duration for each database type from histograms
    const durations = [
      metrics.histograms.backup_duration.orbitdb ? 
        (metrics.histograms.backup_duration.orbitdb.sum / Math.max(1, metrics.histograms.backup_duration.orbitdb.count)) : 0,
      metrics.histograms.backup_duration.fireproofdb ? 
        (metrics.histograms.backup_duration.fireproofdb.sum / Math.max(1, metrics.histograms.backup_duration.fireproofdb.count)) : 0,
      metrics.histograms.backup_duration.duckdb ? 
        (metrics.histograms.backup_duration.duckdb.sum / Math.max(1, metrics.histograms.backup_duration.duckdb.count)) : 0
    ];
    
    this.backupDurationChart.data.datasets[0].data = durations;
    this.backupDurationChart.update();
    
    // Calculate total size from backup size histograms
    const sizes = [
      metrics.histograms.backup_size.orbitdb ? metrics.histograms.backup_size.orbitdb.sum : 0,
      metrics.histograms.backup_size.fireproofdb ? metrics.histograms.backup_size.fireproofdb.sum : 0,
      metrics.histograms.backup_size.duckdb ? metrics.histograms.backup_size.duckdb.sum : 0
    ];
    
    this.storageUsageChart.data.datasets[0].data = sizes;
    this.storageUsageChart.update();
  }
  
  /**
   * Dispose the component
   */
  dispose() {
    // Clean up event listeners
    if (this.eventBus) {
      this.eventBus.off('refresh-backups');
      this.eventBus.off('refresh-schedules');
    }
    
    // Clean up bridge event listeners
    databaseBackupBridge.removeListener('backup-started', this.handleBackupStarted);
    databaseBackupBridge.removeListener('backup-progress', this.handleBackupProgress);
    databaseBackupBridge.removeListener('backup-completed', this.handleBackupCompleted);
    databaseBackupBridge.removeListener('backup-error', this.handleBackupError);
    
    databaseBackupBridge.removeListener('restore-started', this.handleRestoreStarted);
    databaseBackupBridge.removeListener('restore-progress', this.handleRestoreProgress);
    databaseBackupBridge.removeListener('restore-completed', this.handleRestoreCompleted);
    databaseBackupBridge.removeListener('restore-error', this.handleRestoreError);
    
    databaseBackupBridge.removeListener('backups-listed', this.handleBackupsListed);
    databaseBackupBridge.removeListener('schedules-listed', this.handleSchedulesListed);
    
    // Clean up charts
    if (this.totalBackupsChart) this.totalBackupsChart.destroy();
    if (this.backupFrequencyChart) this.backupFrequencyChart.destroy();
    if (this.backupDurationChart) this.backupDurationChart.destroy();
    if (this.storageUsageChart) this.storageUsageChart.destroy();
    
    // Clean up refresh interval
    if (this.operationRefreshInterval) {
      clearInterval(this.operationRefreshInterval);
    }
    
    // Clean up DOM
    if (this.element) {
      this.element.innerHTML = '';
    }
  }
}

// Export already handled with ES modules at the class definition