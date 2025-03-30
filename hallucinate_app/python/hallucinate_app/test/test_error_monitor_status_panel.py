"""
Test for the Error Monitor Status Panel component

Verifies that the error monitor status panel correctly visualizes error data,
handles user interactions, and integrates with the error monitor.
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

class TestErrorMonitorStatusPanel(unittest.TestCase):
    """Test the Error Monitor Status Panel"""
    
    def setUp(self):
        """Set up test resources"""
        # Create a mock error monitor
        self.mock_error_monitor = MagicMock()
        
        # Mock monitor methods
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
        
        # Create resources dictionary
        self.resources = {
            "error_monitor": self.mock_error_monitor
        }
        
        # Panel instance
        self.panel = None
    
    async def init_panel(self):
        """Initialize the panel for async tests"""
        self.panel = ErrorMonitorStatusPanel(
            resources=self.resources,
            metadata={
                "refreshInterval": 1000,
                "theme": "light",
                "enableRealTimeUpdates": True
            }
        )
        await self.panel.init()
    
    def test_init(self):
        """Test panel initialization"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Verify the panel was initialized correctly
        self.assertEqual(self.panel.ui_state["activeTab"], "overview")
        self.assertTrue(self.panel.config["enableRealTimeUpdates"])
        self.assertEqual(self.panel.config["theme"], "light")
        self.assertEqual(self.panel.config["refreshInterval"], 1000)
    
    def test_set_active_tab(self):
        """Test setting the active tab"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Set active tab
        result = self.panel.set_active_tab("errors")
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.ui_state["activeTab"], "errors")
        
        # Test with invalid tab
        result = self.panel.set_active_tab("invalid-tab")
        
        # Verify the result and state
        self.assertFalse(result["success"])
        self.assertEqual(self.panel.ui_state["activeTab"], "errors")  # Unchanged
        
        loop.close()
    
    def test_set_filter(self):
        """Test setting filters"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Set a filter
        result = self.panel.set_filter("errors", "level", "error")
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.ui_state["filterSettings"]["errors"]["level"], "error")
        
        # Test with invalid filter type
        result = self.panel.set_filter("invalid-type", "level", "error")
        
        # Verify the result
        self.assertFalse(result["success"])
        
        # Test with invalid filter name
        result = self.panel.set_filter("errors", "invalid-name", "error")
        
        # Verify the result
        self.assertFalse(result["success"])
        
        loop.close()
    
    def test_get_panel_html(self):
        """Test generating panel HTML"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Get the HTML
        html = self.panel.get_panel_html()
        
        # Verify that HTML was generated
        self.assertIsInstance(html, str)
        self.assertTrue(len(html) > 0)
        
        # Check for key elements in the HTML
        self.assertIn("Error Monitoring Status", html)
        self.assertIn("tab-button", html)
        self.assertIn("overview-tab", html)
        
        loop.close()
    
    def test_handle_alert_update(self):
        """Test handling alert updates"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Create a test error
        test_error = ErrorData(
            id="test_error_alert",
            timestamp=datetime.now().isoformat(),
            level=ErrorLevel.ERROR,
            source=ErrorSource.PYTHON,
            component="test_component",
            operation="test_operation",
            message="Test alert message"
        )
        
        # Record the last updated timestamp before alert
        before_timestamp = self.panel.ui_state["lastUpdated"]
        
        # Simulate an alert by calling the handler directly
        self.panel._handle_alert_update(test_error, "test_rule")
        
        # Verify that the timestamp was updated
        self.assertGreater(self.panel.ui_state["lastUpdated"], before_timestamp)
        
        loop.close()
    
    def test_toggle_section(self):
        """Test toggling section expansion"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Toggle a section (expand it)
        result = self.panel.toggle_section("test-section")
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertTrue(result["expanded"])
        self.assertIn("test-section", self.panel.ui_state["expandedSections"])
        
        # Toggle again (collapse it)
        result = self.panel.toggle_section("test-section")
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertFalse(result["expanded"])
        self.assertNotIn("test-section", self.panel.ui_state["expandedSections"])
        
        loop.close()
    
    def test_register_callback(self):
        """Test registering callbacks"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Create a test callback
        test_callback = lambda data: None
        
        # Register the callback
        result = self.panel.register_callback("onRefresh", test_callback)
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.callbacks["onRefresh"], test_callback)
        
        # Test with invalid callback name
        result = self.panel.register_callback("invalid-callback", test_callback)
        
        # Verify the result
        self.assertFalse(result["success"])
        
        # Test with non-callable
        result = self.panel.register_callback("onRefresh", "not-callable")
        
        # Verify the result
        self.assertFalse(result["success"])
        
        loop.close()
    
    def test_unregister_callback(self):
        """Test unregistering callbacks"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Create and register a test callback
        test_callback = lambda data: None
        self.panel.register_callback("onRefresh", test_callback)
        
        # Unregister the callback
        result = self.panel.unregister_callback("onRefresh")
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertIsNone(self.panel.callbacks["onRefresh"])
        
        # Test with invalid callback name
        result = self.panel.unregister_callback("invalid-callback")
        
        # Verify the result
        self.assertFalse(result["success"])
        
        loop.close()
    
    def test_mark_error_resolved(self):
        """Test marking an error as resolved"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Mock the mark_resolved method
        async def mock_mark_resolved(error_id, resolution_info):
            return True
        
        # Create async method and add to mock
        self.mock_error_monitor.mark_resolved = mock_mark_resolved
        
        # Call the mark_error_resolved method
        result = self.panel.mark_error_resolved("test-error-id", "Test resolution note")
        
        # Verify the result
        self.assertTrue(result["success"])
        
        loop.close()
    
    def test_add_error_note(self):
        """Test adding a note to an error"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Mock the add_note method
        async def mock_add_note(error_id, note):
            return True
        
        # Create async method and add to mock
        self.mock_error_monitor.add_note = mock_add_note
        
        # Call the add_error_note method
        result = self.panel.add_error_note("test-error-id", "Test note")
        
        # Verify the result
        self.assertTrue(result["success"])
        
        loop.close()
    
    def test_export_analytics(self):
        """Test exporting analytics"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Export as JSON
        result = self.panel.export_analytics("json")
        
        # Verify the result
        self.assertTrue(result["success"])
        self.assertIn("data", result)
        self.assertTrue(len(result["data"]) > 0)
        
        # Try to parse as JSON to verify format
        try:
            json_data = json.loads(result["data"])
            self.assertIsInstance(json_data, dict)
        except json.JSONDecodeError:
            self.fail("Export data is not valid JSON")
        
        # Export as CSV
        result = self.panel.export_analytics("csv")
        
        # Verify the result
        self.assertTrue(result["success"])
        self.assertIn("data", result)
        self.assertTrue(len(result["data"]) > 0)
        self.assertIn("metric,value", result["data"])
        
        # Export with invalid format
        result = self.panel.export_analytics("invalid-format")
        
        # Verify the result
        self.assertFalse(result["success"])
        
        loop.close()
    
    def test_get_state(self):
        """Test getting panel state"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Get the state
        state = self.panel.get_state()
        
        # Verify the state
        self.assertIsInstance(state, dict)
        self.assertIn("activeTab", state)
        self.assertIn("filterSettings", state)
        self.assertIn("lastUpdated", state)
        self.assertIn("config", state)
        
        loop.close()
    
    def test_set_state(self):
        """Test setting panel state"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Create a test state
        test_state = {
            "activeTab": "errors",
            "expandedSections": ["test-section"],
            "filterSettings": {
                "errors": {
                    "level": "error",
                    "source": "python",
                    "component": "test_component",
                    "resolved": "all",
                    "timeRange": "day"
                },
                "components": {
                    "status": "all",
                    "source": "all"
                }
            }
        }
        
        # Set the state
        result = self.panel.set_state(test_state)
        
        # Verify the result and state
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.ui_state["activeTab"], "errors")
        self.assertIn("test-section", self.panel.ui_state["expandedSections"])
        self.assertEqual(self.panel.ui_state["filterSettings"]["errors"]["level"], "error")
        
        loop.close()
    
    def test_close(self):
        """Test closing the panel"""
        # Run init in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Close the panel
        close_result = loop.run_until_complete(self.panel.close())
        
        # Verify the result
        self.assertTrue(close_result["success"])
        
        loop.close()

if __name__ == '__main__':
    unittest.main()