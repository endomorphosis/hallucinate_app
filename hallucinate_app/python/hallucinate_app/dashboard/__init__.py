"""
Dashboard package for hallucinate_app

Contains dashboard components for visualizing various aspects of the application,
including error monitoring, database synchronization, query optimization, and more.
"""

from hallucinate_app.dashboard.error_monitor_status_panel import ErrorMonitorStatusPanel
from hallucinate_app.dashboard.error_monitor_dashboard import ErrorMonitorDashboard
from hallucinate_app.dashboard.database_sync_status_panel import DatabaseSyncStatusPanel
from hallucinate_app.dashboard.database_sync_dashboard import DatabaseSyncDashboard
from hallucinate_app.dashboard.query_optimizer_status_panel import QueryOptimizerStatusPanel
from hallucinate_app.dashboard.query_optimizer_dashboard import QueryOptimizerDashboard
from hallucinate_app.dashboard.ipfs_kit_panel import IPFSKitPanel
from hallucinate_app.dashboard.ipfs_datasets_panel import IPFSDatasetsPanel
from hallucinate_app.dashboard.ipfs_model_manager_panel import IPFSModelManagerPanel
from hallucinate_app.dashboard.ipfs_transformers_panel import IPFSTransformersPanel

__all__ = [
    'ErrorMonitorStatusPanel',
    'ErrorMonitorDashboard',
    'DatabaseSyncStatusPanel',
    'DatabaseSyncDashboard',
    'QueryOptimizerStatusPanel',
    'QueryOptimizerDashboard',
    'IPFSKitPanel',
    'IPFSDatasetsPanel',
    'IPFSModelManagerPanel',
    'IPFSTransformersPanel'
]