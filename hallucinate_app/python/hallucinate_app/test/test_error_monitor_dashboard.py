"""
Test for the Error Monitor Dashboard component

Verifies that the error monitor dashboard correctly integrates with the
error monitor status panel and provides a comprehensive dashboard experience.
"""

import os
import sys
import json
import time
import unittest
import asyncio
from unittest.mock import MagicMock, patch
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import the components to test
from hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource, ErrorData
from hallucinate_app.dashboard.error_monitor_status_panel import ErrorMonitorStatusPanel
from hallucinate_app.dashboard.error_monitor_dashboard import ErrorMonitorDashboard

class TestErrorMonitorDashboard(unittest.TestCase):
    """Test the Error Monitor Dashboard"""
    
    def setUp(self):
        """Set up test resources"""
        # Create a mock error monitor
        self.mock_error_monitor = MagicMock()
        
        # Mock the necessary methods
        self.mock_error_monitor.get_component_status.return_value = {
            "python:test_component": {
                "status": "healthy",
                "error_count": 0,
                "last_updated": datetime.now().isoformat()
            }
        }
        
        self.mock_error_monitor.get_analytics.return_value = {
            "summary": {
                "total_errors": 5,
                "top_errors": [
                    {"message": "Test error", "count": 3}
                ],
                "by_source": [
                    {"source": "python", "count": 5}
                ],
                "by_component": [
                    {"component": "test_component", "count": 5}
                ],
                "error_rates": {
                    "hourly": 1,
                    "daily_avg": 5,
                    "weekly_avg": 3
                }
            }
        }
        
        self.mock_error_monitor.get_alerts.return_value = [
            {
                "error_id": "test_error_1",
                "rule": "test_rule",
                "timestamp": datetime.now().isoformat(),
                "error_level": "error",
                "component": "test_component",
                "source": "python",
                "message": "Test alert message"
            }
        ]
        
        self.mock_error_monitor.get_errors.return_value = [
            ErrorData(
                id="test_error_1",
                timestamp=datetime.now().isoformat(),
                level=ErrorLevel.ERROR,
                source=ErrorSource.PYTHON,
                component="test_component",
                operation="test_operation",
                message="Test error message"
            )
        ]
        
        # Add methods to allow subscription
        def add_alert_handler(handler):
            self.alert_handler = handler
            return True
        
        self.mock_error_monitor.add_alert_handler = add_alert_handler
        
        # Create test directory for dashboard
        self.test_dir = Path(os.path.abspath(os.path.dirname(__file__))) / "test_data" / "dashboard"
        os.makedirs(self.test_dir, exist_ok=True)
        
        # Create resources dictionary
        self.resources = {
            "error_monitor": self.mock_error_monitor
        }
        
        # Dashboard instance
        self.dashboard = None
    
    async def init_dashboard(self):
        """Initialize the dashboard for async tests"""
        self.dashboard = ErrorMonitorDashboard(
            resources=self.resources,
            metadata={
                "dashboardDir": str(self.test_dir),
                "refreshInterval": 1000,
                "theme": "light",
                "enableServer": False,  # Don't start server for tests
                "autoStart": False
            }
        )
        await self.dashboard.init()
    
    def tearDown(self):
        """Clean up after tests"""
        # Clean up any state files
        state_path = os.path.join(self.test_dir, "error_dashboard_state.json")
        if os.path.exists(state_path):
            os.remove(state_path)
    
    def test_init(self):
        """Test dashboard initialization"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        init_result = loop.run_until_complete(self.init_dashboard())
        loop.close()
        
        # Verify the dashboard and panel were initialized correctly
        self.assertIsNotNone(self.dashboard.panel)
        self.assertFalse(self.dashboard.running)  # Server not started
        self.assertEqual(self.dashboard.config["theme"], "light")
        self.assertEqual(self.dashboard.config["refreshInterval"], 1000)
    
    def test_start_server(self):
        """Test starting the dashboard server"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Start the server
        start_result = loop.run_until_complete(self.dashboard.start_server())
        
        # Verify the result and state
        self.assertTrue(start_result["success"])
        self.assertTrue(self.dashboard.running)
        self.assertEqual(start_result["port"], self.dashboard.config["serverPort"])
        
        # Try to start again (should fail)
        start_again_result = loop.run_until_complete(self.dashboard.start_server())
        
        # Verify the result
        self.assertFalse(start_again_result["success"])
        
        loop.close()
    
    def test_stop_server(self):
        """Test stopping the dashboard server"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Start the server
        loop.run_until_complete(self.dashboard.start_server())
        
        # Stop the server
        stop_result = loop.run_until_complete(self.dashboard.stop_server())
        
        # Verify the result and state
        self.assertTrue(stop_result["success"])
        self.assertFalse(self.dashboard.running)
        
        # Try to stop again (should fail)
        stop_again_result = loop.run_until_complete(self.dashboard.stop_server())
        
        # Verify the result
        self.assertFalse(stop_again_result["success"])
        
        loop.close()
    
    def test_refresh_dashboard(self):
        """Test refreshing the dashboard"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Record the last updated timestamp before refresh
        before_timestamp = self.dashboard.dashboard_state["lastUpdated"]
        
        # Wait a moment to ensure timestamp changes
        time.sleep(0.01)
        
        # Refresh the dashboard
        refresh_result = loop.run_until_complete(self.dashboard.refresh_dashboard())
        
        # Verify the result and state
        self.assertTrue(refresh_result["success"])
        self.assertGreater(self.dashboard.dashboard_state["lastUpdated"], before_timestamp)
        
        loop.close()
    
    def test_get_dashboard_html(self):
        """Test generating dashboard HTML"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Get the HTML
        html = self.dashboard.get_dashboard_html()
        
        # Verify that HTML was generated
        self.assertIsInstance(html, str)
        self.assertTrue(len(html) > 0)
        
        # Check for key elements in the HTML
        self.assertIn("Error Monitoring Dashboard", html)
        self.assertIn("dashboard-header", html)
        self.assertIn("dashboard-panels", html)
        self.assertIn("error-monitor-panel", html)
        
        loop.close()
    
    def test_get_dashboard_state(self):
        """Test getting dashboard state"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Get the state
        state = self.dashboard.get_dashboard_state()
        
        # Verify the state
        self.assertIsInstance(state, dict)
        self.assertIn("monitor", state)
        self.assertIn("panel", state)
        self.assertIn("dashboard", state)
        
        # Check dashboard section
        dashboard_section = state["dashboard"]
        self.assertIn("startTime", dashboard_section)
        self.assertIn("uptime", dashboard_section)
        self.assertIn("lastUpdated", dashboard_section)
        self.assertIn("serverRunning", dashboard_section)
        
        loop.close()
    
    def test_save_load_dashboard_state(self):
        """Test saving and loading dashboard state"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Modify some state
        self.dashboard.panel.set_active_tab("errors")
        self.dashboard.config["theme"] = "dark"
        
        # Save the state
        loop.run_until_complete(self.dashboard._save_dashboard_state())
        
        # Verify state file exists
        state_path = os.path.join(self.test_dir, "error_dashboard_state.json")
        self.assertTrue(os.path.exists(state_path))
        
        # Create a new dashboard instance
        new_dashboard = ErrorMonitorDashboard(
            resources=self.resources,
            metadata={
                "dashboardDir": str(self.test_dir),
                "refreshInterval": 1000,
                "theme": "light",  # Different theme
                "enableServer": False,
                "autoStart": False
            }
        )
        
        # Initialize and load state
        loop.run_until_complete(new_dashboard.init())
        
        # Verify loaded state
        self.assertEqual(new_dashboard.config["theme"], "dark")  # Should have loaded the saved theme
        self.assertEqual(new_dashboard.panel.ui_state["activeTab"], "errors")  # Should have loaded the saved active tab
        
        loop.close()
    
    def test_format_duration(self):
        """Test formatting time durations"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Test various durations
        self.assertEqual(self.dashboard._format_duration(5000), "5s")
        self.assertEqual(self.dashboard._format_duration(65000), "1m 5s")
        self.assertEqual(self.dashboard._format_duration(3665000), "1h 1m 5s")
        self.assertEqual(self.dashboard._format_duration(90061000), "1d 1h 1m")
        
        loop.close()
    
    def test_dashboard_test_method(self):
        """Test the dashboard's test method"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Run the test method
        test_result = loop.run_until_complete(self.dashboard.test())
        
        # Verify the result
        self.assertTrue(test_result["success"])
        self.assertIn("results", test_result)
        self.assertTrue(test_result["results"]["htmlGenerated"])
        self.assertFalse(test_result["results"]["serverRunning"])
        
        loop.close()
    
    def test_close(self):
        """Test closing the dashboard"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_dashboard())
        
        # Start the server so we can test stopping it
        loop.run_until_complete(self.dashboard.start_server())
        
        # Close the dashboard
        close_result = loop.run_until_complete(self.dashboard.close())
        
        # Verify the result and state
        self.assertTrue(close_result["success"])
        self.assertFalse(self.dashboard.running)  # Server should be stopped
        
        # State should be saved
        state_path = os.path.join(self.test_dir, "error_dashboard_state.json")
        self.assertTrue(os.path.exists(state_path))
        
        loop.close()

if __name__ == '__main__':
    unittest.main()