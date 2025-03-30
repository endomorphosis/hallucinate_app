"""
Tests for the Database Synchronization Monitor

Tests the functionality of DatabaseSyncMonitor, including metrics collection,
status tracking, visualization components, and alerting.
"""

import os
import json
import time
import asyncio
import unittest
import threading
from unittest.mock import MagicMock, patch
from pathlib import Path
from datetime import datetime, timedelta
import tempfile
import shutil

# Import the module to test
from hallucinate_app.database_sync_monitor import (
    DatabaseSyncMonitor,
    SYNC_STATUS,
    ALERT_SEVERITY
)

class TestDatabaseSyncMonitor(unittest.TestCase):
    """Tests for the DatabaseSyncMonitor class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Create a temporary directory for monitor files
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
        
        # Configure the monitor
        self.resources = {
            "syncManager": self.mock_sync_manager,
            "threadPool": MagicMock()
        }
        
        self.metadata = {
            "monitorDir": self.temp_dir,
            "metricsInterval": 1,  # 1 second for faster testing
            "alertThresholds": {
                "syncFailureCount": 2,  # Alert after 2 sync failures
                "syncDelayMinutes": 10,  # Alert if sync is delayed by 10 minutes
                "conflictRateThreshold": 0.05,  # Alert if >5% of docs have conflicts
                "highErrorRateThreshold": 0.05,  # Alert if >5% of operations have errors
            },
            "retentionDays": 1,  # 1 day for faster testing
            "enableAlerts": True,
            "enableDashboard": True,
            "enableMetricsCollection": True,
            "enableRealTimeUpdates": True,
        }
        
        # Create the monitor instance
        self.monitor = DatabaseSyncMonitor(
            resources=self.resources,
            metadata=self.metadata
        )
        
        # Set up event listeners
        self.mock_sync_manager.on = MagicMock()
        self.mock_sync_manager.remove_listener = MagicMock()

    def tearDown(self):
        """Clean up after each test"""
        # Remove temporary directory
        shutil.rmtree(self.temp_dir)
    
    async def init_monitor(self):
        """Initialize the monitor for tests"""
        return await self.monitor.init()
    
    def test_initialization(self):
        """Test monitor initialization"""
        # Run the initialization
        loop = asyncio.new_event_loop()
        init_result = loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Verify initialization result
        self.assertTrue(init_result["success"])
        self.assertEqual(init_result["message"], "Database sync monitor initialized")
        
        # Verify event listeners were registered
        self.assertEqual(self.mock_sync_manager.on.call_count, 5)
        
        # Verify metrics timer was started
        self.assertIsNotNone(self.monitor.metrics_timer)
        
        # Verify update thread was started
        self.assertTrue(self.monitor.running)
        self.assertIsNotNone(self.monitor.update_thread)
        
        # Verify monitor state was initialized
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["orbitToFireproof"],
            SYNC_STATUS["COMPLETE"]
        )
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["fireproofToOrbit"],
            SYNC_STATUS["COMPLETE"]
        )
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["duckdbExport"],
            SYNC_STATUS["COMPLETE"]
        )
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["duckdbImport"],
            SYNC_STATUS["COMPLETE"]
        )
    
    def test_handle_sync_event(self):
        """Test handling sync events"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Create test event
        test_event = {
            "type": "orbit-to-fireproof",
            "stats": {
                "processed": 50,
                "updated": 45,
                "conflicts": 3,
                "errors": 2
            },
            "collections": ["test1", "test2"]
        }
        
        # Process the event
        self.monitor._handle_sync_event(test_event)
        
        # Verify status was updated
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["orbitToFireproof"],
            SYNC_STATUS["COMPLETE"]
        )
        
        # Verify metrics were updated
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["syncOperations"]["total"],
            1
        )
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["syncOperations"]["succeeded"],
            1
        )
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["conflicts"]["count"],
            3
        )
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["dataVolume"]["orbitToFireproof"],
            50
        )
        
        # Verify sync history was updated
        self.assertEqual(len(self.monitor.monitor_state["syncHistory"]), 1)
        self.assertEqual(
            self.monitor.monitor_state["syncHistory"][0]["type"],
            "orbit-to-fireproof"
        )
    
    def test_handle_error_event(self):
        """Test handling error events"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Create test error event
        test_error = {
            "type": "sync-error",
            "error": "Test error message",
            "component": "orbit-to-fireproof"
        }
        
        # Clear any existing alerts
        self.monitor.monitor_state["alerts"] = []
        
        # Process the event
        self.monitor._handle_error_event(test_error)
        
        # Verify status was updated
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["orbitToFireproof"],
            SYNC_STATUS["FAILED"]
        )
        
        # Verify metrics were updated
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["syncOperations"]["total"],
            1
        )
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["syncOperations"]["failed"],
            1
        )
        self.assertEqual(
            self.monitor.monitor_state["metrics"]["errors"]["count"],
            1
        )
        
        # Verify alert was created
        self.assertEqual(len(self.monitor.monitor_state["alerts"]), 1)
        self.assertEqual(
            self.monitor.monitor_state["alerts"][0]["severity"],
            ALERT_SEVERITY["ERROR"]
        )
        self.assertEqual(
            self.monitor.monitor_state["alerts"][0]["component"],
            "orbit-to-fireproof"
        )
    
    def test_create_and_acknowledge_alert(self):
        """Test creating and acknowledging alerts"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Clear any existing alerts
        self.monitor.monitor_state["alerts"] = []
        
        # Create a test alert
        test_alert = self.monitor._create_alert(
            severity=ALERT_SEVERITY["WARNING"],
            component="test-component",
            message="Test alert message",
            details={"test": True}
        )
        
        # Verify alert was created
        self.assertEqual(len(self.monitor.monitor_state["alerts"]), 1)
        self.assertEqual(
            self.monitor.monitor_state["alerts"][0]["severity"],
            ALERT_SEVERITY["WARNING"]
        )
        self.assertEqual(
            self.monitor.monitor_state["alerts"][0]["component"],
            "test-component"
        )
        self.assertEqual(
            self.monitor.monitor_state["alerts"][0]["message"],
            "Test alert message"
        )
        self.assertFalse(self.monitor.monitor_state["alerts"][0]["acknowledged"])
        
        # Acknowledge the alert
        result = self.monitor.acknowledge_alert(test_alert["id"])
        
        # Verify acknowledgement
        self.assertTrue(result["success"])
        self.assertTrue(self.monitor.monitor_state["alerts"][0]["acknowledged"])
        self.assertIn("acknowledgedAt", self.monitor.monitor_state["alerts"][0])
    
    def test_subscription_and_updates(self):
        """Test subscribing to updates"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Create a mock callback
        callback_data = []
        def mock_callback(update):
            callback_data.append(update)
        
        # Subscribe to status updates
        result = self.monitor.subscribe("status", mock_callback)
        self.assertTrue(result["success"])
        
        # Trigger a status update
        test_event = {
            "type": "orbit-to-fireproof",
            "stats": {
                "processed": 50,
                "updated": 45,
                "conflicts": 3,
                "errors": 2
            },
            "collections": ["test1", "test2"]
        }
        self.monitor._handle_sync_event(test_event)
        
        # Wait for the update to be processed
        time.sleep(0.1)
        
        # Verify the callback was called
        self.assertTrue(len(callback_data) > 0)
        
        # Unsubscribe
        result = self.monitor.unsubscribe("status", mock_callback)
        self.assertTrue(result["success"])
        
        # Clear callback data
        callback_data.clear()
        
        # Trigger another event
        self.monitor._handle_sync_event(test_event)
        
        # Wait for the update to be processed
        time.sleep(0.1)
        
        # Verify the callback was not called
        self.assertEqual(len(callback_data), 0)
    
    def test_metrics_collection(self):
        """Test metrics collection"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Verify metrics collection starts automatically
        self.assertIsNotNone(self.monitor.metrics_timer)
        
        # Stop and manually run metrics collection
        self.monitor.stop_metrics_collection()
        self.monitor._collect_metrics()
        
        # Verify metrics were collected
        self.assertGreater(self.monitor.monitor_state["lastUpdated"], 0)
        
        # Verify metrics file was created
        metrics_files = list(Path(self.temp_dir).glob("metrics-*.json"))
        self.assertGreater(len(metrics_files), 0)
    
    def test_get_dashboard_data(self):
        """Test retrieving dashboard data"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Clear any existing alerts and history
        self.monitor.monitor_state["alerts"] = []
        self.monitor.monitor_state["syncHistory"] = []
        
        # Create some test data
        test_event = {
            "type": "orbit-to-fireproof",
            "stats": {
                "processed": 50,
                "updated": 45,
                "conflicts": 3,
                "errors": 2
            },
            "collections": ["test1", "test2"]
        }
        self.monitor._handle_sync_event(test_event)
        
        test_alert = self.monitor._create_alert(
            severity=ALERT_SEVERITY["WARNING"],
            component="test-component",
            message="Test alert message",
            details={"test": True}
        )
        
        # Get dashboard data with limited alerts
        dashboard_data = self.monitor.get_dashboard_data()
        
        # Verify dashboard data structure
        self.assertIn("syncStatus", dashboard_data)
        self.assertIn("metrics", dashboard_data)
        self.assertIn("alerts", dashboard_data)
        self.assertIn("activeJobs", dashboard_data)
        self.assertIn("history", dashboard_data)
        self.assertIn("lastUpdated", dashboard_data)
        
        # Verify data content
        self.assertEqual(
            dashboard_data["syncStatus"]["orbitToFireproof"],
            SYNC_STATUS["COMPLETE"]
        )
        
        # Verify we have at least one alert
        self.assertGreaterEqual(len(dashboard_data["alerts"]), 1)
        
        # Verify the test alert is in the alerts
        test_alert_found = False
        for alert in dashboard_data["alerts"]:
            if alert["component"] == "test-component" and alert["message"] == "Test alert message":
                test_alert_found = True
                break
        self.assertTrue(test_alert_found)
    
    def test_trend_calculation(self):
        """Test trend calculation"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Add some historical data
        now = int(time.time() * 1000)
        
        # Add 10 events over the last hour
        for i in range(10):
            self.monitor.monitor_state["syncHistory"].append({
                "type": "orbit-to-fireproof" if i % 2 == 0 else "fireproof-to-orbit",
                "timestamp": now - (i * 360000),  # 6 minutes apart
                "stats": {
                    "processed": 100,
                    "updated": 95 - i,
                    "conflicts": i,
                    "errors": i // 2
                }
            })
        
        # Calculate trends
        self.monitor._calculate_sync_trends()
        
        # Verify trends were calculated
        self.assertIn("hourly", self.monitor.monitor_state["syncTrends"])
        self.assertIn("daily", self.monitor.monitor_state["syncTrends"])
        self.assertIn("weekly", self.monitor.monitor_state["syncTrends"])
        
        # Verify hourly trend data
        hourly_trends = self.monitor.monitor_state["syncTrends"]["hourly"]
        self.assertEqual(hourly_trends["count"], 10)
        self.assertIn("by_type", hourly_trends)
        self.assertEqual(
            hourly_trends["by_type"].get("orbit-to-fireproof", 0) + 
            hourly_trends["by_type"].get("fireproof-to-orbit", 0),
            10
        )
    
    def test_alert_conditions(self):
        """Test alert condition detection"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Set up a high error rate scenario
        test_event = {
            "type": "orbit-to-fireproof",
            "stats": {
                "processed": 100,
                "updated": 90,
                "conflicts": 5,
                "errors": 10  # 10% error rate, above threshold
            },
            "collections": ["test1", "test2"]
        }
        
        # Process the event
        self.monitor._handle_sync_event(test_event)
        
        # Check alert conditions
        self.monitor._check_alert_conditions("orbit-to-fireproof", test_event["stats"])
        
        # Verify an alert was created for high error rate
        alerts = self.monitor.get_recent_alerts()
        self.assertGreater(len(alerts), 0)
        self.assertTrue(any("High error rate" in a["message"] for a in alerts))
    
    def test_sync_delay_alerts(self):
        """Test sync delay alert detection"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Set up a delayed sync scenario
        now = int(time.time() * 1000)
        delay_threshold = self.metadata["alertThresholds"]["syncDelayMinutes"] * 60 * 1000
        
        # Make the last sync time older than the threshold
        self.mock_sync_manager.sync_state["lastOrbitDBSync"] = now - (delay_threshold * 2)
        
        # Check for delay alerts
        self.monitor._check_sync_delay_alerts()
        
        # Verify an alert was created for sync delay
        alerts = self.monitor.get_recent_alerts()
        self.assertGreater(len(alerts), 0)
        self.assertTrue(any("sync delayed" in a["message"].lower() for a in alerts))
    
    def test_status_monitoring(self):
        """Test overall status monitoring"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Set various component statuses
        with self.monitor.lock:
            self.monitor.monitor_state["syncStatus"]["orbitToFireproof"] = SYNC_STATUS["COMPLETE"]
            self.monitor.monitor_state["syncStatus"]["fireproofToOrbit"] = SYNC_STATUS["RUNNING"]
            self.monitor.monitor_state["syncStatus"]["duckdbExport"] = SYNC_STATUS["COMPLETE"]
            self.monitor.monitor_state["syncStatus"]["duckdbImport"] = SYNC_STATUS["COMPLETE"]
            
            # Update overall status
            self.monitor._update_overall_status()
        
        # Verify overall status reflects the RUNNING component
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["overall"],
            SYNC_STATUS["RUNNING"]
        )
        
        # Set a failed status
        with self.monitor.lock:
            self.monitor.monitor_state["syncStatus"]["fireproofToOrbit"] = SYNC_STATUS["FAILED"]
            
            # Update overall status
            self.monitor._update_overall_status()
        
        # Verify overall status reflects the FAILED component
        self.assertEqual(
            self.monitor.monitor_state["syncStatus"]["overall"],
            SYNC_STATUS["FAILED"]
        )
    
    def test_saving_and_loading_state(self):
        """Test saving and loading monitor state"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Add some test data
        test_event = {
            "type": "orbit-to-fireproof",
            "stats": {
                "processed": 50,
                "updated": 45,
                "conflicts": 3,
                "errors": 2
            },
            "collections": ["test1", "test2"]
        }
        self.monitor._handle_sync_event(test_event)
        
        test_alert = self.monitor._create_alert(
            severity=ALERT_SEVERITY["WARNING"],
            component="test-component",
            message="Test alert message",
            details={"test": True}
        )
        
        # Save metrics to disk
        self.monitor._save_metrics()
        
        # Verify files were created
        state_file = os.path.join(self.temp_dir, "monitor_state.json")
        self.assertTrue(os.path.exists(state_file))
        
        metrics_files = list(Path(self.temp_dir).glob("metrics-*.json"))
        self.assertGreater(len(metrics_files), 0)
        
        # Create a new monitor instance to test loading
        new_monitor = DatabaseSyncMonitor(
            resources=self.resources,
            metadata=self.metadata
        )
        
        # Initialize and load state
        loop = asyncio.new_event_loop()
        loop.run_until_complete(new_monitor._initialize_monitoring_state())
        loop.close()
        
        # Verify state was loaded
        self.assertGreater(len(new_monitor.monitor_state["syncHistory"]), 0)
        self.assertGreater(len(new_monitor.monitor_state["alerts"]), 0)
    
    def test_cleanup_old_metrics(self):
        """Test cleanup of old metrics files"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        loop.close()
        
        # Create a current metrics file
        current_date = datetime.now().strftime('%Y%m%d')
        current_file = os.path.join(self.temp_dir, f"metrics-{current_date}.json")
        with open(current_file, "w") as f:
            f.write("{}")
        
        # Create an old metrics file
        old_date = (datetime.now() - timedelta(days=2)).strftime('%Y%m%d')
        old_file = os.path.join(self.temp_dir, f"metrics-{old_date}.json")
        with open(old_file, "w") as f:
            f.write("{}")
        
        # Run cleanup
        self.monitor._cleanup_old_metrics()
        
        # Verify old file was deleted but current file remains
        self.assertTrue(os.path.exists(current_file))
        self.assertFalse(os.path.exists(old_file))
    
    def test_close(self):
        """Test proper cleanup on close"""
        # Initialize the monitor
        loop = asyncio.new_event_loop()
        loop.run_until_complete(self.init_monitor())
        
        # Close the monitor
        close_result = loop.run_until_complete(self.monitor.close())
        loop.close()
        
        # Verify close result
        self.assertTrue(close_result["success"])
        
        # Verify resources were cleaned up
        self.assertIsNone(self.monitor.metrics_timer)
        self.assertFalse(self.monitor.running)
        
        # Verify event listeners were removed
        self.assertEqual(self.mock_sync_manager.remove_listener.call_count, 5)
        
        # Verify state was saved
        state_file = os.path.join(self.temp_dir, "monitor_state.json")
        self.assertTrue(os.path.exists(state_file))

if __name__ == "__main__":
    unittest.main()