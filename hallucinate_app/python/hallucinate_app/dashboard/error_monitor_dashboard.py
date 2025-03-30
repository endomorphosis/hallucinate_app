"""
Error Monitoring Dashboard

Integrates ErrorMonitor and ErrorMonitorStatusPanel to provide
a comprehensive dashboard for monitoring application errors.
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
from hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource
from hallucinate_app.dashboard.error_monitor_status_panel import ErrorMonitorStatusPanel

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("error_monitor_dashboard")

class ErrorMonitorDashboard:
    """
    Comprehensive dashboard for error monitoring.
    
    Integrates the ErrorMonitor and ErrorMonitorStatusPanel components
    to provide a complete monitoring solution.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the dashboard with resources and metadata
        
        Args:
            resources (dict): Shared resources (error_monitor, threadPool, etc.)
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
            raise ValueError("ErrorMonitor resource is required for ErrorMonitorDashboard")
        
        # Optional thread pool for parallel processing
        self.thread_pool = resources.get("threadPool")
        
        # Configuration options
        home_dir = os.path.expanduser("~")
        self.config = {
            "dashboardDir": metadata.get("dashboardDir", os.path.join(home_dir, ".hallucinate_app", "dashboard")),
            "enableServer": metadata.get("enableServer", True),
            "serverPort": metadata.get("serverPort", 8081),  # Different from DB sync dashboard
            "autoStart": metadata.get("autoStart", True),
            "theme": metadata.get("theme", "light"),  # or "dark"
            "defaultTab": metadata.get("defaultTab", "overview"),
            "refreshInterval": metadata.get("refreshInterval", 5000),  # 5 seconds
            "webSocketEnabled": metadata.get("webSocketEnabled", True),
            "authentication": metadata.get("authentication", False),
            "sslEnabled": metadata.get("sslEnabled", False),
            "sslCert": metadata.get("sslCert", ""),
            "sslKey": metadata.get("sslKey", ""),
            "persistState": metadata.get("persistState", True),
            "notificationsEnabled": metadata.get("notificationsEnabled", True),
            "integrationsEnabled": metadata.get("integrationsEnabled", False),
            "integrationsConfig": metadata.get("integrationsConfig", {}),
        }
        
        # Initialize components
        self.panel = None
        
        # Server state
        self.server = None
        self.running = False
        
        # Dashboard state
        self.dashboard_state = {
            "startTime": 0,
            "clientConnections": 0,
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
            
            # Initialize the status panel
            panel_resources = {
                "error_monitor": self.resources["error_monitor"]
            }
            
            panel_metadata = {
                "refreshInterval": self.config["refreshInterval"],
                "errorsLimit": 10,  # Show last 10 errors
                "alertsLimit": 5,   # Show last 5 alerts
                "enableRealTimeUpdates": True,
                "enableMetricsCharts": True,
                "enableStatusIcons": True,
                "enableAlertNotifications": self.config["notificationsEnabled"],
                "panelTitle": "Error Monitoring Status",
                "theme": self.config["theme"]
            }
            
            self.panel = ErrorMonitorStatusPanel(
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
            
            # Load persisted state if enabled
            if self.config["persistState"]:
                await self._load_dashboard_state()
            
            logger.info("Error monitor dashboard initialized")
            return {"success": True, "message": "Error monitor dashboard initialized"}
            
        except Exception as e:
            logger.error(f"Failed to initialize error monitor dashboard: {str(e)}")
            raise ValueError(f"ErrorMonitorDashboard initialization failed: {str(e)}")
    
    async def start_server(self):
        """
        Start the dashboard server
        
        Returns:
            dict: Start result
        """
        if self.running or self.server:
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
                <title>Error Monitoring Dashboard</title>
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
                    
                    /* Error panel styles */
                    .error-item {{
                        margin-bottom: 10px;
                        padding: 10px;
                        border-radius: 4px;
                        border-left: 4px solid;
                    }}
                    
                    .error-item.fatal {{
                        background-color: {"#411" if self.config["theme"] == "dark" else "#fdd"};
                        border-left-color: #c00;
                    }}
                    
                    .error-item.error {{
                        background-color: {"#411" if self.config["theme"] == "dark" else "#fee"};
                        border-left-color: #f44;
                    }}
                    
                    .error-item.warning {{
                        background-color: {"#441" if self.config["theme"] == "dark" else "#ffe"};
                        border-left-color: #cc0;
                    }}
                    
                    .error-item.info {{
                        background-color: {"#114" if self.config["theme"] == "dark" else "#eef"};
                        border-left-color: #44f;
                    }}
                    
                    .error-item.debug {{
                        background-color: {"#141" if self.config["theme"] == "dark" else "#efe"};
                        border-left-color: #4f4;
                    }}
                    
                    .error-item.resolved {{
                        opacity: 0.7;
                    }}
                    
                    .error-header {{
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 5px;
                        font-weight: bold;
                    }}
                    
                    .error-message {{
                        margin-bottom: 5px;
                    }}
                    
                    .error-actions {{
                        margin-top: 10px;
                    }}
                    
                    .error-stack-trace {{
                        font-family: monospace;
                        font-size: 12px;
                        white-space: pre-wrap;
                        background-color: {"#222" if self.config["theme"] == "dark" else "#f8f8f8"};
                        padding: 10px;
                        border-radius: 4px;
                        overflow: auto;
                        max-height: 200px;
                    }}
                    
                    /* Status indicators */
                    .status-healthy {{
                        background-color: {"#142" if self.config["theme"] == "dark" else "#dfd"};
                        border-color: #4caf50;
                    }}
                    
                    .status-warning {{
                        background-color: {"#442" if self.config["theme"] == "dark" else "#ffd"};
                        border-color: #ff9800;
                    }}
                    
                    .status-degraded {{
                        background-color: {"#432" if self.config["theme"] == "dark" else "#fea"};
                        border-color: #ff5722;
                    }}
                    
                    .status-critical {{
                        background-color: {"#412" if self.config["theme"] == "dark" else "#fdd"};
                        border-color: #f44336;
                    }}
                    
                    /* Component styles */
                    .component-item {{
                        margin-bottom: 10px;
                        padding: 10px;
                        border-radius: 4px;
                        border-left: 4px solid;
                    }}
                    
                    .component-header {{
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 10px;
                    }}
                    
                    .component-details {{
                        display: flex;
                        gap: 20px;
                    }}
                    
                    /* Analytics styles */
                    .chart-bar {{
                        display: flex;
                        align-items: center;
                        margin-bottom: 5px;
                    }}
                    
                    .bar-label {{
                        width: 150px;
                        padding-right: 10px;
                    }}
                    
                    .bar-value {{
                        height: 20px;
                        background-color: #2196F3;
                        color: white;
                        display: flex;
                        align-items: center;
                        padding: 0 8px;
                        border-radius: 2px;
                        white-space: nowrap;
                    }}
                    
                    /* Additional panel-specific styles */
                    {self.panel.config.get("customCss", "")}
                </style>
            </head>
            <body>
                <div class="dashboard-container">
                    <div class="dashboard-header">
                        <div class="dashboard-title">Error Monitoring Dashboard</div>
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
                        <div class="panel error-monitor-panel">
                            {panel_html}
                        </div>
                    </div>
                    <div class="dashboard-footer">
                        <div class="footer-info">Error Monitoring Dashboard</div>
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
                        
                        // Resolve buttons
                        document.querySelectorAll('.resolve-button').forEach(function(button) {{
                            button.addEventListener('click', function() {{
                                const errorId = this.getAttribute('data-error-id');
                                // In a real implementation, this would use AJAX to resolve the error
                                console.log('Resolve error:', errorId);
                                alert('Error would be marked as resolved');
                            }});
                        }});
                        
                        // Add note buttons
                        document.querySelectorAll('.add-note-button').forEach(function(button) {{
                            button.addEventListener('click', function() {{
                                const errorId = this.getAttribute('data-error-id');
                                const note = prompt('Enter a note for this error:');
                                if (note) {{
                                    // In a real implementation, this would use AJAX to add the note
                                    console.log('Add note to error:', errorId, note);
                                    alert('Note would be added to the error');
                                }}
                            }});
                        }});
                        
                        // Export buttons
                        document.querySelectorAll('.export-button').forEach(function(button) {{
                            button.addEventListener('click', function() {{
                                const format = this.getAttribute('data-format');
                                // In a real implementation, this would trigger a download
                                console.log('Export analytics as:', format);
                                alert('Analytics would be exported as ' + format);
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
        # Get error monitor state
        error_mon = self.resources["error_monitor"]
        monitor_state = {
            "componentStatus": error_mon.get_component_status(),
            "analytics": error_mon.get_analytics(),
            "alerts": error_mon.get_alerts(5)
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
            state_path = os.path.join(self.config["dashboardDir"], "error_dashboard_state.json")
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
            state_path = os.path.join(self.config["dashboardDir"], "error_dashboard_state.json")
            
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
            # Generate dashboard HTML
            dashboard_html = self.get_dashboard_html()
            html_size = len(dashboard_html)
            
            # Get dashboard state
            state = self.get_dashboard_state()
            
            return {
                "success": True,
                "message": "Error monitor dashboard test completed successfully",
                "results": {
                    "htmlGenerated": html_size > 0,
                    "htmlSize": html_size,
                    "stateGenerated": bool(state),
                    "serverRunning": self.running
                }
            }
        except Exception as e:
            logger.error(f"Error monitor dashboard test failed: {str(e)}")
            return {
                "success": False,
                "message": f"Error monitor dashboard test failed: {str(e)}",
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
            
            logger.info("Error monitor dashboard closed")
            return {"success": True, "message": "Error monitor dashboard closed"}
        except Exception as e:
            logger.error(f"Error closing error monitor dashboard: {str(e)}")
            return {"success": False, "message": f"Error closing error monitor dashboard: {str(e)}"}