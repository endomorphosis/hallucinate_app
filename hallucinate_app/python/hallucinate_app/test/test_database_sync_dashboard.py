"""
Tests for the Database Synchronization Dashboard

Tests the integration of DatabaseSyncMonitor and DatabaseSyncStatusPanel
in the DatabaseSyncDashboard.
"""

import os
import json
import time
import asyncio
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
from datetime import datetime, timedelta
import tempfile
import shutil

# Import the modules to test
from hallucinate_app.dashboard.database_sync_dashboard import DatabaseSyncDashboard
from hallucinate_app.database_sync_monitor import SYNC_STATUS, ALERT_SEVERITY

class TestDatabaseSyncDashboard(unittest.TestCase):
    """Tests for the DatabaseSyncDashboard class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Create a temporary directory for dashboard files
        self.temp_dir = tempfile.mkdtemp()
        
        # Create mock resources
        self.mock_sync_manager = MagicMock()
        self.mock_sync_manager.sync_state = {
            "lastOrbitDBSync": int(time.time() * 1000) - 3600000,  # 1 hour ago
            "lastFireproofDBSync": int(time.time() * 1000) - 7200000,  # 2 hours ago
            "lastDuckDBExport": int(time.time() * 1000) - 10800000,  # 3 hours ago
            "lastDuckDBImport": int(time.time() * 1000) - 14400000,  # 4 hours ago
            "activeJobs": {},
            "syncHistory": [
                {
                    "type": "orbit-to-fireproof",
                    "timestamp": int(time.time() * 1000) - 3600000,
                    "stats": {
                        "processed": 100,
                        "updated": 90,
                        "conflicts": 5,
                        "errors": 5
                    }
                },
                {
                    "type": "fireproof-to-orbit",
                    "timestamp": int(time.time() * 1000) - 7200000,
                    "stats": {
                        "processed": 80,
                        "updated": 75,
                        "conflicts": 3,
                        "errors": 2
                    }
                }
            ],
            "conflictLog": [],
            "changeLog": {}
        }
        
        # Set up additional mock methods
        self.mock_sync_manager.on = MagicMock()
        self.mock_sync_manager.remove_listener = MagicMock()
        
        # Configure the monitor
        self.resources = {
            "syncManager": self.mock_sync_manager,
            "threadPool": MagicMock()
        }
        
        self.metadata = {
            "dashboardDir": self.temp_dir,
            "enableServer": True,
            "serverPort": 8080,
            "autoStart": False,  # Don't auto-start for testing
            "theme": "light",
            "defaultTab": "status",
            "refreshInterval": 5000,
            "webSocketEnabled": False,  # Disable WebSocket for testing
            "authentication": False,
            "sslEnabled": False,
            "persistState": True
        }
        
        # Create the dashboard instance
        self.dashboard = DatabaseSyncDashboard(
            resources=self.resources,
            metadata=self.metadata
        )

    def tearDown(self):
        """Clean up after each test"""
        # Remove temporary directory
        shutil.rmtree(self.temp_dir)
    
    async def init_dashboard(self):
        """Initialize the dashboard for tests"""
        # Patch the DatabaseSyncMonitor and DatabaseSyncStatusPanel
        with patch('hallucinate_app.dashboard.database_sync_dashboard.DatabaseSyncMonitor') as mock_monitor_class, \
                patch('hallucinate_app.dashboard.database_sync_dashboard.DatabaseSyncStatusPanel') as mock_panel_class:
            
            # Configure mocks
            mock_monitor = MagicMock()
            async def mock_init():
                return {"success": True, "message": "Monitor initialized"}
            mock_monitor.init = mock_init
            
            # Mock test method that can be tracked for calls
            mock_test = MagicMock()
            mock_test.return_value = {"success": True, "message": "Monitor test successful"}
            
            # Create an async wrapper for the mock
            async def async_mock_test():
                return mock_test()
                
            mock_monitor.test = async_mock_test
            mock_monitor._test_mock = mock_test  # Store the mock for assertions
            mock_monitor.get_sync_status.return_value = {
                "orbitToFireproof": SYNC_STATUS["COMPLETE"],
                "fireproofToOrbit": SYNC_STATUS["COMPLETE"],
                "duckdbExport": SYNC_STATUS["COMPLETE"],
                "duckdbImport": SYNC_STATUS["COMPLETE"],
                "overall": SYNC_STATUS["COMPLETE"]
            }
            mock_monitor.get_sync_metrics.return_value = {
                "syncOperations": {"total": 10, "succeeded": 9, "failed": 1},
                "dataVolume": {
                    "orbitToFireproof": 500,
                    "fireproofToOrbit": 400,
                    "duckdbExport": 300,
                    "duckdbImport": 200
                },
                "conflicts": {"count": 5},
                "errors": {"count": 3}
            }
            mock_monitor.get_recent_alerts.return_value = []
            mock_monitor.get_active_jobs.return_value = {}
            
            mock_panel = MagicMock()
            async def mock_panel_init():
                return {"success": True, "message": "Panel initialized"}
            mock_panel.init = mock_panel_init
            mock_panel.get_state.return_value = {
                "activeTab": "status",
                "expandedSections": [],
                "filterSettings": {"alerts": {"severity": "all"}, "history": {"syncType": "all"}},
                "lastUpdated": int(time.time() * 1000)
            }
            mock_panel.get_panel_html.return_value = "<div>Mock Panel HTML</div>"
            mock_panel.config = {"customCss": ""}
            
            # Set mock returns
            mock_monitor_class.return_value = mock_monitor
            mock_panel_class.return_value = mock_panel
            
            # Initialize dashboard
            result = await self.dashboard.init()
            
            # Store mocks for later assertions
            self.dashboard.monitor = mock_monitor
            self.dashboard.panel = mock_panel
            
            return result
    
    def test_initialization(self):
        """Test dashboard initialization"""
        # Run the initialization
        loop = asyncio.new_event_loop()
        init_result = loop.run_until_complete(self.init_dashboard())
        loop.close()
        
        # Verify initialization result
        self.assertTrue(init_result["success"])
        self.assertEqual(init_result["message"], "Database sync dashboard initialized")
        
        # Verify monitor and panel were initialized
        self.assertIsNotNone(self.dashboard.monitor)
        self.assertIsNotNone(self.dashboard.panel)
        
        # Verify dashboard state was initialized
        self.assertGreater(self.dashboard.dashboard_state["startTime"], 0)
        self.assertGreater(self.dashboard.dashboard_state["lastUpdated"], 0)
        self.assertIn("database-sync-status", self.dashboard.dashboard_state["activePanels"])
    
    def test_server_start_stop(self):
        """Test starting and stopping the server"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Start the server
        start_result = loop.run_until_complete(self.dashboard.start_server())
        
        # Verify start result
        self.assertTrue(start_result["success"])
        self.assertEqual(start_result["port"], 8080)
        self.assertTrue(self.dashboard.running)
        
        # Stop the server
        stop_result = loop.run_until_complete(self.dashboard.stop_server())
        
        # Verify stop result
        self.assertTrue(stop_result["success"])
        self.assertFalse(self.dashboard.running)
        
        loop.close()
    
    def test_dashboard_html_generation(self):
        """Test generating dashboard HTML"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Get HTML
        html = self.dashboard.get_dashboard_html()
        
        # Verify HTML content
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("<title>Database Synchronization Dashboard</title>", html)
        self.assertIn("Database Synchronization Dashboard", html)
        self.assertIn("Uptime:", html)
        self.assertIn("Last updated:", html)
        self.assertIn("Mock Panel HTML", html)  # Mock panel HTML
        self.assertIn("</html>", html)
        
        loop.close()
    
    def test_dashboard_state(self):
        """Test getting dashboard state"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Get state
        state = self.dashboard.get_dashboard_state()
        
        # Verify state structure
        self.assertIn("monitor", state)
        self.assertIn("panel", state)
        self.assertIn("dashboard", state)
        
        # Verify monitor state
        monitor_state = state["monitor"]
        self.assertIn("syncStatus", monitor_state)
        self.assertIn("metrics", monitor_state)
        self.assertIn("alerts", monitor_state)
        self.assertIn("activeJobs", monitor_state)
        
        # Verify panel state
        panel_state = state["panel"]
        self.assertIn("activeTab", panel_state)
        self.assertIn("expandedSections", panel_state)
        self.assertIn("filterSettings", panel_state)
        
        # Verify dashboard state
        dashboard_state = state["dashboard"]
        self.assertIn("startTime", dashboard_state)
        self.assertIn("uptime", dashboard_state)
        self.assertIn("lastUpdated", dashboard_state)
        self.assertIn("theme", dashboard_state)
        self.assertIn("refreshInterval", dashboard_state)
        
        loop.close()
    
    def test_dashboard_refresh(self):
        """Test refreshing the dashboard"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Store the initial last updated time
        initial_time = self.dashboard.dashboard_state["lastUpdated"]
        
        # Wait a bit
        time.sleep(0.1)
        
        # Refresh the dashboard
        refresh_result = loop.run_until_complete(self.dashboard.refresh_dashboard())
        
        # Verify refresh result
        self.assertTrue(refresh_result["success"])
        
        # Verify last updated time was updated
        self.assertGreater(self.dashboard.dashboard_state["lastUpdated"], initial_time)
        
        # Verify panel refresh was called
        self.dashboard.panel.refresh_ui.assert_called_once()
        
        loop.close()
    
    def test_save_load_state(self):
        """Test saving and loading dashboard state"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Modify some state
        self.dashboard.config["theme"] = "dark"
        self.dashboard.config["defaultTab"] = "metrics"
        self.dashboard.config["refreshInterval"] = 10000
        
        # Save state
        loop.run_until_complete(self.dashboard._save_dashboard_state())
        
        # Reset state
        self.dashboard.config["theme"] = "light"
        self.dashboard.config["defaultTab"] = "status"
        self.dashboard.config["refreshInterval"] = 5000
        
        # Load state
        loop.run_until_complete(self.dashboard._load_dashboard_state())
        
        # Verify state was restored
        self.assertEqual(self.dashboard.config["theme"], "dark")
        self.assertEqual(self.dashboard.config["defaultTab"], "metrics")
        self.assertEqual(self.dashboard.config["refreshInterval"], 10000)
        
        loop.close()
    
    def test_dashboard_test(self):
        """Test the dashboard test method"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Run test
        test_result = loop.run_until_complete(self.dashboard.test())
        
        # Verify test result
        self.assertTrue(test_result["success"])
        self.assertIn("monitorTest", test_result["results"])
        self.assertIn("htmlGenerated", test_result["results"])
        self.assertIn("htmlSize", test_result["results"])
        self.assertIn("stateGenerated", test_result["results"])
        
        # Verify monitor test was called
        self.dashboard.monitor._test_mock.assert_called_once()
        
        loop.close()
    
    def test_duration_formatting(self):
        """Test duration formatting"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Test various durations
        self.assertEqual(self.dashboard._format_duration(1000), "1s")
        self.assertEqual(self.dashboard._format_duration(60000), "1m 0s")
        self.assertEqual(self.dashboard._format_duration(3600000), "1h 0m 0s")
        self.assertEqual(self.dashboard._format_duration(86400000), "1d 0h 0m")
        self.assertEqual(self.dashboard._format_duration(90061000), "1d 1h 1m")
        
        loop.close()
    
    def test_close(self):
        """Test closing the dashboard"""
        # Initialize the dashboard
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Mock the close methods for monitor and panel
        async def mock_monitor_close():
            return {"success": True, "message": "Monitor closed"}
        self.dashboard.monitor.close = mock_monitor_close
        
        async def mock_panel_close():
            return {"success": True, "message": "Panel closed"}
        self.dashboard.panel.close = mock_panel_close
        
        # Start the server
        loop.run_until_complete(self.dashboard.start_server())
        
        # Close the dashboard
        close_result = loop.run_until_complete(self.dashboard.close())
        loop.close()
        
        # Verify close result
        self.assertTrue(close_result["success"])
        
        # Verify resources were cleaned up
        self.assertFalse(self.dashboard.running)

if __name__ == "__main__":
    unittest.main()