"""
Error Monitor Status Panel

Provides a dashboard panel for visualizing error status, metrics, alerts, and trends.
Integrates with the Error Monitor to provide a comprehensive view of errors
across the application.
"""

import os
import time
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable

# Import the error monitor
from hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("error_monitor_status_panel")

class ErrorMonitorStatusPanel:
    """
    Dashboard panel for visualizing error monitoring status.
    
    Integrates with ErrorMonitor to show real-time error status,
    metrics, alerts, and trends.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the error monitor status panel
        
        Args:
            resources (dict): Shared resources (error_monitor, etc.)
            metadata (dict): Configuration metadata
        """
        # Set default values
        resources = resources or {}
        metadata = metadata or {}
        
        # Initialize resources
        self.resources = resources
        self.metadata = metadata
        
        # Verify required resources
        if not resources.get("error_monitor"):
            raise ValueError("ErrorMonitor resource is required for ErrorMonitorStatusPanel")
        
        # Configuration options
        self.config = {
            "refreshInterval": metadata.get("refreshInterval", 5000),  # Default: 5 seconds
            "errorsLimit": metadata.get("errorsLimit", 10),  # Show last 10 errors
            "alertsLimit": metadata.get("alertsLimit", 5),  # Show last 5 alerts
            "enableRealTimeUpdates": metadata.get("enableRealTimeUpdates", True),
            "enableMetricsCharts": metadata.get("enableMetricsCharts", True),
            "enableStatusIcons": metadata.get("enableStatusIcons", True),
            "enableAlertNotifications": metadata.get("enableAlertNotifications", True),
            "panelTitle": metadata.get("panelTitle", "Error Monitoring Status"),
            "customCss": metadata.get("customCss", ""),
            "theme": metadata.get("theme", "light")  # or "dark"
        }
        
        # UI state
        self.ui_state = {
            "lastUpdated": 0,
            "activeTab": "overview",  # "overview", "errors", "analytics", "component-status"
            "expandedSections": set(),
            "filterSettings": {
                "errors": {
                    "level": "all",  # "all", "error", "warning", "info", "debug"
                    "source": "all",  # "all", "python", "js-bridge", "electron", "ipfs", etc.
                    "component": "",  # Filter by component name (empty for all)
                    "resolved": "all",  # "all", "resolved", "unresolved"
                    "timeRange": "day"  # "hour", "day", "week", "month", "all"
                },
                "components": {
                    "status": "all",  # "all", "healthy", "warning", "degraded", "critical"
                    "source": "all"  # "all", or specific source
                }
            }
        }
        
        # Callbacks
        self.callbacks = {
            "onErrorAcknowledge": None,
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
            
            logger.info("Error monitor status panel initialized")
            return {"success": True, "message": "Error monitor status panel initialized"}
            
        except Exception as e:
            logger.error(f"Failed to initialize error monitor status panel: {str(e)}")
            raise ValueError(f"ErrorMonitorStatusPanel initialization failed: {str(e)}")
    
    def _subscribe_to_updates(self):
        """
        Subscribe to real-time updates from error monitor
        """
        error_mon = self.resources["error_monitor"]
        
        # Subscribe to alert updates
        if hasattr(error_mon, 'add_alert_handler'):
            error_mon.add_alert_handler(self._handle_alert_update)
            self.subscription_active = True
            logger.info("Subscribed to real-time error alerts")
    
    def _unsubscribe_from_updates(self):
        """
        Unsubscribe from real-time updates
        """
        if self.subscription_active:
            error_mon = self.resources["error_monitor"]
            
            # Unsubscribe from alert updates
            if hasattr(error_mon, 'add_alert_handler'):
                # Assuming there's a method to remove handlers
                if hasattr(error_mon, 'remove_alert_handler'):
                    error_mon.remove_alert_handler(self._handle_alert_update)
                
            self.subscription_active = False
            logger.info("Unsubscribed from real-time error updates")
    
    def _handle_alert_update(self, error, alert_reason):
        """
        Handle alert updates from error monitor
        
        Args:
            error: Error data
            alert_reason: Reason for the alert
        """
        # Update UI state
        self.ui_state["lastUpdated"] = int(time.time() * 1000)
        
        # Refresh UI with new data
        self.refresh_ui(update_type="alerts")
        
        # Trigger alert notification if enabled
        if self.config["enableAlertNotifications"]:
            self._trigger_alert_notification(error, alert_reason)
    
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
            # Get current data from error monitor
            error_mon = self.resources["error_monitor"]
            
            # Get data based on current tab or updated component
            if update_type in ["overview", "all"] or self.ui_state["activeTab"] == "overview":
                # Get component status for overview
                status_data = error_mon.get_component_status()
                # Get analytics for overview charts
                analytics_data = error_mon.get_analytics()
                # Get recent alerts
                alerts_data = error_mon.get_alerts(limit=self.config["alertsLimit"])
                
                self._update_overview_view(status_data, analytics_data, alerts_data)
            
            if update_type in ["errors", "all"] or self.ui_state["activeTab"] == "errors":
                # Apply the filters
                filters = self.ui_state["filterSettings"]["errors"]
                
                # Convert filter settings to parameters for get_errors
                level_filter = None
                if filters["level"] != "all":
                    try:
                        level_filter = ErrorLevel(filters["level"])
                    except (ValueError, KeyError):
                        pass
                    
                source_filter = None
                if filters["source"] != "all":
                    try:
                        source_filter = ErrorSource(filters["source"])
                    except (ValueError, KeyError):
                        pass
                
                component_filter = filters["component"] if filters["component"] else None
                
                resolved_filter = None
                if filters["resolved"] != "all":
                    resolved_filter = filters["resolved"] == "resolved"
                
                # Get filtered errors
                errors_data = error_mon.get_errors(
                    component=component_filter,
                    source=source_filter,
                    level=level_filter,
                    resolved=resolved_filter,
                    limit=self.config["errorsLimit"]
                )
                
                self._update_errors_view(errors_data)
            
            if update_type in ["analytics", "all"] or self.ui_state["activeTab"] == "analytics":
                analytics_data = error_mon.get_analytics()
                self._update_analytics_view(analytics_data)
            
            if update_type in ["component-status", "all"] or self.ui_state["activeTab"] == "component-status":
                # Apply the filters
                filters = self.ui_state["filterSettings"]["components"]
                
                # Get component status (filtered by source if needed)
                source_filter = None if filters["source"] == "all" else filters["source"]
                status_data = error_mon.get_component_status(source=source_filter)
                
                # Filter by status if needed
                if filters["status"] != "all":
                    status_data = {
                        k: v for k, v in status_data.items() 
                        if v.get("status") == filters["status"]
                    }
                
                self._update_component_status_view(status_data)
            
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
    
    def _update_overview_view(self, status_data, analytics_data, alerts_data):
        """
        Update the overview view with current data
        
        Args:
            status_data (dict): Current component status data
            analytics_data (dict): Current analytics data
            alerts_data (list): Current alerts data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the data
        logger.debug(f"Overview view updated with {len(status_data)} components")
    
    def _update_errors_view(self, errors_data):
        """
        Update the errors view with current data
        
        Args:
            errors_data (list): Current errors data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the errors data
        logger.debug(f"Errors view updated with {len(errors_data)} errors")
    
    def _update_analytics_view(self, analytics_data):
        """
        Update the analytics view with current data
        
        Args:
            analytics_data (dict): Current analytics data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the analytics data
        logger.debug(f"Analytics view updated")
    
    def _update_component_status_view(self, status_data):
        """
        Update the component status view with current data
        
        Args:
            status_data (dict): Current component status data
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the status data
        logger.debug(f"Component status view updated with {len(status_data)} components")
    
    def _update_timestamp_view(self):
        """
        Update the timestamp display in the UI
        """
        # Implementation depends on the UI framework being used
        # This method would update the DOM or UI component with the current timestamp
        logger.debug(f"Timestamp updated to {self.ui_state['lastUpdated']}")
    
    def _trigger_alert_notification(self, error, alert_reason):
        """
        Trigger a notification for a new alert
        
        Args:
            error: Error data
            alert_reason: Reason for the alert
        """
        # Implementation depends on the UI framework being used
        # This method would show a notification to the user
        logger.debug(f"Alert notification triggered: {alert_reason} - {error.message}")
    
    def set_active_tab(self, tab_name):
        """
        Set the active tab
        
        Args:
            tab_name (str): Name of tab to activate ('overview', 'errors', 'analytics', 'component-status')
            
        Returns:
            dict: Operation result
        """
        if tab_name not in ["overview", "errors", "analytics", "component-status"]:
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
            filter_type (str): Type of filter ('errors', 'components')
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
    
    def mark_error_resolved(self, error_id, notes=None):
        """
        Mark an error as resolved
        
        Args:
            error_id (str): ID of the error to resolve
            notes (str, optional): Optional notes about resolution
            
        Returns:
            dict: Operation result
        """
        error_mon = self.resources["error_monitor"]
        
        resolution_info = {
            "timestamp": datetime.now().isoformat(),
            "automatic": False,
            "notes": notes or "Manually resolved via dashboard"
        }
        
        result = asyncio.run(error_mon.mark_resolved(error_id, resolution_info))
        
        if result:
            # Refresh errors view
            self.refresh_ui(update_type="errors")
            # Also refresh overview and component status as they might include error counts
            self.refresh_ui(update_type="overview")
            self.refresh_ui(update_type="component-status")
        
        return {"success": result, "message": "Error marked as resolved" if result else "Failed to mark error as resolved"}
    
    def add_error_note(self, error_id, note):
        """
        Add a note to an error
        
        Args:
            error_id (str): ID of the error
            note (str): Note to add
            
        Returns:
            dict: Operation result
        """
        error_mon = self.resources["error_monitor"]
        result = asyncio.run(error_mon.add_note(error_id, note))
        
        if result:
            # Refresh errors view
            self.refresh_ui(update_type="errors")
        
        return {"success": result, "message": "Note added to error" if result else "Failed to add note to error"}
    
    def export_analytics(self, format_type="json"):
        """
        Export error analytics
        
        Args:
            format_type (str): Export format ('json', 'csv')
            
        Returns:
            dict: Operation result with export data
        """
        try:
            error_mon = self.resources["error_monitor"]
            analytics_data = error_mon.get_analytics()
            
            # Format based on requested type
            if format_type == "json":
                formatted_data = json.dumps(analytics_data, indent=2)
            elif format_type == "csv":
                # Simple CSV conversion for the summary
                rows = ["metric,value"]
                
                # Add summary data
                if "summary" in analytics_data:
                    summary = analytics_data["summary"]
                    rows.append(f"total_errors,{summary.get('total_errors', 0)}")
                    
                    # Add source breakdown
                    for src in summary.get('by_source', []):
                        rows.append(f"source_{src.get('source')},{src.get('count', 0)}")
                    
                    # Add component breakdown
                    for comp in summary.get('by_component', []):
                        rows.append(f"component_{comp.get('component')},{comp.get('count', 0)}")
                
                formatted_data = "\n".join(rows)
            else:
                return {"success": False, "message": f"Unsupported export format: {format_type}"}
            
            # Trigger onMetricsExport callback if registered
            if self.callbacks["onMetricsExport"]:
                self.callbacks["onMetricsExport"]({
                    "format": format_type,
                    "data": analytics_data,
                    "timestamp": int(time.time() * 1000)
                })
            
            return {
                "success": True,
                "message": f"Analytics exported as {format_type}",
                "data": formatted_data,
                "timestamp": int(time.time() * 1000)
            }
            
        except Exception as e:
            logger.error(f"Error exporting analytics: {str(e)}")
            return {"success": False, "message": f"Error exporting analytics: {str(e)}"}
    
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
        error_mon = self.resources["error_monitor"]
        
        # Get data for different tabs
        component_status = error_mon.get_component_status()
        analytics_data = error_mon.get_analytics()
        alerts_data = error_mon.get_alerts(limit=self.config["alertsLimit"])
        
        # Get filtered errors based on current filters
        filters = self.ui_state["filterSettings"]["errors"]
        
        # Convert filter settings to parameters for get_errors
        level_filter = None
        if filters["level"] != "all":
            try:
                level_filter = ErrorLevel(filters["level"])
            except (ValueError, KeyError):
                pass
            
        source_filter = None
        if filters["source"] != "all":
            try:
                source_filter = ErrorSource(filters["source"])
            except (ValueError, KeyError):
                pass
        
        component_filter = filters["component"] if filters["component"] else None
        
        resolved_filter = None
        if filters["resolved"] != "all":
            resolved_filter = filters["resolved"] == "resolved"
        
        # Get filtered errors
        errors_data = error_mon.get_errors(
            component=component_filter,
            source=source_filter,
            level=level_filter,
            resolved=resolved_filter,
            limit=self.config["errorsLimit"]
        )
        
        # Generate HTML (basic implementation - would be more sophisticated in real use)
        html = [
            f'<div class="error-monitor-panel {self.config["theme"]}-theme">',
            f'  <h2 class="panel-title">{self.config["panelTitle"]}</h2>',
            '  <div class="panel-tabs">',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "overview" else "")}" data-tab="overview">Overview</button>',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "errors" else "")}" data-tab="errors">Errors</button>',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "analytics" else "")}" data-tab="analytics">Analytics</button>',
            f'    <button class="tab-button {("active" if self.ui_state["activeTab"] == "component-status" else "")}" data-tab="component-status">Component Status</button>',
            '  </div>',
        ]
        
        # Overview tab content
        if self.ui_state["activeTab"] == "overview":
            html.extend([
                '  <div class="tab-content overview-tab">',
                '    <div class="summary-section">',
                '      <h3>Error Summary</h3>',
                '      <div class="summary-stats">',
            ])
            
            # Add summary stats
            if "summary" in analytics_data:
                summary = analytics_data["summary"]
                total_errors = summary.get("total_errors", 0)
                
                html.extend([
                    f'        <div class="stat-item">',
                    f'          <div class="stat-label">Total Errors</div>',
                    f'          <div class="stat-value">{total_errors}</div>',
                    f'        </div>',
                ])
                
                # Add error rates if available
                if "error_rates" in summary:
                    rates = summary["error_rates"]
                    html.extend([
                        f'        <div class="stat-item">',
                        f'          <div class="stat-label">Hourly Rate</div>',
                        f'          <div class="stat-value">{rates.get("hourly", 0)}</div>',
                        f'        </div>',
                        f'        <div class="stat-item">',
                        f'          <div class="stat-label">Daily Avg</div>',
                        f'          <div class="stat-value">{rates.get("daily_avg", 0):.1f}</div>',
                        f'        </div>',
                    ])
                
                # Add most active time if available
                if "most_active_time" in summary:
                    active_time = summary["most_active_time"]
                    if active_time.get("hour") is not None:
                        html.extend([
                            f'        <div class="stat-item">',
                            f'          <div class="stat-label">Peak Hour</div>',
                            f'          <div class="stat-value">{active_time.get("hour")}:00 ({active_time.get("count")} errors)</div>',
                            f'        </div>',
                        ])
            
            html.append('      </div>')  # Close summary-stats
            html.append('    </div>')    # Close summary-section
            
            # Add component status overview
            html.extend([
                '    <div class="component-status-section">',
                '      <h3>Component Status</h3>',
                '      <div class="status-grid">',
            ])
            
            # Count components by status
            status_counts = {"healthy": 0, "warning": 0, "degraded": 0, "critical": 0, "unknown": 0}
            for component, status in component_status.items():
                component_status_value = status.get("status", "unknown")
                if component_status_value in status_counts:
                    status_counts[component_status_value] += 1
                else:
                    status_counts["unknown"] += 1
            
            # Add status cards
            html.extend([
                f'        <div class="status-card status-healthy">',
                f'          <div class="status-title">Healthy</div>',
                f'          <div class="status-count">{status_counts["healthy"]}</div>',
                f'        </div>',
                f'        <div class="status-card status-warning">',
                f'          <div class="status-title">Warning</div>',
                f'          <div class="status-count">{status_counts["warning"]}</div>',
                f'        </div>',
                f'        <div class="status-card status-degraded">',
                f'          <div class="status-title">Degraded</div>',
                f'          <div class="status-count">{status_counts["degraded"]}</div>',
                f'        </div>',
                f'        <div class="status-card status-critical">',
                f'          <div class="status-title">Critical</div>',
                f'          <div class="status-count">{status_counts["critical"]}</div>',
                f'        </div>',
            ])
            
            html.append('      </div>')  # Close status-grid
            html.append('    </div>')    # Close component-status-section
            
            # Add recent alerts section
            html.extend([
                '    <div class="recent-alerts-section">',
                '      <h3>Recent Alerts</h3>',
                '      <div class="alerts-list">',
            ])
            
            if alerts_data:
                for alert in alerts_data:
                    html.extend([
                        f'        <div class="alert-item {alert.get("error_level", "info").lower()}">',
                        f'          <div class="alert-header">',
                        f'            <span class="alert-severity">{alert.get("error_level", "").upper()}</span>',
                        f'            <span class="alert-component">{alert.get("component", "")}</span>',
                        f'            <span class="alert-timestamp">{datetime.fromisoformat(alert.get("timestamp", datetime.now().isoformat())).strftime("%Y-%m-%d %H:%M:%S")}</span>',
                        f'          </div>',
                        f'          <div class="alert-message">{alert.get("message", "")}</div>',
                        f'        </div>',
                    ])
            else:
                html.append('        <div class="no-alerts">No recent alerts</div>')
            
            html.append('      </div>')  # Close alerts-list
            html.append('    </div>')    # Close recent-alerts-section
            
            html.append('  </div>')      # Close overview-tab
        
        # Errors tab content
        elif self.ui_state["activeTab"] == "errors":
            html.extend([
                '  <div class="tab-content errors-tab">',
                '    <div class="filters-bar">',
                '      <div class="filter-group">',
                '        <label>Level:</label>',
                '        <select class="filter-select" data-filter-type="errors" data-filter-name="level">',
                f'          <option value="all" {("selected" if filters["level"] == "all" else "")}>All</option>',
                f'          <option value="fatal" {("selected" if filters["level"] == "fatal" else "")}>Fatal</option>',
                f'          <option value="error" {("selected" if filters["level"] == "error" else "")}>Error</option>',
                f'          <option value="warning" {("selected" if filters["level"] == "warning" else "")}>Warning</option>',
                f'          <option value="info" {("selected" if filters["level"] == "info" else "")}>Info</option>',
                f'          <option value="debug" {("selected" if filters["level"] == "debug" else "")}>Debug</option>',
                '        </select>',
                '      </div>',
                '      <div class="filter-group">',
                '        <label>Source:</label>',
                '        <select class="filter-select" data-filter-type="errors" data-filter-name="source">',
                f'          <option value="all" {("selected" if filters["source"] == "all" else "")}>All</option>',
            ])
            
            # Add source options dynamically from ErrorSource enum
            for source in ErrorSource:
                html.append(f'          <option value="{source.value}" {("selected" if filters["source"] == source.value else "")}>{source.value.title()}</option>')
            
            html.extend([
                '        </select>',
                '      </div>',
                '      <div class="filter-group">',
                '        <label>Component:</label>',
                '        <input type="text" class="filter-input" data-filter-type="errors" data-filter-name="component" ',
                f'               value="{filters["component"]}" placeholder="Filter by component">',
                '      </div>',
                '      <div class="filter-group">',
                '        <label>Status:</label>',
                '        <select class="filter-select" data-filter-type="errors" data-filter-name="resolved">',
                f'          <option value="all" {("selected" if filters["resolved"] == "all" else "")}>All</option>',
                f'          <option value="resolved" {("selected" if filters["resolved"] == "resolved" else "")}>Resolved</option>',
                f'          <option value="unresolved" {("selected" if filters["resolved"] == "unresolved" else "")}>Unresolved</option>',
                '        </select>',
                '      </div>',
                '      <div class="filter-group">',
                '        <label>Time Range:</label>',
                '        <select class="filter-select" data-filter-type="errors" data-filter-name="timeRange">',
                f'          <option value="hour" {("selected" if filters["timeRange"] == "hour" else "")}>Last Hour</option>',
                f'          <option value="day" {("selected" if filters["timeRange"] == "day" else "")}>Last Day</option>',
                f'          <option value="week" {("selected" if filters["timeRange"] == "week" else "")}>Last Week</option>',
                f'          <option value="month" {("selected" if filters["timeRange"] == "month" else "")}>Last Month</option>',
                f'          <option value="all" {("selected" if filters["timeRange"] == "all" else "")}>All Time</option>',
                '        </select>',
                '      </div>',
                '    </div>',  # Close filters-bar
                '    <div class="errors-list">',
            ])
            
            if errors_data:
                for error in errors_data:
                    # Convert from ErrorData object to dict representation if needed
                    if hasattr(error, 'to_dict'):
                        error_dict = error.to_dict()
                    else:
                        error_dict = error
                    
                    html.extend([
                        f'      <div class="error-item {error_dict.get("level", "error").lower()} {("resolved" if error_dict.get("resolved", False) else "unresolved")}">',
                        f'        <div class="error-header">',
                        f'          <span class="error-level">{error_dict.get("level", "").upper()}</span>',
                        f'          <span class="error-component">{error_dict.get("component", "")}</span>',
                        f'          <span class="error-source">{error_dict.get("source", "").title()}</span>',
                        f'          <span class="error-timestamp">{datetime.fromisoformat(error_dict.get("timestamp", datetime.now().isoformat())).strftime("%Y-%m-%d %H:%M:%S")}</span>',
                        f'        </div>',
                        f'        <div class="error-message">{error_dict.get("message", "")}</div>',
                        f'        <div class="error-operation"><strong>Operation:</strong> {error_dict.get("operation", "")}</div>',
                    ])
                    
                    # Add resolution info if resolved
                    if error_dict.get("resolved", False) and error_dict.get("resolution_info"):
                        res_info = error_dict.get("resolution_info", {})
                        html.extend([
                            f'        <div class="error-resolution">',
                            f'          <span class="resolution-label">Resolved:</span>',
                            f'          <span class="resolution-timestamp">{datetime.fromisoformat(res_info.get("timestamp", datetime.now().isoformat())).strftime("%Y-%m-%d %H:%M:%S")}</span>',
                            f'          <span class="resolution-method">{"Automatic" if res_info.get("automatic", False) else "Manual"}</span>',
                            f'          {f"<span class=\"resolution-notes\">{res_info.get("notes", "")}</span>" if res_info.get("notes") else ""}',
                            f'        </div>',
                        ])
                    
                    # Add actions for unresolved errors
                    if not error_dict.get("resolved", False):
                        html.extend([
                            f'        <div class="error-actions">',
                            f'          <button class="resolve-button" data-error-id="{error_dict.get("id", "")}">Mark Resolved</button>',
                            f'          <button class="add-note-button" data-error-id="{error_dict.get("id", "")}">Add Note</button>',
                            f'        </div>',
                        ])
                    
                    # Add stack trace toggle if available
                    if error_dict.get("stack_trace"):
                        trace_id = f"trace-{error_dict.get('id', '')}"
                        html.extend([
                            f'        <div class="error-stack-trace-toggle">',
                            f'          <a href="#" onclick="document.getElementById(\'{trace_id}\').style.display = document.getElementById(\'{trace_id}\').style.display === \'none\' ? \'block\' : \'none\'; return false;">Toggle Stack Trace</a>',
                            f'        </div>',
                            f'        <pre class="error-stack-trace" id="{trace_id}" style="display: none;">{error_dict.get("stack_trace", "")}</pre>',
                        ])
                    
                    html.append('      </div>')  # Close error-item
            else:
                html.append('      <div class="no-errors">No errors match the selected filters</div>')
            
            html.append('    </div>')  # Close errors-list
            html.append('  </div>')    # Close errors-tab
        
        # Analytics tab content
        elif self.ui_state["activeTab"] == "analytics":
            html.extend([
                '  <div class="tab-content analytics-tab">',
                '    <div class="analytics-controls">',
                '      <div class="export-section">',
                '        <button class="export-button" data-format="json">Export as JSON</button>',
                '        <button class="export-button" data-format="csv">Export as CSV</button>',
                '      </div>',
                '    </div>',
                '    <div class="error-distribution-section">',
                '      <h3>Error Distribution</h3>',
                '      <div class="distribution-charts">',
                '        <div class="chart-container">',
                '          <h4>By Source</h4>',
                '          <div class="chart-visualization">',
            ])
            
            # Add source distribution chart
            if "summary" in analytics_data and "by_source" in analytics_data["summary"]:
                by_source = analytics_data["summary"]["by_source"]
                for src in by_source:
                    percent = min(100, src.get("count", 0) / max(1, analytics_data["summary"].get("total_errors", 1)) * 100)
                    html.extend([
                        f'            <div class="chart-bar">',
                        f'              <div class="bar-label">{src.get("source", "").title()}</div>',
                        f'              <div class="bar-value" style="width: {percent}%;">{src.get("count", 0)}</div>',
                        f'            </div>',
                    ])
            
            html.extend([
                '          </div>',
                '        </div>',
                '        <div class="chart-container">',
                '          <h4>By Component</h4>',
                '          <div class="chart-visualization">',
            ])
            
            # Add component distribution chart
            if "summary" in analytics_data and "by_component" in analytics_data["summary"]:
                by_component = analytics_data["summary"]["by_component"]
                for comp in by_component:
                    percent = min(100, comp.get("count", 0) / max(1, analytics_data["summary"].get("total_errors", 1)) * 100)
                    html.extend([
                        f'            <div class="chart-bar">',
                        f'              <div class="bar-label">{comp.get("component", "")}</div>',
                        f'              <div class="bar-value" style="width: {percent}%;">{comp.get("count", 0)}</div>',
                        f'            </div>',
                    ])
            
            html.extend([
                '          </div>',
                '        </div>',
                '      </div>',
                '    </div>',
            ])
            
            # Add top errors section
            html.extend([
                '    <div class="top-errors-section">',
                '      <h3>Top Errors</h3>',
                '      <div class="top-errors-list">',
            ])
            
            if "summary" in analytics_data and "top_errors" in analytics_data["summary"]:
                top_errors = analytics_data["summary"]["top_errors"]
                for idx, err in enumerate(top_errors):
                    html.extend([
                        f'        <div class="top-error-item">',
                        f'          <div class="error-rank">#{idx+1}</div>',
                        f'          <div class="error-message">{err.get("message", "")}</div>',
                        f'          <div class="error-count">{err.get("count", 0)}</div>',
                        f'        </div>',
                    ])
            else:
                html.append('        <div class="no-errors">No error data available</div>')
            
            html.append('      </div>')  # Close top-errors-list
            html.append('    </div>')    # Close top-errors-section
            
            # Add recovery stats section if available
            if "recovery_stats" in analytics_data:
                recovery_stats = analytics_data["recovery_stats"]
                html.extend([
                    '    <div class="recovery-stats-section">',
                    '      <h3>Recovery Statistics</h3>',
                    '      <div class="recovery-summary">',
                    f'        <div class="stat-item">',
                    f'          <div class="stat-label">Total Attempts</div>',
                    f'          <div class="stat-value">{recovery_stats.get("attempts", 0)}</div>',
                    f'        </div>',
                    f'        <div class="stat-item">',
                    f'          <div class="stat-label">Successful</div>',
                    f'          <div class="stat-value">{recovery_stats.get("successes", 0)}</div>',
                    f'        </div>',
                    f'        <div class="stat-item">',
                    f'          <div class="stat-label">Failed</div>',
                    f'          <div class="stat-value">{recovery_stats.get("failures", 0)}</div>',
                    f'        </div>',
                    '      </div>',
                ])
                
                # Add recovery by strategy if available
                if "by_strategy" in recovery_stats:
                    by_strategy = recovery_stats["by_strategy"]
                    html.extend([
                        '      <h4>Recovery by Strategy</h4>',
                        '      <div class="strategies-list">',
                    ])
                    
                    for strategy_name, stats in by_strategy.items():
                        success_rate = stats.get("successes", 0) / max(1, stats.get("attempts", 1)) * 100
                        html.extend([
                            f'        <div class="strategy-item">',
                            f'          <div class="strategy-name">{strategy_name}</div>',
                            f'          <div class="strategy-stats">',
                            f'            <span>Attempts: {stats.get("attempts", 0)}</span>',
                            f'            <span>Success Rate: {success_rate:.1f}%</span>',
                            f'          </div>',
                            f'        </div>',
                        ])
                    
                    html.append('      </div>')  # Close strategies-list
                
                html.append('    </div>')  # Close recovery-stats-section
            
            html.append('  </div>')  # Close analytics-tab
        
        # Component Status tab content
        elif self.ui_state["activeTab"] == "component-status":
            # Get filters for components
            component_filters = self.ui_state["filterSettings"]["components"]
            
            html.extend([
                '  <div class="tab-content component-status-tab">',
                '    <div class="filters-bar">',
                '      <div class="filter-group">',
                '        <label>Status:</label>',
                '        <select class="filter-select" data-filter-type="components" data-filter-name="status">',
                f'          <option value="all" {("selected" if component_filters["status"] == "all" else "")}>All</option>',
                f'          <option value="healthy" {("selected" if component_filters["status"] == "healthy" else "")}>Healthy</option>',
                f'          <option value="warning" {("selected" if component_filters["status"] == "warning" else "")}>Warning</option>',
                f'          <option value="degraded" {("selected" if component_filters["status"] == "degraded" else "")}>Degraded</option>',
                f'          <option value="critical" {("selected" if component_filters["status"] == "critical" else "")}>Critical</option>',
                '        </select>',
                '      </div>',
                '      <div class="filter-group">',
                '        <label>Source:</label>',
                '        <select class="filter-select" data-filter-type="components" data-filter-name="source">',
                f'          <option value="all" {("selected" if component_filters["source"] == "all" else "")}>All</option>',
            ])
            
            # Add source options dynamically from ErrorSource enum
            for source in ErrorSource:
                html.append(f'          <option value="{source.value}" {("selected" if component_filters["source"] == source.value else "")}>{source.value.title()}</option>')
            
            html.extend([
                '        </select>',
                '      </div>',
                '    </div>',  # Close filters-bar
                '    <div class="components-list">',
            ])
            
            if component_status:
                for component_key, status in component_status.items():
                    # Parse the component key (source:component)
                    parts = component_key.split(":", 1)
                    source = parts[0] if len(parts) > 0 else "unknown"
                    component = parts[1] if len(parts) > 1 else component_key
                    
                    html.extend([
                        f'      <div class="component-item status-{status.get("status", "unknown")}">',
                        f'        <div class="component-header">',
                        f'          <div class="component-name">{component}</div>',
                        f'          <div class="component-source">{source}</div>',
                        f'          <div class="component-status">{status.get("status", "unknown").upper()}</div>',
                        f'        </div>',
                        f'        <div class="component-details">',
                        f'          <div class="detail-item">',
                        f'            <span class="detail-label">Error Count:</span>',
                        f'            <span class="detail-value">{status.get("error_count", 0)}</span>',
                        f'          </div>',
                        f'          <div class="detail-item">',
                        f'            <span class="detail-label">Last Updated:</span>',
                        f'            <span class="detail-value">{datetime.fromisoformat(status.get("last_updated", datetime.now().isoformat())).strftime("%Y-%m-%d %H:%M:%S")}</span>',
                        f'          </div>',
                        f'        </div>',
                        f'      </div>',
                    ])
            else:
                html.append('      <div class="no-components">No components match the selected filters</div>')
            
            html.append('    </div>')  # Close components-list
            html.append('  </div>')    # Close component-status-tab
            
        # Footer with last updated time
        html.extend([
            '  <div class="panel-footer">',
            f'    <span class="last-updated">Last updated: {datetime.fromtimestamp(self.ui_state["lastUpdated"]/1000).strftime("%Y-%m-%d %H:%M:%S")}</span>',
            '    <button class="refresh-button">Refresh</button>',
            '  </div>',
            '</div>',  # Close error-monitor-panel
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
            
            logger.info("Error monitor status panel closed")
            return {"success": True, "message": "Error monitor status panel closed"}
        except Exception as e:
            logger.error(f"Error closing error monitor status panel: {str(e)}")
            return {"success": False, "message": f"Error closing error monitor status panel: {str(e)}"}