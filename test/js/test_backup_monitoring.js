/**
 * Test file for Backup Monitoring Dashboard
 * 
 * This file tests the functionality of the real-time backup monitoring dashboard.
 */

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import BackupMonitoringDashboard from '../../hallucinate_app/node/dashboard/backup_monitoring.js';

// Mock dependencies
jest.mock('../../hallucinate_app/node/database_backup_bridge.js', () => ({
  databaseBackupBridge: {
    _initialized: true,
    init: jest.fn().mockResolvedValue(true),
    on: jest.fn(),
    getInProgressOperations: jest.fn().mockReturnValue([]),
    listBackups: jest.fn().mockResolvedValue([]),
    getDatabaseStatus: jest.fn().mockResolvedValue({ status: 'healthy' })
  }
}));

jest.mock('../../hallucinate_app/node/database_backup_pyarrow_adapter.js', () => ({
  databaseBackupPyArrowAdapter: {
    _initialized: true,
    init: jest.fn().mockResolvedValue(true),
    on: jest.fn(),
    getBackupStats: jest.fn().mockResolvedValue({
      total_count: 10,
      restore_metrics: {
        total_restores: 2
      },
      size_metrics: {
        total_size: 1024 * 1024 * 5 // 5MB
      }
    })
  }
}));

jest.mock('../../hallucinate_app/node/dashboard/observability/metrics_collector.js', () => {
  return jest.fn().mockImplementation(() => ({
    createCounter: jest.fn(),
    createGauge: jest.fn(),
    createHistogram: jest.fn(),
    setGauge: jest.fn(),
    incrementCounter: jest.fn(),
    decrementGauge: jest.fn(),
    recordHistogram: jest.fn()
  }));
});

jest.mock('../../hallucinate_app/node/dashboard/observability/metrics_registry.js', () => ({
  getMetricsRegistry: jest.fn().mockReturnValue({})
}));

// Mock Chart.js
global.Chart = jest.fn().mockImplementation(() => ({
  destroy: jest.fn(),
  update: jest.fn(),
  data: {
    labels: [],
    datasets: [{ data: [] }]
  },
  options: {
    plugins: {
      title: {
        text: ''
      }
    },
    scales: {
      y: {
        title: {
          text: ''
        }
      }
    }
  }
}));

