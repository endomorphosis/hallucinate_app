"""
Tests for the Database Synchronization Status Panel

Tests the functionality of DatabaseSyncStatusPanel, including UI state management,
filtering, and dashboard data generation.
"""

import os
import json
import time
import asyncio
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
from datetime import datetime, timedelta

# Import the modules to test
from hallucinate_app.dashboard.database_sync_status_panel import (
    DatabaseSyncStatusPanel
)
from hallucinate_app.database_sync_monitor import (
    DatabaseSyncMonitor, 
    SYNC_STATUS, 
    ALERT_SEVERITY
)

class TestDatabaseSyncStatusPanel(unittest.TestCase):
    """Tests for the DatabaseSyncStatusPanel class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Create a mock sync monitor
        self.mock_sync_monitor = MagicMock()
        
        # Set up mock methods
        self.mock_sync_monitor.get_sync_status.return_value = {
            "orbitToFireproof": SYNC_STATUS["COMPLETE"],
            "fireproofToOrbit": SYNC_STATUS["COMPLETE"],
            "duckdbExport": SYNC_STATUS["COMPLETE"],
            "duckdbImport": SYNC_STATUS["COMPLETE"],
            "overall": SYNC_STATUS["COMPLETE"]
        }
        
        self.mock_sync_monitor.get_sync_metrics.return_value = {
            "syncOperations": {
                "total": 10,
                "succeeded": 9,
                "failed": 1
            },
            "syncLatency": {
                "orbitToFireproof": [5000, 6000, 5500],
                "fireproofToOrbit": [4500, 5000, 4800],
                "duckdbExport": [7000, 7500, 8000],
                "duckdbImport": [6000, 6500, 7000]
            },
            "dataVolume": {
                "orbitToFireproof": 500,
                "fireproofToOrbit": 400,
                "duckdbExport": 300,
                "duckdbImport": 200
            },
            "conflicts": {
                "count": 5,
                "byCollection": {
                    "collection1": 3,
                    "collection2": 2
                }
            },
            "errors": {
                "count": 3,
                "byType": {
                    "orbit-to-fireproof": 1,
                    "fireproof-to-orbit": 1,
                    "duckdb-export": 1
                }
            }
        }
        
        self.mock_sync_monitor.get_recent_alerts.return_value = [
            {
                "id": "alert-123",
                "timestamp": int(time.time() * 1000) - 3600000,
                "severity": ALERT_SEVERITY["WARNING"],
                "component": "orbit-to-fireproof",
                "message": "High conflict rate (10%) during orbit-to-fireproof sync",
                "details": {
                    "type": "orbit-to-fireproof",
                    "conflictRate": 0.1,
                    "threshold": 0.05,
                    "conflicts": 10,
                    "total": 100
                },
                "acknowledged": False
            },
            {
                "id": "alert-124",
                "timestamp": int(time.time() * 1000) - 7200000,
                "severity": ALERT_SEVERITY["ERROR"],
                "component": "fireproof-to-orbit",
                "message": "Sync error: Connection failed",
                "details": {
                    "type": "sync-error",
                    "error": "Connection failed",
                    "component": "fireproof-to-orbit"
                },
                "acknowledged": True,
                "acknowledgedAt": int(time.time() * 1000) - 3600000
            }
        ]
        
        self.mock_sync_monitor.get_sync_history.return_value = [
            {
                "type": "orbit-to-fireproof",
                "timestamp": int(time.time() * 1000) - 3600000,
                "stats": {
                    "processed": 100,
                    "updated": 90,
                    "conflicts": 5,
                    "errors": 5
                },
                "collections": ["collection1", "collection2"]
            },
            {
                "type": "fireproof-to-orbit",
                "timestamp": int(time.time() * 1000) - 7200000,
                "stats": {
                    "processed": 80,
                    "updated": 75,
                    "conflicts": 3,
                    "errors": 2
                },
                "collections": ["collection1", "collection3"]
            },
            {
                "type": "duckdb-export",
                "timestamp": int(time.time() * 1000) - 10800000,
                "stats": {
                    "tables": 2,
                    "rows": 500,
                    "differential": 0,
                    "fullExport": 2,
                    "errors": 0
                },
                "tables": ["table1", "table2"]
            }
        ]
        
        self.mock_sync_monitor.get_active_jobs.return_value = {
            "job-123": {
                "type": "orbit-to-fireproof",
                "startTime": int(time.time() * 1000) - 60000,
                "status": "running"
            }
        }
        
        self.mock_sync_monitor.get_sync_trends.return_value = {
            "count": 10,
            "success_rate": 0.9,
            "error_rate": 0.05,
            "conflict_rate": 0.08,
            "by_type": {
                "orbit-to-fireproof": 4,
                "fireproof-to-orbit": 3,
                "duckdb-export": 2,
                "duckdb-import": 1
            },
            "data_volume": {
                "orbitToFireproof": 500,
                "fireproofToOrbit": 400,
                "duckdbExport": 300,
                "duckdbImport": 200
            }
        }
        
        self.mock_sync_monitor.acknowledge_alert.return_value = {
            "success": True,
            "message": "Alert alert-123 acknowledged"
        }
        
        self.mock_sync_monitor.subscribe = MagicMock()
        self.mock_sync_monitor.unsubscribe = MagicMock()
        
        # Configure the panel
        self.resources = {
            "syncMonitor": self.mock_sync_monitor
        }
        
        self.metadata = {
            "refreshInterval": 5000,  # 5 seconds
            "alertsLimit": 5,
            "historyLimit": 10,
            "enableRealTimeUpdates": True,
            "enableMetricsCharts": True,
            "enableStatusIcons": True,
            "enableAlertNotifications": True,
            "theme": "light"
        }
        
        # Create the panel instance
        self.panel = DatabaseSyncStatusPanel(
            resources=self.resources,
            metadata=self.metadata
        )
    
    async def init_panel(self):
        """Initialize the panel for tests"""
        return await self.panel.init()
    
    def test_initialization(self):
        """Test panel initialization"""
        # Run the initialization
        loop = asyncio.new_event_loop()
        init_result = loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Verify initialization result
        self.assertTrue(init_result["success"])
        self.assertEqual(init_result["message"], "Database sync status panel initialized")
        
        # Verify event listeners were registered
        self.assertEqual(self.mock_sync_monitor.subscribe.call_count, 3)
        
        # Verify refresh interval was set
        self.assertIsNotNone(self.panel.refresh_interval)
        
        # Verify subscriptions are active
        self.assertTrue(self.panel.subscription_active)
    
    def test_tab_selection(self):
        """Test changing active tab"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Default tab should be 'status'
        self.assertEqual(self.panel.ui_state["activeTab"], "status")
        
        # Change to 'metrics' tab
        result = self.panel.set_active_tab("metrics")
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.ui_state["activeTab"], "metrics")
        
        # Try an invalid tab
        result = self.panel.set_active_tab("invalid")
        self.assertFalse(result["success"])
        self.assertEqual(self.panel.ui_state["activeTab"], "metrics")  # Should not change
    
    def test_filter_settings(self):
        """Test changing filter settings"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Default filter should be 'all' for alerts severity
        self.assertEqual(self.panel.ui_state["filterSettings"]["alerts"]["severity"], "all")
        
        # Change alert severity filter to 'error'
        result = self.panel.set_filter("alerts", "severity", "error")
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.ui_state["filterSettings"]["alerts"]["severity"], "error")
        
        # Try an invalid filter type
        result = self.panel.set_filter("invalid", "severity", "error")
        self.assertFalse(result["success"])
        
        # Try an invalid filter name
        result = self.panel.set_filter("alerts", "invalid", "error")
        self.assertFalse(result["success"])
    
    def test_alert_acknowledgement(self):
        """Test acknowledging alerts"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Set up a mock callback
        callback_called = False
        
        def mock_callback(data):
            nonlocal callback_called
            callback_called = True
        
        # Register the callback
        self.panel.register_callback("onAlertAcknowledge", mock_callback)
        
        # Acknowledge an alert
        result = self.panel.acknowledge_alert("alert-123")
        
        # Verify acknowledge result
        self.assertTrue(result["success"])
        
        # Verify monitor's acknowledge method was called
        self.mock_sync_monitor.acknowledge_alert.assert_called_once_with("alert-123")
        
        # Verify callback was triggered
        self.assertTrue(callback_called)
    
    def test_metrics_export(self):
        """Test exporting metrics"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Export as JSON
        json_result = self.panel.export_metrics(format_type="json")
        
        # Verify JSON export result
        self.assertTrue(json_result["success"])
        self.assertIn("metrics", json.loads(json_result["data"]))
        self.assertIn("trends", json.loads(json_result["data"]))
        
        # Export as CSV
        csv_result = self.panel.export_metrics(format_type="csv")
        
        # Verify CSV export result
        self.assertTrue(csv_result["success"])
        self.assertIn("timestamp,metric,value", csv_result["data"])
        
        # Try an invalid format
        invalid_result = self.panel.export_metrics(format_type="invalid")
        self.assertFalse(invalid_result["success"])
    
    def test_section_toggle(self):
        """Test toggling sections"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Section should not be expanded initially
        self.assertNotIn("test-section", self.panel.ui_state["expandedSections"])
        
        # Expand the section
        result = self.panel.toggle_section("test-section")
        self.assertTrue(result["success"])
        self.assertTrue(result["expanded"])
        self.assertIn("test-section", self.panel.ui_state["expandedSections"])
        
        # Collapse the section
        result = self.panel.toggle_section("test-section")
        self.assertTrue(result["success"])
        self.assertFalse(result["expanded"])
        self.assertNotIn("test-section", self.panel.ui_state["expandedSections"])
    
    def test_callback_registration(self):
        """Test registering and unregistering callbacks"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Create a test callback
        def test_callback(data):
            pass
        
        # Register the callback
        result = self.panel.register_callback("onAlertAcknowledge", test_callback)
        self.assertTrue(result["success"])
        self.assertEqual(self.panel.callbacks["onAlertAcknowledge"], test_callback)
        
        # Unregister the callback
        result = self.panel.unregister_callback("onAlertAcknowledge")
        self.assertTrue(result["success"])
        self.assertIsNone(self.panel.callbacks["onAlertAcknowledge"])
        
        # Try an invalid callback name
        result = self.panel.register_callback("invalid", test_callback)
        self.assertFalse(result["success"])
        
        # Try registering a non-callable
        result = self.panel.register_callback("onAlertAcknowledge", "not-callable")
        self.assertFalse(result["success"])
    
    def test_panel_html_generation(self):
        """Test generating HTML for the panel"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Generate HTML for status tab
        self.panel.ui_state["activeTab"] = "status"
        status_html = self.panel.get_panel_html()
        
        # Verify status tab HTML contains expected elements
        self.assertIn('<div class="database-sync-panel light-theme">', status_html)
        self.assertIn('<div class="tab-content status-tab">', status_html)
        self.assertIn('Overall Status', status_html)
        self.assertIn('OrbitDB to FireproofDB', status_html)
        self.assertIn('FireproofDB to OrbitDB', status_html)
        self.assertIn('DuckDB Export', status_html)
        self.assertIn('DuckDB Import', status_html)
        self.assertIn('Active Jobs', status_html)
        
        # Generate HTML for metrics tab
        self.panel.ui_state["activeTab"] = "metrics"
        metrics_html = self.panel.get_panel_html()
        
        # Verify metrics tab HTML contains expected elements
        self.assertIn('<div class="tab-content metrics-tab">', metrics_html)
        self.assertIn('Sync Operations', metrics_html)
        self.assertIn('Conflicts', metrics_html)
        self.assertIn('Errors', metrics_html)
        self.assertIn('Data Volume', metrics_html)
        self.assertIn('Export as JSON', metrics_html)
        self.assertIn('Export as CSV', metrics_html)
        
        # Generate HTML for alerts tab
        self.panel.ui_state["activeTab"] = "alerts"
        alerts_html = self.panel.get_panel_html()
        
        # Verify alerts tab HTML contains expected elements
        self.assertIn('<div class="tab-content alerts-tab">', alerts_html)
        self.assertIn('Severity:', alerts_html)
        self.assertIn('Status:', alerts_html)
        self.assertIn('WARNING', alerts_html)
        self.assertIn('ERROR', alerts_html)
        self.assertIn('High conflict rate', alerts_html)
        self.assertIn('Sync error', alerts_html)
        self.assertIn('Acknowledge', alerts_html)
        self.assertIn('Acknowledged at', alerts_html)
        
        # Generate HTML for history tab
        self.panel.ui_state["activeTab"] = "history"
        history_html = self.panel.get_panel_html()
        
        # Verify history tab HTML contains expected elements
        self.assertIn('<div class="tab-content history-tab">', history_html)
        self.assertIn('Sync Type:', history_html)
        self.assertIn('history-type', history_html)
        self.assertIn('OrbitDB to FireproofDB', history_html)
        self.assertIn('FireproofDB to OrbitDB', history_html)
        self.assertIn('DuckDB Export', history_html)
        self.assertIn('Processed:', history_html)
        self.assertIn('Updated:', history_html)
        self.assertIn('Conflicts:', history_html)
        self.assertIn('Errors:', history_html)
        self.assertIn('Collections:', history_html)
        self.assertIn('Tables:', history_html)
    
    def test_get_and_set_state(self):
        """Test getting and setting panel state"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        loop.close()
        
        # Configure initial state
        self.panel.ui_state["activeTab"] = "alerts"
        self.panel.ui_state["expandedSections"] = {"section1", "section2"}
        self.panel.ui_state["filterSettings"]["alerts"]["severity"] = "error"
        
        # Get state
        state = self.panel.get_state()
        
        # Verify state
        self.assertEqual(state["activeTab"], "alerts")
        self.assertEqual(set(state["expandedSections"]), {"section1", "section2"})
        self.assertEqual(state["filterSettings"]["alerts"]["severity"], "error")
        
        # Change state
        new_state = {
            "activeTab": "metrics",
            "expandedSections": ["section3"],
            "filterSettings": {
                "alerts": {"severity": "warning", "acknowledged": "all"},
                "history": {"syncType": "duckdb-export"}
            }
        }
        
        # Set state
        result = self.panel.set_state(new_state)
        self.assertTrue(result["success"])
        
        # Verify changed state
        self.assertEqual(self.panel.ui_state["activeTab"], "metrics")
        self.assertEqual(self.panel.ui_state["expandedSections"], {"section3"})
        self.assertEqual(self.panel.ui_state["filterSettings"]["alerts"]["severity"], "warning")
        self.assertEqual(self.panel.ui_state["filterSettings"]["history"]["syncType"], "duckdb-export")
    
    def test_close(self):
        """Test closing the panel"""
        # Initialize the panel
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_panel())
        
        # Close the panel
        close_result = loop.run_until_complete(self.panel.close())
        loop.close()
        
        # Verify close result
        self.assertTrue(close_result["success"])
        
        # Verify resources were cleaned up
        self.assertIsNone(self.panel.refresh_interval)
        self.assertFalse(self.panel.subscription_active)
        
        # Verify unsubscribe was called
        self.assertEqual(self.mock_sync_monitor.unsubscribe.call_count, 3)

if __name__ == "__main__":
    unittest.main()