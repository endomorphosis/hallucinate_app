"""
Database Synchronization Status Panel

Provides a dashboard panel for visualizing database synchronization status,
metrics, alerts, and trends.
"""

import os
import time
import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_sync_status_panel")

class DatabaseSyncStatusPanel:
    """
    Dashboard panel for visualizing database synchronization status.
    
    Integrates with DatabaseSyncMonitor to show real-time sync status,
    metrics, alerts, and trends.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the sync status panel
        
        Args:
            resources (dict): Shared resources (syncMonitor, etc.)
            metadata (dict): Configuration metadata
        """
        # Set default values
        resources = resources or {}
        metadata = metadata or {}
        
        # Initialize resources
        self.resources = resources
        self.metadata = metadata
        
        # Verify required resources
        if not resources.get("syncMonitor"):
            raise ValueError("SyncMonitor resource is required for DatabaseSyncStatusPanel")
        
        # Configuration options
        self.config = {
            "refreshInterval": metadata.get("refreshInterval", 5000),  # Default: 5 seconds
            "alertsLimit": metadata.get("alertsLimit", 5),  # Show last 5 alerts
            "historyLimit": metadata.get("historyLimit", 10),  # Show last 10 sync events
            "enableRealTimeUpdates": metadata.get("enableRealTimeUpdates", True),
            "enableMetricsCharts": metadata.get("enableMetricsCharts", True),
            "enableStatusIcons": metadata.get("enableStatusIcons", True),
            "enableAlertNotifications": metadata.get("enableAlertNotifications", True),
            "panelTitle": metadata.get("panelTitle", "Database Synchronization Status"),
            "customCss": metadata.get("customCss", ""),
            "theme": metadata.get("theme", "light")  # or "dark"
        }
        
        # UI state
        self.ui_state = {
            "lastUpdated": 0,
            "activeTab": "status",  # "status", "metrics", "alerts", "history"
            "expandedSections": set(),
            "filterSettings": {
                "alerts": {
                    "severity": "all",  # "all", "error", "warning", "info"
                    "acknowledged": "all"  # "all", "acknowledged", "unacknowledged"
                },
                "history": {
                    "syncType": "all"  # "all", "orbit-to-fireproof", etc.
                }
            }
        }
        
        # Callbacks
        self.callbacks = {
            "onAlertAcknowledge": None,
            "onStatusClick": None,
            "onMetricsExport": None,
            "onRefresh": None,
            "onFilterChange": None,
            "onTabChange": None
        }
        
        # Auto refresh interval
        self.refresh_interval = None
        
        # Subscription handler for real-time updates
        self.subscription_active = False
    
    async def init(self):
        """
        Initialize the panel
        
        Returns:
            dict: Initialization result
        """
        try:
            # Register for real-time updates from monitor
            if self.config["enableRealTimeUpdates"]:
                self._subscribe_to_updates()
            
            # Start auto-refresh if enabled
            if self.config["refreshInterval"] > 0:
                self._start_auto_refresh()
            
            logger.info("Database sync status panel initialized")
            return {"success": True, "message": "Database sync status panel initialized"}
            
        except Exception as e:
            logger.error(f"Failed to initialize database sync status panel: {str(e)}")
            raise ValueError(f"DatabaseSyncStatusPanel initialization failed: {str(e)}")
    
    def _subscribe_to_updates(self):
        """
        Subscribe to real-time updates from sync monitor
        """
        sync_monitor = self.resources["syncMonitor"]
        
        # Subscribe to status updates
        sync_monitor.subscribe("status", self._handle_status_update)
        
        # Subscribe to metrics updates
        sync_monitor.subscribe("metrics", self._handle_metrics_update)
        
        # Subscribe to alert updates
        sync_monitor.subscribe("alerts", self._handle_alert_update)
        
        self.subscription_active = True
        logger.info("Subscribed to real-time sync updates")
    
    def _unsubscribe_from_updates(self):
        """
        Unsubscribe from real-time updates
        """
        if self.subscription_active:
            sync_monitor = self.resources["syncMonitor"]
            
            # Unsubscribe from all update types
            sync_monitor.unsubscribe("status", self._handle_status_update)
            sync_monitor.unsubscribe("metrics", self._handle_metrics_update)
            sync_monitor.unsubscribe("alerts", self._handle_alert_update)
            
            self.subscription_active = False
            logger.info("Unsubscribed from real-time sync updates")
    
    def _handle_status_update(self, update):
        """
        Handle status updates from sync monitor
        
        Args:
            update (dict): Status update data
        """
        # Update UI state
        self.ui_state["lastUpdated"] = int(time.time() * 1000)
        
        # Refresh UI with new data
        self.refresh_ui(update_type="status")
    
    def _handle_metrics_update(self, update):
        """
        Handle metrics updates from sync monitor
        
        Args:
            update (dict): Metrics update data
        """
        # Update UI state
        self.ui_state["lastUpdated"] = int(time.time() * 1000)
        
        # Refresh UI with new data
        self.refresh_ui(update_type="metrics")
    
    def _handle_alert_update(self, update):
        """
        Handle alert updates from sync monitor
        
        Args:
            update (dict): Alert update data
        """
        # Update UI state
        self.ui_state["lastUpdated"] = int(time.time() * 1000)
        
        # Refresh UI with new data
        self.refresh_ui(update_type="alerts")
        
        # Trigger alert notification if enabled
        if self.config["enableAlertNotifications"]:
            self._trigger_alert_notification(update["data"])
    
    def _start_auto_refresh(self):
        """
        Start auto-refresh of dashboard data
        """
        if self.refresh_interval:
            self.refresh_interval.cancel()
        
        def refresh_task():
            try:
                # Refresh UI
                self.refresh_ui()
            except Exception as e:
                logger.error(f"Error during auto-refresh: {str(e)}")
            
            # Reschedule the task
            self.refresh_interval = asyncio.get_event_loop().call_later(
                self.config["refreshInterval"] / 1000,
                refresh_task
            )
        
        # Start the first refresh
        self.refresh_interval = asyncio.get_event_loop().call_later(
            self.config["refreshInterval"] / 1000,
            refresh_task
        )
        
        logger.info(f"Auto-refresh started with interval {self.config['refreshInterval']}ms")
    
    def _stop_auto_refresh(self):
        """
        Stop auto-refresh
        """
        if self.refresh_interval:
            self.refresh_interval.cancel()
            self.refresh_interval = None
            logger.info("Auto-refresh stopped")
    
    def refresh_ui(self, update_type=None):
        """
        Refresh the UI with current data
        
        Args:
            update_type (str, optional): Type of update that triggered the refresh
        """
        try:
            # Get current data from sync monitor
            sync_monitor = self.resources["syncMonitor"]
            
            # Get data based on current tab or updated component
            if update_type == "status" or self.ui_state["activeTab"] == "status":
                status_data = sync_monitor.get_sync_status()
                self._update_status_view(status_data)
            
            if update_type == "metrics" or self.ui_state["activeTab"] == "metrics":
                metrics_data = sync_monitor.get_sync_metrics()
                self._update_metrics_view(metrics_data)
            
            if update_type == "alerts" or self.ui_state["activeTab"] == "alerts":
                alerts_data = sync_monitor.get_recent_alerts(self.config["alertsLimit"])
                self._update_alerts_view(alerts_data)
            
            if update_type == "history" or self.ui_state["activeTab"] == "history":
                # Get last day of history
                history_data = sync_monitor.get_sync_history(days=1)
                self._update_history_view(history_data)
            
            # Update last updated timestamp in UI
            self._update_timestamp_view()
            
            # Trigger onRefresh callback if registered
            if self.callbacks["onRefresh"]:
                self.callbacks["onRefresh"]({
                    "timestamp": int(time.time() * 1000),
                    "updateType": update_type
                })
                
        except Exception as e:
            logger.error(f"Error refreshing UI: {str(e)}")
    
    def _update_status_view(self, status_data):
        """
        Update the status view with current data
        
        Args:
            status_data (dict): Current sync status data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the status data
        logger.debug(f"Status view updated with data: {status_data}")
    
    def _update_metrics_view(self, metrics_data):
        """
        Update the metrics view with current data
        
        Args:
            metrics_data (dict): Current sync metrics data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the metrics data
        logger.debug(f"Metrics view updated")
    
    def _update_alerts_view(self, alerts_data):
        """
        Update the alerts view with current data
        
        Args:
            alerts_data (list): Current alerts data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the alerts data
        logger.debug(f"Alerts view updated with {len(alerts_data)} alerts")
    
    def _update_history_view(self, history_data):
        """
        Update the history view with current data
        
        Args:
            history_data (list): Current sync history data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the history data
        logger.debug(f"History view updated with {len(history_data)} entries")
    
    def _update_timestamp_view(self):
        """
        Update the timestamp display in the UI
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the current timestamp
        logger.debug(f"Timestamp updated to {self.ui_state['lastUpdated']}")
    
    def _trigger_alert_notification(self, alert_data):
        """
        Trigger a notification for a new alert
        
        Args:
            alert_data (dict): Alert data
        """
        # Implementation depends on the UI framework being used
        # This method would show a notification to the user
        logger.debug(f"Alert notification triggered: {alert_data['message']}")
    
    def set_active_tab(self, tab_name):
        """
        Set the active tab
        
        Args:
            tab_name (str): Name of tab to activate ('status', 'metrics', 'alerts', 'history')
            
        Returns:
            dict: Operation result
        """
        if tab_name not in ["status", "metrics", "alerts", "history"]:
            return {"success": False, "message": f"Invalid tab name: {tab_name}"}
        
        self.ui_state["activeTab"] = tab_name
        
        # Refresh UI for the new tab
        self.refresh_ui()
        
        # Trigger onTabChange callback if registered
        if self.callbacks["onTabChange"]:
            self.callbacks["onTabChange"]({
                "tab": tab_name,
                "timestamp": int(time.time() * 1000)
            })
        
        return {"success": True, "message": f"Active tab set to {tab_name}"}
    
    def set_filter(self, filter_type, filter_name, value):
        """
        Set a filter for the UI
        
        Args:
            filter_type (str): Type of filter ('alerts', 'history')
            filter_name (str): Name of filter setting
            value (str): Filter value
            
        Returns:
            dict: Operation result
        """
        if filter_type not in self.ui_state["filterSettings"]:
            return {"success": False, "message": f"Invalid filter type: {filter_type}"}
        
        if filter_name not in self.ui_state["filterSettings"][filter_type]:
            return {"success": False, "message": f"Invalid filter name: {filter_name}"}
        
        self.ui_state["filterSettings"][filter_type][filter_name] = value
        
        # Refresh UI with new filter
        self.refresh_ui()
        
        # Trigger onFilterChange callback if registered
        if self.callbacks["onFilterChange"]:
            self.callbacks["onFilterChange"]({
                "filterType": filter_type,
                "filterName": filter_name,
                "value": value,
                "timestamp": int(time.time() * 1000)
            })
        
        return {"success": True, "message": f"Filter {filter_name} set to {value}"}
    
    def acknowledge_alert(self, alert_id):
        """
        Acknowledge an alert
        
        Args:
            alert_id (str): ID of the alert to acknowledge
            
        Returns:
            dict: Operation result
        """
        sync_monitor = self.resources["syncMonitor"]
        result = sync_monitor.acknowledge_alert(alert_id)
        
        if result["success"]:
            # Refresh alerts view
            self.refresh_ui(update_type="alerts")
            
            # Trigger onAlertAcknowledge callback if registered
            if self.callbacks["onAlertAcknowledge"]:
                self.callbacks["onAlertAcknowledge"]({
                    "alertId": alert_id,
                    "timestamp": int(time.time() * 1000)
                })
        
        return result
    
    def export_metrics(self, format_type="json"):
        """
        Export current metrics
        
        Args:
            format_type (str): Export format ('json', 'csv')
            
        Returns:
            dict: Operation result with export data
        """
        try:
            sync_monitor = self.resources["syncMonitor"]
            metrics_data = sync_monitor.get_sync_metrics()
            trends_data = sync_monitor.get_sync_trends("daily")
            
            # Combine data for export
            export_data = {
                "metrics": metrics_data,
                "trends": trends_data,
                "timestamp": int(time.time() * 1000),
                "generated": datetime.now().isoformat()
            }
            
            # Format based on requested type
            if format_type == "json":
                formatted_data = json.dumps(export_data, indent=2)
            elif format_type == "csv":
                # Simple CSV conversion - for a real implementation, 
                # this would need to be more sophisticated
                rows = ["timestamp,metric,value"]
                rows.append(f"{export_data['timestamp']},total_operations,{metrics_data['syncOperations']['total']}")
                rows.append(f"{export_data['timestamp']},succeeded_operations,{metrics_data['syncOperations']['succeeded']}")
                rows.append(f"{export_data['timestamp']},failed_operations,{metrics_data['syncOperations']['failed']}")
                formatted_data = "\n".join(rows)
            else:
                return {"success": False, "message": f"Unsupported export format: {format_type}"}
            
            # Trigger onMetricsExport callback if registered
            if self.callbacks["onMetricsExport"]:
                self.callbacks["onMetricsExport"]({
                    "format": format_type,
                    "data": export_data,
                    "timestamp": int(time.time() * 1000)
                })
            
            return {
                "success": True,
                "message": f"Metrics exported as {format_type}",
                "data": formatted_data,
                "timestamp": export_data["timestamp"]
            }
            
        except Exception as e:
            logger.error(f"Error exporting metrics: {str(e)}")
            return {"success": False, "message": f"Error exporting metrics: {str(e)}"}
    
    def toggle_section(self, section_name):
        """
        Toggle expansion state of a UI section
        
        Args:
            section_name (str): Name of section to toggle
            
        Returns:
            dict: Operation result
        """
        if section_name in self.ui_state["expandedSections"]:
            self.ui_state["expandedSections"].remove(section_name)
            expanded = False
        else:
            self.ui_state["expandedSections"].add(section_name)
            expanded = True
        
        return {
            "success": True,
            "message": f"Section {section_name} {'expanded' if expanded else 'collapsed'}",
            "expanded": expanded
        }
    
    def register_callback(self, callback_name, callback_function):
        """
        Register a callback function
        
        Args:
            callback_name (str): Name of callback to register
            callback_function (callable): Callback function
            
        Returns:
            dict: Registration result
        """
        if callback_name not in self.callbacks:
            return {"success": False, "message": f"Invalid callback name: {callback_name}"}
        
        if not callable(callback_function):
            return {"success": False, "message": "Callback must be callable"}
        
        self.callbacks[callback_name] = callback_function
        
        return {"success": True, "message": f"Callback {callback_name} registered"}
    
    def unregister_callback(self, callback_name):
        """
        Unregister a callback function
        
        Args:
            callback_name (str): Name of callback to unregister
            
        Returns:
            dict: Unregistration result
        """
        if callback_name not in self.callbacks:
            return {"success": False, "message": f"Invalid callback name: {callback_name}"}
        
        self.callbacks[callback_name] = None
        
        return {"success": True, "message": f"Callback {callback_name} unregistered"}
    
    def get_panel_html(self):
        """
        Get HTML representation of the panel
        
        Returns:
            str: HTML content
        """
        # Get current data
        sync_monitor = self.resources["syncMonitor"]
        status_data = sync_monitor.get_sync_status()
        metrics_data = sync_monitor.get_sync_metrics()
        alerts_data = sync_monitor.get_recent_alerts(self.config["alertsLimit"])
        history_data = sync_monitor.get_sync_history(days=1)[-self.config["historyLimit"]:]
        
        # Generate HTML (basic implementation - would be more sophisticated in real use)
        html = [
            f'<div class="database-sync-panel {self.config["theme"]}-theme">',
            f'  <h2 class="panel-title">{self.config["panelTitle"]}</h2>',
            '  <div class="panel-tabs">',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "status" else "")}" data-tab="status">Status</button>',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "metrics" else "")}" data-tab="metrics">Metrics</button>',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "alerts" else "")}" data-tab="alerts">Alerts</button>',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "history" else "")}" data-tab="history">History</button>',
            '  </div>',
        ]
        
        # Status tab content
        if self.ui_state["activeTab"] == "status":
            html.extend([
                '  <div class="tab-content status-tab">',
                '    <div class="status-grid">',
                f'      <div class="status-card status-{status_data["overall"]}">',
                '        <h3>Overall Status</h3>',
                f'        <div class="status-indicator">{status_data["overall"].upper()}</div>',
                '      </div>',
                f'      <div class="status-card status-{status_data["orbitToFireproof"]}">',
                '        <h3>OrbitDB to FireproofDB</h3>',
                f'        <div class="status-indicator">{status_data["orbitToFireproof"].upper()}</div>',
                '      </div>',
                f'      <div class="status-card status-{status_data["fireproofToOrbit"]}">',
                '        <h3>FireproofDB to OrbitDB</h3>',
                f'        <div class="status-indicator">{status_data["fireproofToOrbit"].upper()}</div>',
                '      </div>',
                f'      <div class="status-card status-{status_data["duckdbExport"]}">',
                '        <h3>DuckDB Export</h3>',
                f'        <div class="status-indicator">{status_data["duckdbExport"].upper()}</div>',
                '      </div>',
                f'      <div class="status-card status-{status_data["duckdbImport"]}">',
                '        <h3>DuckDB Import</h3>',
                f'        <div class="status-indicator">{status_data["duckdbImport"].upper()}</div>',
                '      </div>',
                '    </div>',
                '    <div class="active-jobs-section">',
                '      <h3>Active Jobs</h3>',
                '      <div class="jobs-list">',
            ])
            
            # Add active jobs
            active_jobs = sync_monitor.get_active_jobs()
            if active_jobs:
                for job_id, job_info in active_jobs.items():
                    html.extend([
                        f'        <div class="job-item status-{job_info.get("status", "unknown")}">',
                        f'          <span class="job-id">{job_id}</span>',
                        f'          <span class="job-type">{job_info.get("type", "unknown")}</span>',
                        f'          <span class="job-status">{job_info.get("status", "unknown").upper()}</span>',
                        '        </div>',
                    ])
            else:
                html.append('        <div class="no-jobs">No active jobs</div>')
            
            html.append('      </div>')  # Close jobs-list
            html.append('    </div>')    # Close active-jobs-section
            html.append('  </div>')      # Close status-tab
        
        # Metrics tab content
        elif self.ui_state["activeTab"] == "metrics":
            html.extend([
                '  <div class="tab-content metrics-tab">',
                '    <div class="metrics-summary">',
                '      <div class="metric-card">',
                '        <h3>Sync Operations</h3>',
                f'        <div class="metric-value">{metrics_data["syncOperations"]["total"]}</div>',
                '        <div class="metric-details">',
                f'          <div class="metric-detail success">{metrics_data["syncOperations"]["succeeded"]} succeeded</div>',
                f'          <div class="metric-detail failure">{metrics_data["syncOperations"]["failed"]} failed</div>',
                '        </div>',
                '      </div>',
                '      <div class="metric-card">',
                '        <h3>Conflicts</h3>',
                f'        <div class="metric-value">{metrics_data["conflicts"]["count"]}</div>',
                '        <div class="metric-subtitle">Total Conflicts</div>',
                '      </div>',
                '      <div class="metric-card">',
                '        <h3>Errors</h3>',
                f'        <div class="metric-value">{metrics_data["errors"]["count"]}</div>',
                '        <div class="metric-subtitle">Total Errors</div>',
                '      </div>',
                '    </div>',
                '    <div class="data-volume-section">',
                '      <h3>Data Volume</h3>',
                '      <div class="volume-bars">',
                f'        <div class="volume-bar" style="width: {min(100, metrics_data["dataVolume"]["orbitToFireproof"] / 100)}%;">',
                '          <span class="volume-label">OrbitDB to FireproofDB</span>',
                f'          <span class="volume-value">{metrics_data["dataVolume"]["orbitToFireproof"]}</span>',
                '        </div>',
                f'        <div class="volume-bar" style="width: {min(100, metrics_data["dataVolume"]["fireproofToOrbit"] / 100)}%;">',
                '          <span class="volume-label">FireproofDB to OrbitDB</span>',
                f'          <span class="volume-value">{metrics_data["dataVolume"]["fireproofToOrbit"]}</span>',
                '        </div>',
                f'        <div class="volume-bar" style="width: {min(100, metrics_data["dataVolume"]["duckdbExport"] / 100)}%;">',
                '          <span class="volume-label">DuckDB Export</span>',
                f'          <span class="volume-value">{metrics_data["dataVolume"]["duckdbExport"]}</span>',
                '        </div>',
                f'        <div class="volume-bar" style="width: {min(100, metrics_data["dataVolume"]["duckdbImport"] / 100)}%;">',
                '          <span class="volume-label">DuckDB Import</span>',
                f'          <span class="volume-value">{metrics_data["dataVolume"]["duckdbImport"]}</span>',
                '        </div>',
                '      </div>',
                '    </div>',
                '    <div class="export-section">',
                '      <button class="export-button" data-format="json">Export as JSON</button>',
                '      <button class="export-button" data-format="csv">Export as CSV</button>',
                '    </div>',
                '  </div>',
            ])
        
        # Alerts tab content
        elif self.ui_state["activeTab"] == "alerts":
            html.extend([
                '  <div class="tab-content alerts-tab">',
                '    <div class="filters-bar">',
                '      <div class="filter-group">',
                '        <label>Severity:</label>',
                '        <select class="filter-select" data-filter-type="alerts" data-filter-name="severity">',
                f'          <option value="all" {("selected" if self.ui_state["filterSettings"]["alerts"]["severity"] == "all" else "")}>All</option>',
                f'          <option value="error" {("selected" if self.ui_state["filterSettings"]["alerts"]["severity"] == "error" else "")}>Error</option>',
                f'          <option value="warning" {("selected" if self.ui_state["filterSettings"]["alerts"]["severity"] == "warning" else "")}>Warning</option>',
                f'          <option value="info" {("selected" if self.ui_state["filterSettings"]["alerts"]["severity"] == "info" else "")}>Info</option>',
                '        </select>',
                '      </div>',
                '      <div class="filter-group">',
                '        <label>Status:</label>',
                '        <select class="filter-select" data-filter-type="alerts" data-filter-name="acknowledged">',
                f'          <option value="all" {("selected" if self.ui_state["filterSettings"]["alerts"]["acknowledged"] == "all" else "")}>All</option>',
                f'          <option value="acknowledged" {("selected" if self.ui_state["filterSettings"]["alerts"]["acknowledged"] == "acknowledged" else "")}>Acknowledged</option>',
                f'          <option value="unacknowledged" {("selected" if self.ui_state["filterSettings"]["alerts"]["acknowledged"] == "unacknowledged" else "")}>Unacknowledged</option>',
                '        </select>',
                '      </div>',
                '    </div>',
                '    <div class="alerts-list">',
            ])
            
            # Add alerts with filtering
            severity_filter = self.ui_state["filterSettings"]["alerts"]["severity"]
            acknowledged_filter = self.ui_state["filterSettings"]["alerts"]["acknowledged"]
            
            filtered_alerts = alerts_data
            
            # Apply severity filter
            if severity_filter != "all":
                filtered_alerts = [a for a in filtered_alerts if a.get("severity") == severity_filter]
            
            # Apply acknowledged filter
            if acknowledged_filter == "acknowledged":
                filtered_alerts = [a for a in filtered_alerts if a.get("acknowledged")]
            elif acknowledged_filter == "unacknowledged":
                filtered_alerts = [a for a in filtered_alerts if not a.get("acknowledged")]
            
            if filtered_alerts:
                for alert in filtered_alerts:
                    html.extend([
                        f'      <div class="alert-item severity-{alert.get("severity", "info")} {"acknowledged" if alert.get("acknowledged") else ""}">',
                        f'        <div class="alert-header">',
                        f'          <span class="alert-severity">{alert.get("severity", "").upper()}</span>',
                        f'          <span class="alert-component">{alert.get("component", "")}</span>',
                        f'          <span class="alert-timestamp">{datetime.fromtimestamp(alert.get("timestamp", 0)/1000).strftime("%Y-%m-%d %H:%M:%S")}</span>',
                        '        </div>',
                        f'        <div class="alert-message">{alert.get("message", "")}</div>',
                        '        <div class="alert-actions">',
                    ])
                    
                    if not alert.get("acknowledged"):
                        html.append(f'          <button class="acknowledge-button" data-alert-id="{alert.get("id", "")}">Acknowledge</button>')
                    else:
                        html.append(f'          <span class="acknowledged-label">Acknowledged at {datetime.fromtimestamp(alert.get("acknowledgedAt", 0)/1000).strftime("%Y-%m-%d %H:%M:%S")}</span>')
                    
                    html.extend([
                        '        </div>',
                        '      </div>',
                    ])
            else:
                html.append('      <div class="no-alerts">No alerts match the selected filters</div>')
            
            html.append('    </div>')  # Close alerts-list
            html.append('  </div>')    # Close alerts-tab
        
        # History tab content
        elif self.ui_state["activeTab"] == "history":
            html.extend([
                '  <div class="tab-content history-tab">',
                '    <div class="filters-bar">',
                '      <div class="filter-group">',
                '        <label>Sync Type:</label>',
                '        <select class="filter-select" data-filter-type="history" data-filter-name="syncType">',
                f'          <option value="all" {("selected" if self.ui_state["filterSettings"]["history"]["syncType"] == "all" else "")}>All</option>',
                f'          <option value="orbit-to-fireproof" {("selected" if self.ui_state["filterSettings"]["history"]["syncType"] == "orbit-to-fireproof" else "")}>OrbitDB to FireproofDB</option>',
                f'          <option value="fireproof-to-orbit" {("selected" if self.ui_state["filterSettings"]["history"]["syncType"] == "fireproof-to-orbit" else "")}>FireproofDB to OrbitDB</option>',
                f'          <option value="duckdb-export" {("selected" if self.ui_state["filterSettings"]["history"]["syncType"] == "duckdb-export" else "")}>DuckDB Export</option>',
                f'          <option value="duckdb-import" {("selected" if self.ui_state["filterSettings"]["history"]["syncType"] == "duckdb-import" else "")}>DuckDB Import</option>',
                '        </select>',
                '      </div>',
                '    </div>',
                '    <div class="history-list">',
            ])
            
            # Add history with filtering
            sync_type_filter = self.ui_state["filterSettings"]["history"]["syncType"]
            
            filtered_history = history_data
            
            # Apply sync type filter
            if sync_type_filter != "all":
                filtered_history = [h for h in filtered_history if h.get("type") == sync_type_filter]
            
            if filtered_history:
                for entry in filtered_history:
                    stats = entry.get("stats", {})
                    html.extend([
                        f'      <div class="history-item type-{entry.get("type", "unknown")}">',
                        f'        <div class="history-header">',
                        f'          <span class="history-type">{entry.get("type", "").replace("-", " to ").title()}</span>',
                        f'          <span class="history-timestamp">{datetime.fromtimestamp(entry.get("timestamp", 0)/1000).strftime("%Y-%m-%d %H:%M:%S")}</span>',
                        '        </div>',
                        '        <div class="history-stats">',
                        f'          <span class="stat-item">Processed: {stats.get("processed", 0)}</span>',
                        f'          <span class="stat-item">Updated: {stats.get("updated", 0)}</span>',
                        f'          <span class="stat-item">Conflicts: {stats.get("conflicts", 0)}</span>',
                        f'          <span class="stat-item">Errors: {stats.get("errors", 0)}</span>',
                        '        </div>',
                    ])
                    
                    # Add collections/tables if available
                    if "collections" in entry:
                        html.extend([
                            '        <div class="history-collections">',
                            '          <span class="collections-label">Collections:</span>',
                            f'          <span class="collections-value">{", ".join(entry["collections"])}</span>',
                            '        </div>',
                        ])
                    elif "tables" in entry:
                        html.extend([
                            '        <div class="history-tables">',
                            '          <span class="tables-label">Tables:</span>',
                            f'          <span class="tables-value">{", ".join(entry["tables"])}</span>',
                            '        </div>',
                        ])
                    
                    html.append('      </div>')  # Close history-item
                    
            else:
                html.append('      <div class="no-history">No history entries match the selected filters</div>')
            
            html.append('    </div>')  # Close history-list
            html.append('  </div>')    # Close history-tab
            
        # Footer with last updated time
        html.extend([
            '  <div class="panel-footer">',
            f'    <span class="last-updated">Last updated: {datetime.fromtimestamp(self.ui_state["lastUpdated"]/1000).strftime("%Y-%m-%d %H:%M:%S")}</span>',
            '    <button class="refresh-button">Refresh</button>',
            '  </div>',
            '</div>',  # Close database-sync-panel
        ])
        
        # Add custom CSS if provided
        if self.config["customCss"]:
            html.append(f'<style>{self.config["customCss"]}</style>')
        
        return "\n".join(html)
    
    def get_state(self):
        """
        Get current panel state
        
        Returns:
            dict: Current UI state
        """
        return {
            "activeTab": self.ui_state["activeTab"],
            "expandedSections": list(self.ui_state["expandedSections"]),
            "filterSettings": self.ui_state["filterSettings"],
            "lastUpdated": self.ui_state["lastUpdated"],
            "config": self.config
        }
    
    def set_state(self, state):
        """
        Set panel state
        
        Args:
            state (dict): State to set
            
        Returns:
            dict: Operation result
        """
        try:
            if "activeTab" in state:
                self.ui_state["activeTab"] = state["activeTab"]
            
            if "expandedSections" in state:
                self.ui_state["expandedSections"] = set(state["expandedSections"])
            
            if "filterSettings" in state:
                self.ui_state["filterSettings"] = state["filterSettings"]
            
            # Refresh UI with new state
            self.refresh_ui()
            
            return {"success": True, "message": "Panel state updated"}
        except Exception as e:
            logger.error(f"Error setting panel state: {str(e)}")
            return {"success": False, "message": f"Error setting panel state: {str(e)}"}
    
    async def close(self):
        """
        Clean up resources
        
        Returns:
            dict: Close result
        """
        try:
            # Stop auto-refresh
            self._stop_auto_refresh()
            
            # Unsubscribe from updates
            self._unsubscribe_from_updates()
            
            logger.info("Database sync status panel closed")
            return {"success": True, "message": "Database sync status panel closed"}
        except Exception as e:
            logger.error(f"Error closing database sync status panel: {str(e)}")
            return {"success": False, "message": f"Error closing database sync status panel: {str(e)}"}