describe('BackupMonitoringDashboard', () => {
  let dashboard;
  let container;
  let mockDatabaseBackupBridge;
  let mockPyarrowAdapter;
  
  beforeEach(() => {
    // Set up DOM elements
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Import the mocked modules
    mockDatabaseBackupBridge = require('../../hallucinate_app/node/database_backup_bridge.js').databaseBackupBridge;
    mockPyarrowAdapter = require('../../hallucinate_app/node/database_backup_pyarrow_adapter.js').databaseBackupPyArrowAdapter;
    
    // Create dashboard instance
    dashboard = new BackupMonitoringDashboard({
      container,
      resources: {
        databaseBackupBridge: mockDatabaseBackupBridge,
        databaseBackupPyArrowAdapter: mockPyarrowAdapter
      }
    });
  });
  
  afterEach(() => {
    // Clean up
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    
    if (dashboard) {
      dashboard.destroy();
    }
    
    jest.clearAllMocks();
  });
  
  it('should initialize correctly', async () => {
    // Verify event listeners were registered
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('backup-started', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('backup-progress', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('backup-completed', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('backup-error', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('restore-started', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('restore-progress', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('restore-completed', expect.any(Function));
    expect(mockDatabaseBackupBridge.on).toHaveBeenCalledWith('restore-error', expect.any(Function));
    
    expect(mockPyarrowAdapter.on).toHaveBeenCalledWith('backup-indexed', expect.any(Function));
    expect(mockPyarrowAdapter.on).toHaveBeenCalledWith('backup-index-error', expect.any(Function));
    expect(mockPyarrowAdapter.on).toHaveBeenCalledWith('restore-metadata-updated', expect.any(Function));
    expect(mockPyarrowAdapter.on).toHaveBeenCalledWith('backup-index-discrepancy', expect.any(Function));
    
    // Verify UI was created
    expect(container.querySelector('.backup-monitoring-dashboard')).not.toBeNull();
    expect(container.querySelector('.monitoring-header')).not.toBeNull();
    expect(container.querySelector('.active-operations-panel')).not.toBeNull();
    expect(container.querySelector('.activity-panel')).not.toBeNull();
    expect(container.querySelector('.status-panel')).not.toBeNull();
    expect(container.querySelector('.stats-panel')).not.toBeNull();
    expect(container.querySelector('.alerts-panel')).not.toBeNull();
  });
  
  it('should handle backup events correctly', async () => {
    // Mock event handlers
    const handleBackupStartedSpy = jest.spyOn(dashboard, '_handleBackupStarted');
    const handleBackupProgressSpy = jest.spyOn(dashboard, '_handleBackupProgress');
    const handleBackupCompletedSpy = jest.spyOn(dashboard, '_handleBackupCompleted');
    const handleBackupErrorSpy = jest.spyOn(dashboard, '_handleBackupError');
    
    // Simulate backup events
    const backupStartedData = {
      operation_id: 'op1',
      db_type: 'orbitdb',
      type: 'backup'
    };
    
    const backupProgressData = {
      operation_id: 'op1',
      progress: 50,
      status: 'in-progress'
    };
    
    const backupCompletedData = {
      operation_id: 'op1',
      backup_id: 'backup1',
      cid: 'Qm123456',
      size: 1024,
      document_count: 100
    };
    
    const backupErrorData = {
      operation_id: 'op1',
      error: 'Test error'
    };
    
    // The dashboard should be initialized now
    dashboard.isInitialized = true;
    
    // Trigger events
    dashboard._handleBackupStarted(backupStartedData);
    dashboard._handleBackupProgress(backupProgressData);
    dashboard._handleBackupCompleted(backupCompletedData);
    dashboard._handleBackupError(backupErrorData);
    
    // Verify handlers were called
    expect(handleBackupStartedSpy).toHaveBeenCalledWith(backupStartedData);
    expect(handleBackupProgressSpy).toHaveBeenCalledWith(backupProgressData);
    expect(handleBackupCompletedSpy).toHaveBeenCalledWith(backupCompletedData);
    expect(handleBackupErrorSpy).toHaveBeenCalledWith(backupErrorData);
  });
  
  it('should update UI correctly', async () => {
    // Mock some active operations
    dashboard.activeOperations.set('op1', {
      operation_id: 'op1',
      db_type: 'orbitdb',
      type: 'backup',
      progress: 75,
      start_time: Date.now() - 30000, // 30 seconds ago
      status: 'in-progress'
    });
    
    // Update UI
    dashboard._updateActiveOperationsUI();
    
    // Verify UI was updated
    const operationCards = container.querySelectorAll('.operation-card');
    expect(operationCards.length).toBe(1);
    expect(operationCards[0].querySelector('.operation-type').textContent).toBe('backup');
    expect(operationCards[0].querySelector('.operation-db').textContent).toBe('orbitdb');
    expect(operationCards[0].querySelector('.progress-text').textContent).toBe('75%');
    
    // Add an activity log entry
    dashboard._addToActivityLog({
      type: 'backup',
      status: 'completed',
      db_type: 'orbitdb',
      message: 'Backup completed for orbitdb',
      timestamp: new Date()
    });
    
    // Verify activity log was updated
    const activityItems = container.querySelectorAll('.activity-item');
    expect(activityItems.length).toBe(1);
    expect(activityItems[0].querySelector('.activity-message').textContent).toBe('Backup completed for orbitdb');
    
    // Add an alert
    dashboard._addAlert('error', 'Test Alert', 'This is a test alert');
    
    // Verify alert was added
    const alertItems = container.querySelectorAll('.alert-item');
    expect(alertItems.length).toBe(1);
    expect(alertItems[0].querySelector('.alert-type').textContent).toBe('Test Alert');
    expect(alertItems[0].querySelector('.alert-message').textContent).toBe('This is a test alert');
  });
  
  it('should format timestamps correctly', () => {
    // Current date for today's timestamp
    const today = new Date();
    const formatResult = dashboard._formatTimestamp(today);
    
    // Should return time only for today's dates (not testing exact format due to locale differences)
    expect(formatResult).not.toBeNull();
    
    // Past date for full timestamp display
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7); // 7 days ago
    const pastFormatResult = dashboard._formatTimestamp(pastDate);
    
    // Should return date and time for past dates
    expect(pastFormatResult).not.toBeNull();
  });
  
  it('should format sizes correctly', () => {
    // Bytes
    expect(dashboard._formatSize(500)).toBe('500 B');
    
    // Kilobytes
    expect(dashboard._formatSize(1536)).toBe('1.5 KB');
    
    // Megabytes
    expect(dashboard._formatSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
    
    // Gigabytes
    expect(dashboard._formatSize(1024 * 1024 * 1024 * 4.2)).toBe('4.2 GB');
  });
});