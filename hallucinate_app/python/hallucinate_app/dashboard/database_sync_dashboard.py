"""
Database Synchronization Dashboard

Integrates DatabaseSyncMonitor and DatabaseSyncStatusPanel to provide
a comprehensive dashboard for monitoring database synchronization.
"""

import os
import json
import time
import asyncio
import logging
from typing import Dict, List, Any, Optional, Callable
from pathlib import Path
from datetime import datetime

# Import the components
from hallucinate_app.database_sync_monitor import DatabaseSyncMonitor, SYNC_STATUS, ALERT_SEVERITY
from hallucinate_app.dashboard.database_sync_status_panel import DatabaseSyncStatusPanel

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_sync_dashboard")

class DatabaseSyncDashboard:
    """
    Comprehensive dashboard for database synchronization monitoring.
    
    Integrates the DatabaseSyncMonitor and DatabaseSyncStatusPanel components
    to provide a complete monitoring solution.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the dashboard with resources and metadata
        
        Args:
            resources (dict): Shared resources (syncManager, threadPool, etc.)
            metadata (dict): Configuration metadata
        """
        # Set default values
        resources = resources or {}
        metadata = metadata or {}
        
        # Initialize resources
        self.resources = resources
        self.metadata = metadata
        
        # Verify required resources
        if not resources.get("syncManager"):
            raise ValueError("SyncManager resource is required for DatabaseSyncDashboard")
        
        # Optional thread pool for parallel processing
        self.thread_pool = resources.get("threadPool")
        
        # Configuration options
        home_dir = os.path.expanduser("~")
        self.config = {
            "dashboardDir": metadata.get("dashboardDir", os.path.join(home_dir, ".hallucinate_app", "dashboard")),
            "enableServer": metadata.get("enableServer", True),
            "serverPort": metadata.get("serverPort", 8080),
            "autoStart": metadata.get("autoStart", True),
            "theme": metadata.get("theme", "light"),  # or "dark"
            "defaultTab": metadata.get("defaultTab", "status"),
            "refreshInterval": metadata.get("refreshInterval", 5000),  # 5 seconds
            "webSocketEnabled": metadata.get("webSocketEnabled", True),
            "authentication": metadata.get("authentication", False),
            "sslEnabled": metadata.get("sslEnabled", False),
            "sslCert": metadata.get("sslCert", ""),
            "sslKey": metadata.get("sslKey", ""),
            "persistState": metadata.get("persistState", True),
        }
        
        # Initialize components
        self.monitor = None
        self.panel = None
        
        # Server state
        self.server = None
        self.running = False
        
        # Dashboard state
        self.dashboard_state = {
            "startTime": 0,
            "clientConnections": 0,
            "activePanels": set(),
            "lastUpdated": 0,
        }
    
    async def init(self):
        """
        Initialize the dashboard
        
        Returns:
            dict: Initialization result
        """
        try:
            # Create dashboard directory if it doesn't exist
            os.makedirs(self.config["dashboardDir"], exist_ok=True)
            
            # Initialize the database sync monitor
            monitor_resources = {
                "syncManager": self.resources["syncManager"],
                "threadPool": self.thread_pool
            }
            
            monitor_metadata = {
                "monitorDir": os.path.join(self.config["dashboardDir"], "monitor"),
                "metricsInterval": 60,  # 60 seconds for metrics collection
                "alertThresholds": {
                    "syncFailureCount": 3,  # Alert after 3 sync failures
                    "syncDelayMinutes": 30,  # Alert if sync is delayed by 30 minutes
                    "conflictRateThreshold": 0.1,  # Alert if >10% of docs have conflicts
                    "highErrorRateThreshold": 0.05,  # Alert if >5% of operations have errors
                },
                "retentionDays": 14,  # 14 days data retention
                "enableAlerts": True,
                "enableDashboard": True,
                "enableMetricsCollection": True,
                "enableRealTimeUpdates": True,
            }
            
            self.monitor = DatabaseSyncMonitor(
                resources=monitor_resources,
                metadata=monitor_metadata
            )
            
            # Initialize the monitor
            monitor_result = await self.monitor.init()
            if not monitor_result["success"]:
                raise ValueError(f"Failed to initialize monitor: {monitor_result['message']}")
            
            # Initialize the status panel
            panel_resources = {
                "syncMonitor": self.monitor
            }
            
            panel_metadata = {
                "refreshInterval": self.config["refreshInterval"],
                "alertsLimit": 5,  # Show last 5 alerts
                "historyLimit": 10,  # Show last 10 sync events
                "enableRealTimeUpdates": True,
                "enableMetricsCharts": True,
                "enableStatusIcons": True,
                "enableAlertNotifications": True,
                "panelTitle": "Database Synchronization Status",
                "theme": self.config["theme"]
            }
            
            self.panel = DatabaseSyncStatusPanel(
                resources=panel_resources,
                metadata=panel_metadata
            )
            
            # Initialize the panel
            panel_result = await self.panel.init()
            if not panel_result["success"]:
                raise ValueError(f"Failed to initialize panel: {panel_result['message']}")
            
            # Set the default tab
            self.panel.set_active_tab(self.config["defaultTab"])
            
            # Start the server if enabled
            if self.config["enableServer"] and self.config["autoStart"]:
                await self.start_server()
            
            # Update dashboard state
            self.dashboard_state["startTime"] = int(time.time() * 1000)
            self.dashboard_state["lastUpdated"] = int(time.time() * 1000)
            self.dashboard_state["activePanels"].add("database-sync-status")
            
            # Load persisted state if enabled
            if self.config["persistState"]:
                await self._load_dashboard_state()
            
            logger.info("Database sync dashboard initialized")
            return {"success": True, "message": "Database sync dashboard initialized"}
            
        except Exception as e:
            logger.error(f"Failed to initialize database sync dashboard: {str(e)}")
            raise ValueError(f"DatabaseSyncDashboard initialization failed: {str(e)}")
    
    async def start_server(self):
        """
        Start the dashboard server
        
        Returns:
            dict: Start result
        """
        if self.server:
            return {"success": False, "message": "Server already running"}
        
        try:
            # This is a placeholder for server implementation
            # In a real implementation, this would start a web server
            # or WebSocket server for the dashboard
            
            # For now, just set the state
            self.running = True
            
            logger.info(f"Dashboard server started on port {self.config['serverPort']}")
            return {
                "success": True, 
                "message": f"Dashboard server started on port {self.config['serverPort']}",
                "port": self.config["serverPort"],
                "url": f"http{'s' if self.config['sslEnabled'] else ''}://localhost:{self.config['serverPort']}"
            }
            
        except Exception as e:
            logger.error(f"Failed to start dashboard server: {str(e)}")
            return {"success": False, "message": f"Failed to start dashboard server: {str(e)}"}
    
    async def stop_server(self):
        """
        Stop the dashboard server
        
        Returns:
            dict: Stop result
        """
        if not self.running:
            return {"success": False, "message": "Server not running"}
        
        try:
            # This is a placeholder for server implementation
            # In a real implementation, this would stop the web server
            
            # For now, just set the state
            self.running = False
            self.server = None
            
            logger.info("Dashboard server stopped")
            return {"success": True, "message": "Dashboard server stopped"}
            
        except Exception as e:
            logger.error(f"Failed to stop dashboard server: {str(e)}")
            return {"success": False, "message": f"Failed to stop dashboard server: {str(e)}"}
    
    async def refresh_dashboard(self):
        """
        Refresh the dashboard data
        
        Returns:
            dict: Refresh result
        """
        try:
            # Update the panel with the latest data
            self.panel.refresh_ui()
            
            # Update dashboard state
            self.dashboard_state["lastUpdated"] = int(time.time() * 1000)
            
            return {"success": True, "message": "Dashboard refreshed"}
            
        except Exception as e:
            logger.error(f"Failed to refresh dashboard: {str(e)}")
            return {"success": False, "message": f"Failed to refresh dashboard: {str(e)}"}
    
    def get_dashboard_html(self):
        """
        Get the HTML for the dashboard
        
        Returns:
            str: Dashboard HTML
        """
        try:
            # Get the panel HTML
            panel_html = self.panel.get_panel_html()
            
            # Create the dashboard HTML
            dashboard_html = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Database Synchronization Dashboard</title>
                <style>
                    /* Base styles */
                    body {{
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        background-color: {"#2a2a2a" if self.config["theme"] == "dark" else "#f5f5f5"};
                        color: {"#f0f0f0" if self.config["theme"] == "dark" else "#333"};
                    }}
                    
                    .dashboard-container {{
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 20px;
                    }}
                    
                    .dashboard-header {{
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid {"#444" if self.config["theme"] == "dark" else "#ddd"};
                    }}
                    
                    .dashboard-title {{
                        font-size: 24px;
                        font-weight: bold;
                    }}
                    
                    .dashboard-info {{
                        display: flex;
                        gap: 15px;
                        font-size: 14px;
                    }}
                    
                    .dashboard-controls {{
                        margin-bottom: 20px;
                    }}
                    
                    .refresh-button {{
                        padding: 8px 15px;
                        background-color: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }}
                    
                    .refresh-button:hover {{
                        background-color: #45a049;
                    }}
                    
                    .settings-button {{
                        padding: 8px 15px;
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-left: 10px;
                    }}
                    
                    .settings-button:hover {{
                        background-color: #0b7dda;
                    }}
                    
                    .dashboard-panels {{
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 20px;
                    }}
                    
                    .dashboard-footer {{
                        margin-top: 20px;
                        padding-top: 10px;
                        border-top: 1px solid {"#444" if self.config["theme"] == "dark" else "#ddd"};
                        display: flex;
                        justify-content: space-between;
                        font-size: 12px;
                        color: {"#aaa" if self.config["theme"] == "dark" else "#777"};
                    }}
                    
                    /* Status panel styles provided by panel component */
                    {self.panel.config.get("customCss", "")}
                </style>
            </head>
            <body>
                <div class="dashboard-container">
                    <div class="dashboard-header">
                        <div class="dashboard-title">Database Synchronization Dashboard</div>
                        <div class="dashboard-info">
                            <div class="dashboard-uptime">Uptime: <span id="uptime">{self._format_duration(int(time.time() * 1000) - self.dashboard_state["startTime"])}</span></div>
                            <div class="dashboard-connections">Connections: <span id="connections">{self.dashboard_state["clientConnections"]}</span></div>
                            <div class="dashboard-updated">Last updated: <span id="last-updated">{datetime.fromtimestamp(self.dashboard_state["lastUpdated"]/1000).strftime("%Y-%m-%d %H:%M:%S")}</span></div>
                        </div>
                    </div>
                    <div class="dashboard-controls">
                        <button class="refresh-button" id="refresh-button">Refresh Dashboard</button>
                        <button class="settings-button" id="settings-button">Settings</button>
                    </div>
                    <div class="dashboard-panels">
                        <div class="panel database-sync-panel">
                            {panel_html}
                        </div>
                    </div>
                    <div class="dashboard-footer">
                        <div class="footer-info">Database Synchronization Dashboard</div>
                        <div class="footer-version">Version 1.0.0</div>
                    </div>
                </div>
                
                <script>
                    // Simple dashboard script
                    document.addEventListener('DOMContentLoaded', function() {{
                        // Refresh button
                        document.getElementById('refresh-button').addEventListener('click', function() {{
                            window.location.reload();
                        }});
                        
                        // Settings button
                        document.getElementById('settings-button').addEventListener('click', function() {{
                            alert('Settings functionality would be implemented here.');
                        }});
                        
                        // Tab buttons
                        document.querySelectorAll('.tab-button').forEach(function(button) {{
                            button.addEventListener('click', function() {{
                                // Get tab name
                                const tabName = this.getAttribute('data-tab');
                                
                                // Update active tab
                                document.querySelectorAll('.tab-button').forEach(function(btn) {{
                                    btn.classList.remove('active');
                                }});
                                this.classList.add('active');
                                
                                // Show corresponding tab content
                                document.querySelectorAll('.tab-content').forEach(function(content) {{
                                    content.style.display = 'none';
                                }});
                                document.querySelector('.' + tabName + '-tab').style.display = 'block';
                            }});
                        }});
                        
                        // Initial tab activation
                        const activeTab = document.querySelector('.tab-button.active') || document.querySelector('.tab-button');
                        if (activeTab) {{
                            activeTab.click();
                        }}
                        
                        // Filter selects
                        document.querySelectorAll('.filter-select').forEach(function(select) {{
                            select.addEventListener('change', function() {{
                                // In a real implementation, this would use AJAX to update the content
                                console.log('Filter changed:', this.getAttribute('data-filter-type'), this.getAttribute('data-filter-name'), this.value);
                            }});
                        }});
                        
                        // Acknowledge buttons
                        document.querySelectorAll('.acknowledge-button').forEach(function(button) {{
                            button.addEventListener('click', function() {{
                                const alertId = this.getAttribute('data-alert-id');
                                // In a real implementation, this would use AJAX to acknowledge the alert
                                console.log('Acknowledge alert:', alertId);
                                this.parentNode.innerHTML = '<span class="acknowledged-label">Acknowledged</span>';
                            }});
                        }});
                        
                        // Export buttons
                        document.querySelectorAll('.export-button').forEach(function(button) {{
                            button.addEventListener('click', function() {{
                                const format = this.getAttribute('data-format');
                                // In a real implementation, this would trigger a download
                                console.log('Export metrics as:', format);
                                alert('Metrics would be exported as ' + format);
                            }});
                        }});
                        
                        // Auto-refresh timer
                        const refreshInterval = {self.config["refreshInterval"]};
                        if (refreshInterval > 0) {{
                            setInterval(function() {{
                                // In a real implementation, this would use AJAX to update content
                                document.getElementById('last-updated').textContent = new Date().toLocaleString();
                            }}, refreshInterval);
                        }}
                    }});
                </script>
            </body>
            </html>
            """
            
            return dashboard_html
            
        except Exception as e:
            logger.error(f"Failed to generate dashboard HTML: {str(e)}")
            return f"<html><body><h1>Error</h1><p>{str(e)}</p></body></html>"
    
    def get_dashboard_state(self):
        """
        Get current dashboard state
        
        Returns:
            dict: Dashboard state
        """
        # Get monitor state
        monitor_state = {
            "syncStatus": self.monitor.get_sync_status(),
            "metrics": self.monitor.get_sync_metrics(),
            "alerts": self.monitor.get_recent_alerts(5),
            "activeJobs": self.monitor.get_active_jobs()
        }
        
        # Get panel state
        panel_state = self.panel.get_state()
        
        # Combine with dashboard state
        dashboard_state = {
            "monitor": monitor_state,
            "panel": panel_state,
            "dashboard": {
                "startTime": self.dashboard_state["startTime"],
                "uptime": int(time.time() * 1000) - self.dashboard_state["startTime"],
                "clientConnections": self.dashboard_state["clientConnections"],
                "activePanels": list(self.dashboard_state["activePanels"]),
                "lastUpdated": self.dashboard_state["lastUpdated"],
                "serverRunning": self.running,
                "serverPort": self.config["serverPort"] if self.running else None,
                "theme": self.config["theme"],
                "refreshInterval": self.config["refreshInterval"]
            }
        }
        
        return dashboard_state
    
    async def _save_dashboard_state(self):
        """
        Save dashboard state to disk
        """
        if not self.config["persistState"]:
            return
        
        try:
            # Get state to save
            state = {
                "panel": self.panel.get_state(),
                "dashboard": {
                    "theme": self.config["theme"],
                    "defaultTab": self.config["defaultTab"],
                    "refreshInterval": self.config["refreshInterval"],
                    "lastStartTime": self.dashboard_state["startTime"],
                    "lastUpdated": int(time.time() * 1000)
                }
            }
            
            # Save to file
            state_path = os.path.join(self.config["dashboardDir"], "dashboard_state.json")
            with open(state_path, "w") as f:
                json.dump(state, f, indent=2)
                
            logger.debug("Dashboard state saved")
            
        except Exception as e:
            logger.error(f"Failed to save dashboard state: {str(e)}")
    
    async def _load_dashboard_state(self):
        """
        Load dashboard state from disk
        """
        try:
            state_path = os.path.join(self.config["dashboardDir"], "dashboard_state.json")
            
            if not os.path.exists(state_path):
                logger.debug("No saved dashboard state found")
                return
            
            with open(state_path, "r") as f:
                state = json.load(f)
            
            # Restore panel state
            if "panel" in state:
                self.panel.set_state(state["panel"])
            
            # Restore dashboard configuration
            if "dashboard" in state:
                dashboard = state["dashboard"]
                
                if "theme" in dashboard:
                    self.config["theme"] = dashboard["theme"]
                
                if "defaultTab" in dashboard:
                    self.config["defaultTab"] = dashboard["defaultTab"]
                
                if "refreshInterval" in dashboard:
                    self.config["refreshInterval"] = dashboard["refreshInterval"]
                
                logger.debug("Dashboard state loaded")
                
        except Exception as e:
            logger.error(f"Failed to load dashboard state: {str(e)}")
    
    def _format_duration(self, ms):
        """
        Format a duration in milliseconds as a human-readable string
        
        Args:
            ms (int): Duration in milliseconds
            
        Returns:
            str: Formatted duration
        """
        seconds = ms // 1000
        minutes = seconds // 60
        hours = minutes // 60
        days = hours // 24
        
        if days > 0:
            return f"{days}d {hours % 24}h {minutes % 60}m"
        elif hours > 0:
            return f"{hours}h {minutes % 60}m {seconds % 60}s"
        elif minutes > 0:
            return f"{minutes}m {seconds % 60}s"
        else:
            return f"{seconds}s"
    
    async def test(self):
        """
        Test dashboard functionality
        
        Returns:
            dict: Test results
        """
        try:
            # Test monitor
            monitor_result = await self.monitor.test()
            
            # Generate dashboard HTML
            dashboard_html = self.get_dashboard_html()
            html_size = len(dashboard_html)
            
            # Get dashboard state
            state = self.get_dashboard_state()
            
            return {
                "success": True,
                "message": "Database sync dashboard test completed successfully",
                "results": {
                    "monitorTest": monitor_result,
                    "htmlGenerated": html_size > 0,
                    "htmlSize": html_size,
                    "stateGenerated": bool(state),
                    "serverRunning": self.running
                }
            }
        except Exception as e:
            logger.error(f"Database sync dashboard test failed: {str(e)}")
            return {
                "success": False,
                "message": f"Database sync dashboard test failed: {str(e)}",
                "error": str(e)
            }
    
    async def close(self):
        """
        Clean up resources
        
        Returns:
            dict: Close result
        """
        try:
            # Save dashboard state
            if self.config["persistState"]:
                await self._save_dashboard_state()
            
            # Stop server if running
            if self.running:
                await self.stop_server()
            
            # Close panel
            if self.panel:
                await self.panel.close()
            
            # Close monitor
            if self.monitor:
                await self.monitor.close()
            
            logger.info("Database sync dashboard closed")
            return {"success": True, "message": "Database sync dashboard closed"}
        except Exception as e:
            logger.error(f"Error closing database sync dashboard: {str(e)}")
            return {"success": False, "message": f"Error closing database sync dashboard: {str(e)}"}