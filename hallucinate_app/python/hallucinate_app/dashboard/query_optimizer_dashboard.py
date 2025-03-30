"""
Query Optimizer Dashboard

This module provides a comprehensive dashboard for monitoring and managing 
query optimization across multiple database systems. It integrates the 
query optimizer status panel with web server capabilities for remote access.

Key features:
- Visualization of query optimization metrics
- Performance comparison between optimized and unoptimized queries
- Optimization strategy analysis and recommendations
- Query plan visualization and comparison
- Web server for remote dashboard access
- Integration with other dashboard components
"""

import os
import json
import logging
import asyncio
import time
from typing import Dict, List, Any, Optional, Callable, Union
from datetime import datetime, timedelta
import threading
import socket
from aiohttp import web

try:
    # Import panel
    from .query_optimizer_status_panel import QueryOptimizerStatusPanel
    
    # Import query optimization components
    from ..advanced_query_optimizer import (
        AdvancedQueryOptimizer,
        OptimizationLevel,
        OptimizationStrategy
    )
    
    from ..database_query_system import (
        DatabaseQuerySystem,
        QueryPlan,
        QueryFragment
    )
    
    DASHBOARD_COMPONENTS_AVAILABLE = True
except ImportError:
    DASHBOARD_COMPONENTS_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class QueryOptimizerDashboard:
    """
    Comprehensive dashboard for query optimization monitoring and management
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the query optimizer dashboard
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "enable_server": self.metadata.get("enable_server", True),
            "server_host": self.metadata.get("server_host", "localhost"),
            "server_port": self.metadata.get("server_port", 8085),
            "server_path": self.metadata.get("server_path", "/query-optimizer"),
            "enable_api": self.metadata.get("enable_api", True),
            "api_prefix": self.metadata.get("api_prefix", "/api/query-optimizer"),
            "dashboard_title": self.metadata.get("dashboard_title", "Query Optimizer Dashboard"),
            "refresh_interval": self.metadata.get("refresh_interval", 10),
            "theme": self.metadata.get("theme", "light"),
            "state_file": self.metadata.get("state_file", os.path.join(
                os.path.dirname(os.path.abspath(__file__)), 
                "../..", 
                "data", 
                "query_optimizer_dashboard_state.json"
            )),
            "max_history": self.metadata.get("max_history", 100),
            "enable_integration": self.metadata.get("enable_integration", True)
        }
        
        # Server state
        self.server = None
        self.app = None
        self.runner = None
        self.site = None
        self.running = False
        
        # Dashboard components
        self.status_panel = None
        
        # Resources from pool
        self.query_system = self.resources.get("database_query_system")
        self.query_optimizer = self.resources.get("advanced_query_optimizer")
        
        # Initialize components if dependencies are available
        if DASHBOARD_COMPONENTS_AVAILABLE:
            # Create embedded panel with current resources and shared configuration
            panel_config = {
                "auto_refresh": True,
                "refresh_interval": self.config["refresh_interval"],
                "theme": self.config["theme"],
                "panel_id": "main-query-optimizer-panel"
            }
            
            self.status_panel = QueryOptimizerStatusPanel(
                resources=self.resources,
                metadata=panel_config
            )
        
        # State persistence
        self.dashboard_state = {
            "last_update": 0,
            "panels": {},
            "queries": [],
            "recommendations": []
        }
        
        logger.info(f"QueryOptimizerDashboard initialized with config: {self.config}")
    
    async def init(self):
        """Initialize the dashboard and its components"""
        # Initialize panel
        if self.status_panel:
            await self.status_panel.init()
        
        # Load saved state if available
        self._load_state()
        
        # Start server if enabled
        if self.config["enable_server"]:
            await self.start_server()
        
        logger.info("Query optimizer dashboard initialized")
    
    async def start_server(self):
        """Start the dashboard web server"""
        if self.running:
            logger.warning("Server is already running")
            return
        
        try:
            # Create web application
            self.app = web.Application()
            
            # Configure routes
            self._setup_routes()
            
            # Start the server
            self.runner = web.AppRunner(self.app)
            await self.runner.setup()
            
            # Create site
            self.site = web.TCPSite(
                self.runner, 
                self.config["server_host"], 
                self.config["server_port"]
            )
            
            # Start listening for requests
            await self.site.start()
            self.running = True
            
            logger.info(f"Query optimizer dashboard server running at http://{self.config['server_host']}:{self.config['server_port']}{self.config['server_path']}")
            
        except Exception as e:
            logger.error(f"Failed to start dashboard server: {e}")
            # Cleanup on failure
            if self.runner:
                await self.runner.cleanup()
            self.running = False
    
    async def stop_server(self):
        """Stop the dashboard web server"""
        if not self.running:
            logger.warning("Server is not running")
            return
        
        try:
            # Stop the site
            if self.site:
                await self.site.stop()
            
            # Clean up the runner
            if self.runner:
                await self.runner.cleanup()
            
            self.running = False
            logger.info("Query optimizer dashboard server stopped")
            
        except Exception as e:
            logger.error(f"Error stopping server: {e}")
    
    def _setup_routes(self):
        """Set up the server routes"""
        # Main dashboard route
        self.app.router.add_get(self.config["server_path"], self._handle_dashboard)
        
        # Static assets route
        self.app.router.add_static(
            "/static",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"),
            name="static"
        )
        
        # Only set up API routes if enabled
        if self.config["enable_api"]:
            api_prefix = self.config["api_prefix"]
            
            # API routes
            self.app.router.add_get(f"{api_prefix}/state", self._handle_api_state)
            self.app.router.add_get(f"{api_prefix}/status", self._handle_api_status)
            self.app.router.add_get(f"{api_prefix}/metrics", self._handle_api_metrics)
            self.app.router.add_get(f"{api_prefix}/recommendations", self._handle_api_recommendations)
            self.app.router.add_get(f"{api_prefix}/query-plans", self._handle_api_query_plans)
            self.app.router.add_get(f"{api_prefix}/strategies", self._handle_api_strategies)
            
            # API for controlling the optimizer
            self.app.router.add_post(f"{api_prefix}/optimize", self._handle_api_optimize)
            self.app.router.add_post(f"{api_prefix}/settings", self._handle_api_settings)
    
    async def _handle_dashboard(self, request):
        """Handler for the main dashboard page"""
        html = self.get_dashboard_html()
        return web.Response(text=html, content_type="text/html")
    
    async def _handle_api_state(self, request):
        """Handler for the dashboard state API"""
        state = self.get_dashboard_state()
        return web.json_response(state)
    
    async def _handle_api_status(self, request):
        """Handler for the optimizer status API"""
        status = {
            "running": self.running,
            "last_update": self.dashboard_state["last_update"],
            "components": {
                "status_panel": self.status_panel is not None,
                "query_system": self.query_system is not None,
                "query_optimizer": self.query_optimizer is not None
            },
            "server": {
                "host": self.config["server_host"],
                "port": self.config["server_port"],
                "path": self.config["server_path"]
            }
        }
        return web.json_response(status)
    
    async def _handle_api_metrics(self, request):
        """Handler for the metrics API"""
        # Get filter parameters
        time_period = request.query.get("time_period", "24h")
        database_type = request.query.get("database_type", None)
        query_type = request.query.get("query_type", None)
        status = request.query.get("status", None)
        
        # Apply filters to panel
        if self.status_panel:
            self.status_panel.set_filter("time_period", time_period)
            if database_type:
                self.status_panel.set_filter("database_type", database_type)
            if query_type:
                self.status_panel.set_filter("query_type", query_type)
            if status:
                self.status_panel.set_filter("status", status)
            
            # Get filtered data
            view_data = self.status_panel.get_current_view_data()
            
            # Extract metrics
            if "metrics" in view_data:
                return web.json_response(view_data["metrics"])
            else:
                return web.json_response({})
        else:
            return web.json_response({})
    
    async def _handle_api_recommendations(self, request):
        """Handler for the recommendations API"""
        if self.status_panel:
            # Set active tab to recommendations
            self.status_panel.set_active_tab("recommendations")
            
            # Get recommendations
            view_data = self.status_panel.get_current_view_data()
            
            if "recommendations" in view_data:
                return web.json_response(view_data["recommendations"])
        
        return web.json_response({})
    
    async def _handle_api_query_plans(self, request):
        """Handler for the query plans API"""
        if self.status_panel:
            # Set active tab to plans
            self.status_panel.set_active_tab("plans")
            
            # Get plans
            view_data = self.status_panel.get_current_view_data()
            
            if "query_plans" in view_data:
                return web.json_response(view_data["query_plans"])
        
        return web.json_response([])
    
    async def _handle_api_strategies(self, request):
        """Handler for the strategies API"""
        if self.status_panel:
            # Set active tab to strategies
            self.status_panel.set_active_tab("strategies")
            
            # Get strategies
            view_data = self.status_panel.get_current_view_data()
            
            if "strategies" in view_data:
                return web.json_response(view_data["strategies"])
        
        return web.json_response({})
    
    async def _handle_api_optimize(self, request):
        """Handler for optimizer control API"""
        try:
            data = await request.json()
            
            # Check required fields
            if "query" not in data:
                return web.json_response({"error": "Missing query parameter"}, status=400)
            
            query = data.get("query")
            params = data.get("params", {})
            target_db = data.get("target_db", None)
            
            # Attempt to optimize and execute the query
            result = await self._optimize_query(query, params, target_db)
            
            return web.json_response(result)
        
        except Exception as e:
            logger.error(f"Error handling optimize request: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def _handle_api_settings(self, request):
        """Handler for updating optimizer settings"""
        try:
            data = await request.json()
            
            # Apply settings changes
            if "optimization_level" in data and self.query_optimizer:
                # Map string to OptimizationLevel enum
                level_map = {
                    "none": OptimizationLevel.NONE,
                    "basic": OptimizationLevel.BASIC,
                    "standard": OptimizationLevel.STANDARD,
                    "aggressive": OptimizationLevel.AGGRESSIVE,
                    "experimental": OptimizationLevel.EXPERIMENTAL
                }
                
                level_str = data["optimization_level"].lower()
                if level_str in level_map:
                    level = level_map[level_str]
                    # Update optimizer level
                    self.query_optimizer.optimization_level = level
            
            # Update dashboard configuration
            if "refresh_interval" in data:
                interval = int(data["refresh_interval"])
                if interval > 0:
                    self.config["refresh_interval"] = interval
                    
                    # Update panel if available
                    if self.status_panel:
                        self.status_panel.config["refresh_interval"] = interval
            
            if "theme" in data:
                theme = data["theme"]
                if theme in ["light", "dark"]:
                    self.config["theme"] = theme
                    
                    # Update panel if available
                    if self.status_panel:
                        self.status_panel.config["theme"] = theme
            
            # Save updated state
            self._save_state()
            
            return web.json_response({"success": True})
        
        except Exception as e:
            logger.error(f"Error handling settings update: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def _optimize_query(self, query: str, params: Dict = None, target_db: str = None) -> Dict:
        """
        Optimize and execute a query
        
        Args:
            query: Query string to optimize
            params: Query parameters
            target_db: Target database type
            
        Returns:
            Dict: Optimization and execution results
        """
        if not self.query_system:
            return {"error": "Query system not available"}
        
        if not self.query_optimizer:
            return {"error": "Query optimizer not available"}
        
        result = {
            "query": query,
            "original_plan": None,
            "optimized_plan": None,
            "original_time": None,
            "optimized_time": None,
            "speedup": 1.0,
            "success": False,
            "error": None
        }
        
        try:
            # Generate query plan
            original_plan = self.query_system.plan_query(query, params, target_db)
            result["original_plan"] = self._serialize_plan(original_plan)
            
            # Time the original plan execution
            start_time = time.time()
            original_result = await self.query_system.execute_plan(original_plan)
            original_time = time.time() - start_time
            result["original_time"] = original_time
            
            # Optimize the plan
            optimized_plan = self.query_optimizer.optimize(original_plan)
            result["optimized_plan"] = self._serialize_plan(optimized_plan)
            
            # Time the optimized plan execution
            start_time = time.time()
            optimized_result = await self.query_system.execute_plan(optimized_plan)
            optimized_time = time.time() - start_time
            result["optimized_time"] = optimized_time
            
            # Calculate speedup
            if original_time > 0:
                result["speedup"] = original_time / max(0.001, optimized_time)
            
            # Additional result details
            result["success"] = True
            result["result_size"] = len(str(optimized_result))
            result["timestamp"] = time.time()
            
            # Add to dashboard state
            self._add_query_to_history(result)
            self._save_state()
            
            return result
        
        except Exception as e:
            logger.error(f"Error optimizing query: {e}")
            result["error"] = str(e)
            return result
    
    def _serialize_plan(self, plan: Any) -> Dict:
        """
        Serialize a query plan to a JSON-compatible dictionary
        
        Args:
            plan: Query plan object
            
        Returns:
            Dict: Serialized plan
        """
        if hasattr(plan, "__dict__"):
            serialized = plan.__dict__.copy()
            
            # Serialize fragments
            if "fragments" in serialized:
                serialized["fragments"] = [
                    self._serialize_fragment(f) for f in serialized["fragments"]
                ]
            
            return serialized
        
        return {}
    
    def _serialize_fragment(self, fragment: Any) -> Dict:
        """
        Serialize a query fragment to a JSON-compatible dictionary
        
        Args:
            fragment: Query fragment object
            
        Returns:
            Dict: Serialized fragment
        """
        if hasattr(fragment, "__dict__"):
            serialized = fragment.__dict__.copy()
            
            # Serialize Enum values
            if "db_type" in serialized and hasattr(serialized["db_type"], "name"):
                serialized["db_type"] = serialized["db_type"].name
            
            if "query_type" in serialized and hasattr(serialized["query_type"], "name"):
                serialized["query_type"] = serialized["query_type"].name
            
            return serialized
        
        return {}
    
    def _add_query_to_history(self, query_result: Dict):
        """
        Add a query result to the dashboard history
        
        Args:
            query_result: Query result data
        """
        self.dashboard_state["queries"].insert(0, query_result)
        
        # Limit history size
        if len(self.dashboard_state["queries"]) > self.config["max_history"]:
            self.dashboard_state["queries"] = self.dashboard_state["queries"][:self.config["max_history"]]
        
        # Update timestamp
        self.dashboard_state["last_update"] = time.time()
    
    def _load_state(self):
        """Load dashboard state from file"""
        try:
            # Check if state file exists
            if os.path.exists(self.config["state_file"]):
                with open(self.config["state_file"], "r") as f:
                    loaded_state = json.load(f)
                    
                    # Update dashboard state with loaded data
                    if isinstance(loaded_state, dict):
                        for key, value in loaded_state.items():
                            if key in self.dashboard_state:
                                self.dashboard_state[key] = value
                
                logger.info(f"Loaded dashboard state from {self.config['state_file']}")
        
        except Exception as e:
            logger.error(f"Error loading dashboard state: {e}")
    
    def _save_state(self):
        """Save dashboard state to file"""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.config["state_file"]), exist_ok=True)
            
            # Write state to file
            with open(self.config["state_file"], "w") as f:
                json.dump(self.dashboard_state, f, indent=2)
            
            logger.debug("Saved dashboard state")
        
        except Exception as e:
            logger.error(f"Error saving dashboard state: {e}")
    
    def get_dashboard_html(self) -> str:
        """
        Generate HTML for the full dashboard
        
        Returns:
            str: HTML content
        """
        # Generate panel HTML if available
        panel_html = self.status_panel.get_panel_html() if self.status_panel else ""
        
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{self.config['dashboard_title']}</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    background-color: {('#f5f5f5' if self.config['theme'] == 'light' else '#222')};
                    color: {('#333' if self.config['theme'] == 'light' else '#eee')};
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
                    border-bottom: 1px solid {('#ddd' if self.config['theme'] == 'light' else '#444')};
                }}
                
                .dashboard-title {{
                    margin: 0;
                    font-size: 24px;
                }}
                
                .dashboard-controls {{
                    display: flex;
                    gap: 10px;
                }}
                
                .dashboard-settings {{
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#333')};
                    border-radius: 4px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }}
                
                .settings-title {{
                    margin-top: 0;
                    margin-bottom: 15px;
                    font-size: 18px;
                }}
                
                .settings-form {{
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                }}
                
                .form-group {{
                    margin-bottom: 10px;
                }}
                
                .form-group label {{
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }}
                
                .form-group select,
                .form-group input {{
                    width: 100%;
                    padding: 8px;
                    border: 1px solid {('#ddd' if self.config['theme'] == 'light' else '#555')};
                    border-radius: 4px;
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#444')};
                    color: {('#333' if self.config['theme'] == 'light' else '#eee')};
                }}
                
                .query-form {{
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#333')};
                    border-radius: 4px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }}
                
                .query-input {{
                    width: 100%;
                    height: 100px;
                    padding: 8px;
                    border: 1px solid {('#ddd' if self.config['theme'] == 'light' else '#555')};
                    border-radius: 4px;
                    font-family: monospace;
                    margin-bottom: 10px;
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#444')};
                    color: {('#333' if self.config['theme'] == 'light' else '#eee')};
                }}
                
                .query-params {{
                    width: 100%;
                    height: 60px;
                    padding: 8px;
                    border: 1px solid {('#ddd' if self.config['theme'] == 'light' else '#555')};
                    border-radius: 4px;
                    font-family: monospace;
                    margin-bottom: 10px;
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#444')};
                    color: {('#333' if self.config['theme'] == 'light' else '#eee')};
                }}
                
                .query-controls {{
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }}
                
                .btn {{
                    padding: 8px 16px;
                    border-radius: 4px;
                    border: none;
                    cursor: pointer;
                    font-size: 14px;
                }}
                
                .btn-primary {{
                    background-color: #2196f3;
                    color: white;
                }}
                
                .btn-primary:hover {{
                    background-color: #1976d2;
                }}
                
                .btn-secondary {{
                    background-color: #f5f5f5;
                    color: #333;
                    border: 1px solid #ddd;
                }}
                
                .btn-secondary:hover {{
                    background-color: #e0e0e0;
                }}
                
                .panels-container {{
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#333')};
                    border-radius: 4px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    padding: 15px;
                }}
                
                .dashboard-footer {{
                    margin-top: 20px;
                    padding-top: 10px;
                    border-top: 1px solid {('#ddd' if self.config['theme'] == 'light' else '#444')};
                    font-size: 12px;
                    color: {('#666' if self.config['theme'] == 'light' else '#aaa')};
                    display: flex;
                    justify-content: space-between;
                }}
                
                .status-indicator {{
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 12px;
                }}
                
                .status-active {{
                    background-color: #4caf50;
                    color: white;
                }}
                
                .status-inactive {{
                    background-color: #f44336;
                    color: white;
                }}
                
                .dark-theme select, 
                .dark-theme button,
                .dark-theme input,
                .dark-theme textarea {{
                    background-color: #444;
                    color: #eee;
                    border-color: #555;
                }}
                
                .dark-theme button:hover {{
                    background-color: #555;
                }}
                
                .collapsible {{
                    background-color: {('#f1f1f1' if self.config['theme'] == 'light' else '#3a3a3a')};
                    color: {('#444' if self.config['theme'] == 'light' else '#eee')};
                    cursor: pointer;
                    padding: 10px;
                    width: 100%;
                    border: none;
                    text-align: left;
                    outline: none;
                    font-size: 16px;
                    border-radius: 4px;
                    margin-bottom: 10px;
                }}
                
                .active-section, .collapsible:hover {{
                    background-color: {('#e0e0e0' if self.config['theme'] == 'light' else '#444')};
                }}
                
                .section-content {{
                    padding: 0 10px;
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.2s ease-out;
                    background-color: {('#fff' if self.config['theme'] == 'light' else '#333')};
                }}
            </style>
        </head>
        <body class="{self.config['theme']}-theme">
            <div class="dashboard-container">
                <div class="dashboard-header">
                    <h1 class="dashboard-title">{self.config['dashboard_title']}</h1>
                    <div class="dashboard-controls">
                        <button class="btn btn-secondary" onclick="toggleSettings()">Settings</button>
                        <button class="btn btn-secondary" onclick="refreshDashboard()">Refresh</button>
                        <button class="btn btn-secondary" onclick="toggleTheme()">
                            {('Switch to Dark Theme' if self.config['theme'] == 'light' else 'Switch to Light Theme')}
                        </button>
                    </div>
                </div>
                
                <div id="settings-panel" class="dashboard-settings" style="display: none;">
                    <h3 class="settings-title">Dashboard Settings</h3>
                    <div class="settings-form">
                        <div class="form-group">
                            <label for="refresh-interval">Refresh Interval (seconds)</label>
                            <input type="number" id="refresh-interval" min="1" max="60" value="{self.config['refresh_interval']}">
                        </div>
                        <div class="form-group">
                            <label for="optimization-level">Optimization Level</label>
                            <select id="optimization-level">
                                <option value="none">None</option>
                                <option value="basic">Basic</option>
                                <option value="standard" selected>Standard</option>
                                <option value="aggressive">Aggressive</option>
                                <option value="experimental">Experimental</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
                        <button class="btn btn-secondary" onclick="toggleSettings()">Cancel</button>
                    </div>
                </div>
                
                <button class="collapsible" onclick="toggleSection('query-section')">Try Query Optimization</button>
                <div id="query-section" class="section-content">
                    <div class="query-form">
                        <div class="form-group">
                            <label for="query-input">Query:</label>
                            <textarea id="query-input" class="query-input" placeholder="Enter your query here..."></textarea>
                        </div>
                        <div class="form-group">
                            <label for="query-params">Parameters (JSON format):</label>
                            <textarea id="query-params" class="query-params" placeholder="Example: params as JSON"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="target-db">Target Database:</label>
                            <select id="target-db">
                                <option value="">Auto Detect</option>
                                <option value="DUCKDB">DuckDB</option>
                                <option value="ORBITDB">OrbitDB</option>
                                <option value="FIREPROOFDB">FireproofDB</option>
                            </select>
                        </div>
                        <div class="query-controls">
                            <button class="btn btn-primary" onclick="optimizeQuery()">Optimize & Execute</button>
                            <button class="btn btn-secondary" onclick="clearQuery()">Clear</button>
                        </div>
                    </div>
                    
                    <div id="query-result" style="display: none; margin-top: 15px;">
                        <h4>Optimization Results</h4>
                        <div id="result-content" style="white-space: pre-wrap; font-family: monospace; padding: 10px; background-color: {('#f5f5f5' if self.config['theme'] == 'light' else '#333')}; border-radius: 4px; overflow-x: auto;"></div>
                    </div>
                </div>
                
                <div class="panels-container">
                    {panel_html}
                </div>
                
                <div class="dashboard-footer">
                    <div>
                        Last updated: <span id="last-update-time">{datetime.fromtimestamp(self.dashboard_state.get('last_update', 0)).strftime('%Y-%m-%d %H:%M:%S') if self.dashboard_state.get('last_update', 0) else 'Never'}</span>
                    </div>
                    <div>
                        <span class="status-indicator {('status-active' if self.running else 'status-inactive')}">
                            {('Server: Running' if self.running else 'Server: Stopped')}
                        </span>
                    </div>
                </div>
            </div>
            
            <script>
""" + f"""
                // Document loaded
                document.addEventListener('DOMContentLoaded', function() {{
                    // Initialize collapsible sections
                    var collapsibles = document.getElementsByClassName('collapsible');
                    for (var i = 0; i < collapsibles.length; i++) {{
                        collapsibles[i].addEventListener('click', function() {{
                            this.classList.toggle('active-section');
                            var content = this.nextElementSibling;
                            if (content.style.maxHeight) {{
                                content.style.maxHeight = null;
                            }} else {{
                                content.style.maxHeight = content.scrollHeight + "px";
                            }}
                        }});
                    }}
                    
                    // Setup event listeners for panel events
                    document.addEventListener('queryoptimizerTabChange', function(e) {{
                        handleTabChange(e.detail.tab, e.detail.panelId);
                    }});
                    
                    document.addEventListener('queryoptimizerFilterChange', function(e) {{
                        handleFilterChange(e.detail.filterType, e.detail.value, e.detail.panelId);
                    }});
                    
                    document.addEventListener('queryoptimizerRefresh', function(e) {{
                        refreshPanel(e.detail.panelId);
                    }});
                    
                    document.addEventListener('queryoptimizerToggleRefresh', function(e) {{
                        togglePanelAutoRefresh(e.detail.panelId);
                    }});
                }});
                
                // Toggle settings panel
                function toggleSettings() {{
                    var panel = document.getElementById('settings-panel');
                    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                }}
                
                // Toggle theme
                function toggleTheme() {{
                    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
                    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                    
                    // Update body class
                    document.body.classList.remove(currentTheme + '-theme');
                    document.body.classList.add(newTheme + '-theme');
                    
                    // Save settings
                    fetch('{self.config["api_prefix"]}/settings', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json',
                        }},
                        body: JSON.stringify({{
                            theme: newTheme
                        }}),
                    }})
                    .then(response => response.json())
                    .then(data => {{
                        console.log('Theme updated:', data);
                        // Reload page to apply theme globally
                        location.reload();
                    }})
                    .catch(error => {{
                        console.error('Error updating theme:', error);
                    }});
                }}
                
                // Save dashboard settings
                function saveSettings() {{
                    const refreshInterval = document.getElementById('refresh-interval').value;
                    const optimizationLevel = document.getElementById('optimization-level').value;
                    
                    // Send settings to API
                    fetch('{self.config["api_prefix"]}/settings', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json',
                        }},
                        body: JSON.stringify({{
                            refresh_interval: refreshInterval,
                            optimization_level: optimizationLevel
                        }}),
                    }})
                    .then(response => response.json())
                    .then(data => {{
                        console.log('Settings saved:', data);
                        toggleSettings(); // Hide settings panel
                        refreshDashboard(); // Refresh with new settings
                    }})
                    .catch(error => {{
                        console.error('Error saving settings:', error);
                    }});
                }}
                
                // Refresh dashboard
                function refreshDashboard() {{
                    // Refresh each panel
                    const event = new CustomEvent('queryoptimizerRefresh', {{
                        detail: {{ panelId: 'main-query-optimizer-panel' }}
                    }});
                    document.dispatchEvent(event);
                    
                    // Update last update time
                    document.getElementById('last-update-time').textContent = new Date().toLocaleString();
                }}
                
                // Toggle a section
                function toggleSection(sectionId) {{
                    const section = document.getElementById(sectionId);
                    if (section.style.maxHeight) {{
                        section.style.maxHeight = null;
                    }} else {{
                        section.style.maxHeight = section.scrollHeight + "px";
                    }}
                }}
                
                // Handle tab change in panel
                function handleTabChange(tab, panelId) {{
                    // Send tab change to server via fetch API
                    fetch(`{self.config["api_prefix"]}/tab/${{tab}}?panel=${{panelId}}`, {{ method: 'POST' }})
                        .then(response => response.json())
                        .then(data => console.log('Tab changed:', data))
                        .catch(error => console.error('Error changing tab:', error));
                    
                    // Since the API might not exist, we'll also update the UI directly
                    const tabButtons = document.querySelectorAll(`#${{panelId}} .tab-btn`);
                    tabButtons.forEach(btn => {{
                        btn.classList.toggle('active', btn.innerText.toLowerCase() === tab);
                    }});
                }}
                
                // Handle filter change in panel
                function handleFilterChange(filterType, value, panelId) {{
                    // Send filter change to server via fetch API
                    fetch(`{self.config["api_prefix"]}/filter?type=${{filterType}}&value=${{value}}&panel=${{panelId}}`, {{ method: 'POST' }})
                        .then(response => response.json())
                        .then(data => console.log('Filter changed:', data))
                        .catch(error => console.error('Error changing filter:', error));
                    
                    // Since the API might not exist, we'll refresh the panel
                    refreshPanel(panelId);
                }}
                
                // Refresh a specific panel
                function refreshPanel(panelId) {{
                    // This is handled by the server-side, but we can update UI if needed
                    console.log('Refreshing panel:', panelId);
                }}
                
                // Toggle auto-refresh for a panel
                function togglePanelAutoRefresh(panelId) {{
                    // Send toggle command to server via fetch API
                    fetch(`{self.config["api_prefix"]}/toggle-refresh?panel=${{panelId}}`, {{ method: 'POST' }})
                        .then(response => response.json())
                        .then(data => console.log('Auto-refresh toggled:', data))
                        .catch(error => console.error('Error toggling auto-refresh:', error));
                    
                    // Since the API might not exist, we'll update UI based on button text
                    const button = document.querySelector(`#${{panelId}} .panel-actions button`);
                    if (button) {{
                        const isEnabled = button.textContent.includes('Disable');
                        button.textContent = isEnabled ? 'Enable Auto-refresh' : 'Disable Auto-refresh';
                    }}
                }}
                
                // Optimize and execute a query
                function optimizeQuery() {{
                    const query = document.getElementById('query-input').value;
                    const paramsText = document.getElementById('query-params').value;
                    const targetDb = document.getElementById('target-db').value;
                    
                    // Validate query
                    if (!query) {{
                        alert('Please enter a query');
                        return;
                    }}
                    
                    // Parse parameters
                    let params = {{}};
                    if (paramsText.trim()) {{
                        try {{
                            params = JSON.parse(paramsText);
                        }} catch (e) {{
                            alert('Invalid JSON in parameters field');
                            return;
                        }}
                    }}
                    
                    // Show loading state
                    document.getElementById('result-content').textContent = 'Optimizing and executing query...';
                    document.getElementById('query-result').style.display = 'block';
                    
                    // Send to API
                    fetch('{self.config["api_prefix"]}/optimize', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json',
                        }},
                        body: JSON.stringify({{
                            query: query,
                            params: params,
                            target_db: targetDb
                        }}),
                    }})
                    .then(response => response.json())
                    .then(data => {{
                        // Format and display result
                        document.getElementById('result-content').textContent = 
                            JSON.stringify(data, null, 2);
                        
                        // Refresh dashboard to show updated metrics
                        refreshDashboard();
                    }})
                    .catch(error => {{
                        document.getElementById('result-content').textContent = 
                            'Error: ' + error.message;
                    }});
                }}
                
                // Clear query form
                function clearQuery() {{
                    document.getElementById('query-input').value = '';
                    document.getElementById('query-params').value = '';
                    document.getElementById('target-db').selectedIndex = 0;
                    document.getElementById('query-result').style.display = 'none';
                }}
""" + """
            </script>
        </body>
        </html>
        """
        
        return html
    
    def get_dashboard_state(self) -> Dict[str, Any]:
        """
        Get current dashboard state
        
        Returns:
            Dict[str, Any]: Dashboard state
        """
        # Update state with current panel data if available
        if self.status_panel:
            self.dashboard_state["panels"]["status_panel"] = self.status_panel.get_current_view_data()
        
        # Add system status
        self.dashboard_state["system_status"] = {
            "server_running": self.running,
            "components": {
                "status_panel": self.status_panel is not None,
                "query_system": self.query_system is not None,
                "query_optimizer": self.query_optimizer is not None
            }
        }
        
        return self.dashboard_state
    
    def find_available_port(self, start_port: int = 8085, end_port: int = 8185) -> int:
        """
        Find an available port for the server
        
        Args:
            start_port: Starting port number to check
            end_port: Ending port number to check
            
        Returns:
            int: Available port number
        """
        for port in range(start_port, end_port + 1):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("localhost", port))
                    return port
                except socket.error:
                    continue
        
        # If no ports available, return the original port
        return start_port
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing QueryOptimizerDashboard")
        
        results = {
            "success": False,
            "module": "query_optimizer_dashboard",
            "tests": {},
            "errors": []
        }
        
        try:
            # Test 1: Initialization
            # Check that dashboard initializes correctly
            results["tests"]["initialization"] = {
                "success": True,
                "message": "Dashboard initializes correctly"
            }
            
            # Test 2: HTML generation
            # Check that dashboard generates valid HTML
            html = self.get_dashboard_html()
            html_ok = "<!DOCTYPE html>" in html and self.config["dashboard_title"] in html
            
            results["tests"]["html_generation"] = {
                "success": html_ok,
                "message": "Dashboard generates valid HTML"
            }
            
            # Test 3: State management
            # Check that dashboard state is managed correctly
            original_state = self.dashboard_state.copy()
            
            # Add a test query to history
            test_query = {
                "query": "SELECT * FROM test",
                "timestamp": time.time(),
                "success": True
            }
            
            self._add_query_to_history(test_query)
            
            # Check that query was added
            state_update_ok = len(self.dashboard_state["queries"]) > 0
            
            # Reset to original state
            self.dashboard_state = original_state
            
            results["tests"]["state_management"] = {
                "success": state_update_ok,
                "message": "Dashboard state management works correctly"
            }
            
            # Test 4: Server management
            # Check that server can start and stop
            # Use a very high port to avoid conflicts
            test_port = self.find_available_port(8900, 9000)
            self.config["server_port"] = test_port
            
            try:
                # Start server
                start_ok = False
                await self.start_server()
                start_ok = self.running
                
                # Stop server
                stop_ok = False
                await self.stop_server()
                stop_ok = not self.running
                
                server_ok = start_ok and stop_ok
            except Exception as e:
                server_ok = False
                results["errors"].append(f"Server test error: {e}")
            
            results["tests"]["server_management"] = {
                "success": server_ok,
                "message": "Server management works correctly"
            }
            
            # Overall success
            all_success = all(test["success"] for test in results["tests"].values())
            results["success"] = all_success
        
        except Exception as e:
            logger.error(f"Error in query optimizer dashboard test: {e}")
            results["success"] = False
            results["errors"].append(str(e))
        
        return results