"""
Database Synchronization Monitor

Provides real-time monitoring of synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD.
Implements metrics collection, status tracking, visualization components, and alerting.
"""

import os
import json
import time
import logging
import threading
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Set, Union, Optional, Any, Callable
from pathlib import Path
import queue

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_sync_monitor")

# Sync status constants
SYNC_STATUS = {
    "UNKNOWN": "unknown",
    "INITIALIZING": "initializing",
    "RUNNING": "running",
    "IDLE": "idle",
    "FAILED": "failed",
    "CONFLICTED": "conflicted",
    "PARTIAL": "partial",
    "COMPLETE": "complete"
}

# Alert severity levels
ALERT_SEVERITY = {
    "INFO": "info",
    "WARNING": "warning",
    "ERROR": "error",
    "CRITICAL": "critical"
}

class DatabaseSyncMonitor:
    """
    Monitors database synchronization operations and provides real-time status tracking,
    metrics collection, visualization, and alerting for synchronization issues.
    
    Integrates with the DatabaseSyncManager to track all synchronization operations
    and provides a dashboard interface for monitoring sync status.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the sync monitor with resources and metadata
        
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
            raise ValueError("SyncManager resource is required for DatabaseSyncMonitor")
        
        # Optional thread pool for parallel processing
        self.thread_pool = resources.get("threadPool")
        
        # Configuration options
        home_dir = os.path.expanduser("~")
        self.config = {
            "monitorDir": metadata.get("monitorDir", os.path.join(home_dir, ".hallucinate_app", "sync_monitor")),
            "metricsInterval": metadata.get("metricsInterval", 60),  # Default: 1 minute
            "alertThresholds": metadata.get("alertThresholds", {
                "syncFailureCount": 3,  # Alert after 3 sync failures
                "syncDelayMinutes": 30,  # Alert if sync is delayed by 30 minutes
                "conflictRateThreshold": 0.1,  # Alert if >10% of docs have conflicts
                "highErrorRateThreshold": 0.05,  # Alert if >5% of operations have errors
            }),
            "retentionDays": metadata.get("retentionDays", 14),  # Default: 14 days
            "enableAlerts": metadata.get("enableAlerts", True),
            "enableDashboard": metadata.get("enableDashboard", True),
            "enableMetricsCollection": metadata.get("enableMetricsCollection", True),
            "enableRealTimeUpdates": metadata.get("enableRealTimeUpdates", True),
        }
        
        # Monitoring state
        self.monitor_state = {
            "syncStatus": {
                "orbitToFireproof": SYNC_STATUS["UNKNOWN"],
                "fireproofToOrbit": SYNC_STATUS["UNKNOWN"],
                "duckdbExport": SYNC_STATUS["UNKNOWN"],
                "duckdbImport": SYNC_STATUS["UNKNOWN"],
                "overall": SYNC_STATUS["UNKNOWN"]
            },
            "lastUpdated": 0,
            "activeJobs": {},
            "metrics": {
                "syncOperations": {
                    "total": 0,
                    "succeeded": 0,
                    "failed": 0
                },
                "syncLatency": {
                    "orbitToFireproof": [],
                    "fireproofToOrbit": [],
                    "duckdbExport": [],
                    "duckdbImport": []
                },
                "dataVolume": {
                    "orbitToFireproof": 0,
                    "fireproofToOrbit": 0,
                    "duckdbExport": 0,
                    "duckdbImport": 0
                },
                "conflicts": {
                    "count": 0,
                    "byCollection": {}
                },
                "errors": {
                    "count": 0,
                    "byType": {}
                }
            },
            "alerts": [],
            "syncHistory": [],
            "syncTrends": {
                "hourly": {},
                "daily": {},
                "weekly": {}
            }
        }
        
        # Metrics collection timer
        self.metrics_timer = None
        
        # Event subscribers
        self.subscribers = {
            "status": set(),
            "metrics": set(),
            "alerts": set()
        }
        
        # Thread lock for synchronization
        self.lock = threading.Lock()
        
        # Thread-safe queue for real-time updates
        self.update_queue = queue.Queue()
        
        # Update thread
        self.update_thread = None
        self.running = False
        
    async def init(self):
        """
        Initialize the sync monitor
        
        Returns:
            dict: Initialization result
        """
        try:
            # Create monitor directory if it doesn't exist
            os.makedirs(self.config["monitorDir"], exist_ok=True)
            
            # Register sync manager event listeners 
            sync_manager = self.resources["syncManager"]
            
            # Listen for sync events
            sync_manager.on("sync", self._handle_sync_event)
            sync_manager.on("error", self._handle_error_event)
            sync_manager.on("change", self._handle_change_event)
            sync_manager.on("duckdb-export", self._handle_duckdb_export_event)
            sync_manager.on("duckdb-import", self._handle_duckdb_import_event)
            
            # Start metrics collection timer
            if self.config["enableMetricsCollection"]:
                self.start_metrics_collection()
            
            # Start real-time updates if enabled
            if self.config["enableRealTimeUpdates"]:
                self.start_update_thread()
            
            # Initialize monitoring state
            await self._initialize_monitoring_state()
            
            logger.info("Database sync monitor initialized")
            return {"success": True, "message": "Database sync monitor initialized"}
            
        except Exception as e:
            logger.error(f"Failed to initialize database sync monitor: {str(e)}")
            raise ValueError(f"DatabaseSyncMonitor initialization failed: {str(e)}")
    
    async def test(self):
        """
        Test sync monitoring functionality
        
        Returns:
            dict: Test results
        """
        try:
            # Generate a test sync event
            test_event = {
                "type": "orbit-to-fireproof",
                "stats": {
                    "processed": 10,
                    "updated": 8,
                    "conflicts": 1,
                    "errors": 1
                },
                "collections": ["test_collection"]
            }
            
            # Process the test event
            self._handle_sync_event(test_event)
            
            # Generate a test error
            test_error = {
                "type": "sync-error",
                "error": "Test error message",
                "component": "orbit-to-fireproof"
            }
            
            # Process the test error
            self._handle_error_event(test_error)
            
            # Generate a test alert
            test_alert = self._create_alert(
                severity=ALERT_SEVERITY["WARNING"],
                component="test",
                message="Test alert message",
                details={"test": True}
            )
            
            return {
                "success": True,
                "message": "Database sync monitor test completed successfully",
                "state": {
                    "syncStatus": self.monitor_state["syncStatus"],
                    "syncOperations": self.monitor_state["metrics"]["syncOperations"],
                    "alertCount": len(self.monitor_state["alerts"]),
                    "testAlert": test_alert
                }
            }
        except Exception as e:
            logger.error(f"Database sync monitor test failed: {str(e)}")
            return {
                "success": False,
                "message": f"Database sync monitor test failed: {str(e)}",
                "error": str(e)
            }
    
    def start_metrics_collection(self):
        """
        Start metrics collection at regular intervals
        
        Returns:
            dict: Start result
        """
        if self.metrics_timer:
            self.metrics_timer.cancel()
            
        def collect_metrics():
            try:
                self._collect_metrics()
            except Exception as e:
                logger.error(f"Error collecting metrics: {str(e)}")
            
            # Reschedule the task
            self.metrics_timer = threading.Timer(self.config["metricsInterval"], collect_metrics)
            self.metrics_timer.daemon = True
            self.metrics_timer.start()
            
        # Start the first collection
        self.metrics_timer = threading.Timer(self.config["metricsInterval"], collect_metrics)
        self.metrics_timer.daemon = True
        self.metrics_timer.start()
        
        return {"success": True, "message": "Metrics collection started"}
    
    def stop_metrics_collection(self):
        """
        Stop metrics collection
        
        Returns:
            dict: Stop result
        """
        if self.metrics_timer:
            self.metrics_timer.cancel()
            self.metrics_timer = None
            
        return {"success": True, "message": "Metrics collection stopped"}
    
    def start_update_thread(self):
        """
        Start thread for processing real-time updates
        
        Returns:
            dict: Start result
        """
        if self.update_thread and self.update_thread.is_alive():
            return {"success": False, "message": "Update thread already running"}
        
        self.running = True
        
        def update_worker():
            while self.running:
                try:
                    # Get update from queue with timeout
                    update = self.update_queue.get(timeout=1.0)
                    
                    # Process update
                    update_type = update.get("type")
                    
                    # Notify subscribers
                    if update_type in self.subscribers:
                        for callback in self.subscribers[update_type]:
                            try:
                                callback(update)
                            except Exception as callback_error:
                                logger.error(f"Error in subscriber callback: {str(callback_error)}")
                    
                    # Mark as done
                    self.update_queue.task_done()
                    
                except queue.Empty:
                    # No updates in queue, just continue
                    pass
                except Exception as e:
                    logger.error(f"Error in update thread: {str(e)}")
                    # Sleep a bit to avoid tight loop on error
                    time.sleep(1.0)
        
        # Start update thread
        self.update_thread = threading.Thread(target=update_worker, daemon=True)
        self.update_thread.start()
        
        return {"success": True, "message": "Update thread started"}
    
    def stop_update_thread(self):
        """
        Stop the update thread
        
        Returns:
            dict: Stop result
        """
        self.running = False
        
        if self.update_thread:
            self.update_thread.join(timeout=2.0)
            self.update_thread = None
            
        return {"success": True, "message": "Update thread stopped"}
    
    def subscribe(self, update_type, callback):
        """
        Subscribe to real-time updates
        
        Args:
            update_type (str): Type of updates to subscribe to ('status', 'metrics', 'alerts')
            callback (callable): Callback function to receive updates
            
        Returns:
            dict: Subscription result
        """
        if update_type not in self.subscribers:
            return {"success": False, "message": f"Invalid update type: {update_type}"}
        
        if not callable(callback):
            return {"success": False, "message": "Callback must be callable"}
        
        with self.lock:
            self.subscribers[update_type].add(callback)
            
        return {"success": True, "message": f"Subscribed to {update_type} updates"}
    
    def unsubscribe(self, update_type, callback):
        """
        Unsubscribe from real-time updates
        
        Args:
            update_type (str): Type of updates to unsubscribe from
            callback (callable): Callback function to remove
            
        Returns:
            dict: Unsubscription result
        """
        if update_type not in self.subscribers:
            return {"success": False, "message": f"Invalid update type: {update_type}"}
        
        with self.lock:
            if callback in self.subscribers[update_type]:
                self.subscribers[update_type].remove(callback)
                
        return {"success": True, "message": f"Unsubscribed from {update_type} updates"}
    
    def get_sync_status(self):
        """
        Get current sync status
        
        Returns:
            dict: Current sync status
        """
        with self.lock:
            status_copy = self.monitor_state["syncStatus"].copy()
            
        return status_copy
    
    def get_sync_metrics(self):
        """
        Get current sync metrics
        
        Returns:
            dict: Current sync metrics
        """
        with self.lock:
            # Make a deep copy to avoid external modification
            metrics_copy = json.loads(json.dumps(self.monitor_state["metrics"]))
            
        return metrics_copy
    
    def get_recent_alerts(self, count=10):
        """
        Get recent alerts
        
        Args:
            count (int): Number of alerts to return (default: 10)
            
        Returns:
            list: Recent alerts
        """
        with self.lock:
            # Return most recent 'count' alerts
            alerts_copy = json.loads(json.dumps(self.monitor_state["alerts"][-count:]))
            
        return alerts_copy
    
    def get_sync_history(self, days=1):
        """
        Get sync history for the specified number of days
        
        Args:
            days (int): Number of days of history to return (default: 1)
            
        Returns:
            list: Sync history
        """
        with self.lock:
            # Calculate timestamp for 'days' ago
            cutoff_time = int((datetime.now() - timedelta(days=days)).timestamp() * 1000)
            
            # Filter history by timestamp
            filtered_history = [
                entry for entry in self.monitor_state["syncHistory"]
                if entry.get("timestamp", 0) >= cutoff_time
            ]
            
            # Return copy to avoid external modification
            history_copy = json.loads(json.dumps(filtered_history))
            
        return history_copy
    
    def get_sync_trends(self, period="hourly"):
        """
        Get sync trends for the specified period
        
        Args:
            period (str): Trend period ('hourly', 'daily', 'weekly')
            
        Returns:
            dict: Sync trends
        """
        with self.lock:
            if period in self.monitor_state["syncTrends"]:
                # Return copy to avoid external modification
                trends_copy = json.loads(json.dumps(self.monitor_state["syncTrends"][period]))
                return trends_copy
            else:
                return {}
    
    def get_active_jobs(self):
        """
        Get currently active sync jobs
        
        Returns:
            dict: Active sync jobs
        """
        with self.lock:
            # Return copy to avoid external modification
            jobs_copy = json.loads(json.dumps(self.monitor_state["activeJobs"]))
            
        return jobs_copy
    
    def get_dashboard_data(self):
        """
        Get comprehensive data for dashboard display
        
        Returns:
            dict: Dashboard data
        """
        with self.lock:
            dashboard_data = {
                "syncStatus": self.monitor_state["syncStatus"].copy(),
                "metrics": json.loads(json.dumps(self.monitor_state["metrics"])),
                "alerts": self.monitor_state["alerts"][-5:],  # Last 5 alerts
                "activeJobs": json.loads(json.dumps(self.monitor_state["activeJobs"])),
                "history": {
                    "recent": self.monitor_state["syncHistory"][-10:],  # Last 10 sync events
                    "trends": {
                        "hourly": self.monitor_state["syncTrends"].get("hourly", {}),
                        "daily": self.monitor_state["syncTrends"].get("daily", {})
                    }
                },
                "lastUpdated": self.monitor_state["lastUpdated"]
            }
        
        return dashboard_data
    
    def update_dashboard(self):
        """
        Push updates to dashboard
        
        Returns:
            dict: Update result
        """
        try:
            # Get dashboard data
            dashboard_data = self.get_dashboard_data()
            
            # Queue update for subscribers
            self.update_queue.put({
                "type": "status",
                "data": dashboard_data,
                "timestamp": int(time.time() * 1000)
            })
            
            return {"success": True, "message": "Dashboard update queued"}
        except Exception as e:
            logger.error(f"Error updating dashboard: {str(e)}")
            return {"success": False, "message": f"Error updating dashboard: {str(e)}"}
    
    def _handle_sync_event(self, event):
        """
        Handle synchronization events from the sync manager
        
        Args:
            event (dict): Sync event data
        """
        sync_type = event.get("type")
        stats = event.get("stats", {})
        
        with self.lock:
            # Update sync status
            if sync_type == "orbit-to-fireproof":
                self.monitor_state["syncStatus"]["orbitToFireproof"] = SYNC_STATUS["COMPLETE"]
            elif sync_type == "fireproof-to-orbit":
                self.monitor_state["syncStatus"]["fireproofToOrbit"] = SYNC_STATUS["COMPLETE"]
            elif sync_type == "duckdb-export":
                self.monitor_state["syncStatus"]["duckdbExport"] = SYNC_STATUS["COMPLETE"]
            elif sync_type == "duckdb-import":
                self.monitor_state["syncStatus"]["duckdbImport"] = SYNC_STATUS["COMPLETE"]
            
            # Update metrics
            self.monitor_state["metrics"]["syncOperations"]["total"] += 1
            self.monitor_state["metrics"]["syncOperations"]["succeeded"] += 1
            
            # Update conflict metrics
            conflicts = stats.get("conflicts", 0)
            if conflicts > 0:
                self.monitor_state["metrics"]["conflicts"]["count"] += conflicts
                
                # Update conflicts by collection
                for collection in event.get("collections", []):
                    if collection not in self.monitor_state["metrics"]["conflicts"]["byCollection"]:
                        self.monitor_state["metrics"]["conflicts"]["byCollection"][collection] = 0
                    
                    # Distribute conflicts evenly across collections for now
                    # In a real system, we'd have per-collection conflict counts
                    self.monitor_state["metrics"]["conflicts"]["byCollection"][collection] += conflicts / len(event.get("collections", [1]))
            
            # Update data volume metrics
            processed = stats.get("processed", 0)
            if sync_type == "orbit-to-fireproof":
                self.monitor_state["metrics"]["dataVolume"]["orbitToFireproof"] += processed
            elif sync_type == "fireproof-to-orbit":
                self.monitor_state["metrics"]["dataVolume"]["fireproofToOrbit"] += processed
            elif sync_type == "duckdb-export":
                self.monitor_state["metrics"]["dataVolume"]["duckdbExport"] += stats.get("rows", 0)
            elif sync_type == "duckdb-import":
                self.monitor_state["metrics"]["dataVolume"]["duckdbImport"] += stats.get("rows", 0)
                
            # Add to sync history
            self.monitor_state["syncHistory"].append({
                "type": sync_type,
                "timestamp": int(time.time() * 1000),
                "stats": stats
            })
            
            # Limit history size
            max_history = 1000  # Keep last 1000 entries
            if len(self.monitor_state["syncHistory"]) > max_history:
                self.monitor_state["syncHistory"] = self.monitor_state["syncHistory"][-max_history:]
            
            # Update last updated timestamp
            self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Update overall status
            self._update_overall_status()
        
        # Check for alert conditions
        if self.config["enableAlerts"]:
            self._check_alert_conditions(sync_type, stats)
        
        # Queue update for subscribers
        self.update_queue.put({
            "type": "status",
            "data": {
                "type": sync_type,
                "status": SYNC_STATUS["COMPLETE"],
                "stats": stats,
                "timestamp": int(time.time() * 1000)
            }
        })
    
    def _handle_error_event(self, event):
        """
        Handle error events from the sync manager
        
        Args:
            event (dict): Error event data
        """
        error_type = event.get("type")
        error_msg = event.get("error", "Unknown error")
        component = event.get("component", "unknown")
        
        with self.lock:
            # Update sync status
            if "orbit-to-fireproof" in error_type or component == "orbit-to-fireproof":
                self.monitor_state["syncStatus"]["orbitToFireproof"] = SYNC_STATUS["FAILED"]
            elif "fireproof-to-orbit" in error_type or component == "fireproof-to-orbit":
                self.monitor_state["syncStatus"]["fireproofToOrbit"] = SYNC_STATUS["FAILED"]
            elif "duckdb-export" in error_type or component == "duckdb-export":
                self.monitor_state["syncStatus"]["duckdbExport"] = SYNC_STATUS["FAILED"]
            elif "duckdb-import" in error_type or component == "duckdb-import":
                self.monitor_state["syncStatus"]["duckdbImport"] = SYNC_STATUS["FAILED"]
            
            # Update metrics
            self.monitor_state["metrics"]["syncOperations"]["total"] += 1
            self.monitor_state["metrics"]["syncOperations"]["failed"] += 1
            
            # Update error metrics
            self.monitor_state["metrics"]["errors"]["count"] += 1
            
            # Track error by type
            error_type_key = component or error_type or "unknown"
            if error_type_key not in self.monitor_state["metrics"]["errors"]["byType"]:
                self.monitor_state["metrics"]["errors"]["byType"][error_type_key] = 0
            self.monitor_state["metrics"]["errors"]["byType"][error_type_key] += 1
            
            # Update last updated timestamp
            self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Update overall status
            self._update_overall_status()
        
        # Create an alert for the error
        if self.config["enableAlerts"]:
            self._create_alert(
                severity=ALERT_SEVERITY["ERROR"],
                component=component or error_type,
                message=f"Sync error: {error_msg}",
                details=event
            )
        
        # Queue update for subscribers
        self.update_queue.put({
            "type": "status",
            "data": {
                "type": error_type,
                "status": SYNC_STATUS["FAILED"],
                "error": error_msg,
                "component": component,
                "timestamp": int(time.time() * 1000)
            }
        })
    
    def _handle_change_event(self, event):
        """
        Handle database change events
        
        Args:
            event (dict): Change event data
        """
        change_type = event.get("type")
        
        with self.lock:
            # For OrbitDB and FireproofDB changes, mark the corresponding sync as partial
            if change_type == "orbitdb":
                self.monitor_state["syncStatus"]["orbitToFireproof"] = SYNC_STATUS["PARTIAL"]
            elif change_type == "fireproofdb":
                self.monitor_state["syncStatus"]["fireproofToOrbit"] = SYNC_STATUS["PARTIAL"]
            elif change_type == "duckdb":
                self.monitor_state["syncStatus"]["duckdbExport"] = SYNC_STATUS["PARTIAL"]
            
            # Update last updated timestamp
            self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Update overall status
            self._update_overall_status()
        
        # No need to queue an update here as these are high-frequency events
    
    def _handle_duckdb_export_event(self, event):
        """
        Handle DuckDB export events
        
        Args:
            event (dict): Export event data
        """
        stats = event.get("stats", {})
        tables = event.get("tables", {})
        
        with self.lock:
            # Update sync status
            self.monitor_state["syncStatus"]["duckdbExport"] = SYNC_STATUS["COMPLETE"]
            
            # Update metrics
            self.monitor_state["metrics"]["syncOperations"]["total"] += 1
            self.monitor_state["metrics"]["syncOperations"]["succeeded"] += 1
            
            # Update data volume metrics
            self.monitor_state["metrics"]["dataVolume"]["duckdbExport"] += stats.get("rows", 0)
            
            # Add to sync history
            self.monitor_state["syncHistory"].append({
                "type": "duckdb-export",
                "timestamp": int(time.time() * 1000),
                "stats": stats,
                "tables": list(tables.keys())
            })
            
            # Limit history size
            max_history = 1000  # Keep last 1000 entries
            if len(self.monitor_state["syncHistory"]) > max_history:
                self.monitor_state["syncHistory"] = self.monitor_state["syncHistory"][-max_history:]
            
            # Update last updated timestamp
            self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Update overall status
            self._update_overall_status()
        
        # Queue update for subscribers
        self.update_queue.put({
            "type": "status",
            "data": {
                "type": "duckdb-export",
                "status": SYNC_STATUS["COMPLETE"],
                "stats": stats,
                "tables": list(tables.keys()),
                "timestamp": int(time.time() * 1000)
            }
        })
    
    def _handle_duckdb_import_event(self, event):
        """
        Handle DuckDB import events
        
        Args:
            event (dict): Import event data
        """
        stats = event.get("stats", {})
        tables = event.get("tables", {})
        
        with self.lock:
            # Update sync status
            self.monitor_state["syncStatus"]["duckdbImport"] = SYNC_STATUS["COMPLETE"]
            
            # Update metrics
            self.monitor_state["metrics"]["syncOperations"]["total"] += 1
            self.monitor_state["metrics"]["syncOperations"]["succeeded"] += 1
            
            # Update data volume metrics
            self.monitor_state["metrics"]["dataVolume"]["duckdbImport"] += stats.get("rows", 0)
            
            # Add to sync history
            self.monitor_state["syncHistory"].append({
                "type": "duckdb-import",
                "timestamp": int(time.time() * 1000),
                "stats": stats,
                "tables": list(tables.keys())
            })
            
            # Limit history size
            max_history = 1000  # Keep last 1000 entries
            if len(self.monitor_state["syncHistory"]) > max_history:
                self.monitor_state["syncHistory"] = self.monitor_state["syncHistory"][-max_history:]
            
            # Update last updated timestamp
            self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Update overall status
            self._update_overall_status()
        
        # Queue update for subscribers
        self.update_queue.put({
            "type": "status",
            "data": {
                "type": "duckdb-import",
                "status": SYNC_STATUS["COMPLETE"],
                "stats": stats,
                "tables": list(tables.keys()),
                "timestamp": int(time.time() * 1000)
            }
        })
    
    def _update_overall_status(self):
        """
        Update the overall sync status based on component statuses
        """
        # Get individual statuses
        orbit_to_fireproof = self.monitor_state["syncStatus"]["orbitToFireproof"]
        fireproof_to_orbit = self.monitor_state["syncStatus"]["fireproofToOrbit"]
        duckdb_export = self.monitor_state["syncStatus"]["duckdbExport"]
        duckdb_import = self.monitor_state["syncStatus"]["duckdbImport"]
        
        # Set overall status based on component statuses
        if SYNC_STATUS["FAILED"] in [orbit_to_fireproof, fireproof_to_orbit, duckdb_export, duckdb_import]:
            overall = SYNC_STATUS["FAILED"]
        elif SYNC_STATUS["RUNNING"] in [orbit_to_fireproof, fireproof_to_orbit, duckdb_export, duckdb_import]:
            overall = SYNC_STATUS["RUNNING"]
        elif SYNC_STATUS["PARTIAL"] in [orbit_to_fireproof, fireproof_to_orbit, duckdb_export, duckdb_import]:
            overall = SYNC_STATUS["PARTIAL"]
        elif SYNC_STATUS["UNKNOWN"] in [orbit_to_fireproof, fireproof_to_orbit, duckdb_export, duckdb_import]:
            overall = SYNC_STATUS["UNKNOWN"]
        elif SYNC_STATUS["INITIALIZING"] in [orbit_to_fireproof, fireproof_to_orbit, duckdb_export, duckdb_import]:
            overall = SYNC_STATUS["INITIALIZING"]
        elif SYNC_STATUS["CONFLICTED"] in [orbit_to_fireproof, fireproof_to_orbit]:
            overall = SYNC_STATUS["CONFLICTED"]
        elif all(status == SYNC_STATUS["COMPLETE"] for status in [orbit_to_fireproof, fireproof_to_orbit, duckdb_export, duckdb_import]):
            overall = SYNC_STATUS["COMPLETE"]
        else:
            overall = SYNC_STATUS["IDLE"]
        
        # Update overall status
        self.monitor_state["syncStatus"]["overall"] = overall
    
    def _collect_metrics(self):
        """
        Collect and aggregate metrics from the sync manager
        """
        try:
            sync_manager = self.resources["syncManager"]
            
            # Access sync state from the sync manager
            sync_state = sync_manager.sync_state
            
            with self.lock:
                # Update active jobs
                self.monitor_state["activeJobs"] = json.loads(json.dumps(sync_state.get("activeJobs", {})))
                
                # Calculate latency metrics if we have historical data
                if len(sync_state.get("syncHistory", [])) > 0:
                    # Group by sync type
                    history_by_type = {}
                    for entry in sync_state.get("syncHistory", []):
                        entry_type = entry.get("type")
                        if entry_type:
                            if entry_type not in history_by_type:
                                history_by_type[entry_type] = []
                            history_by_type[entry_type].append(entry)
                    
                    # Calculate latency for each type
                    for sync_type, entries in history_by_type.items():
                        # Sort by timestamp
                        entries.sort(key=lambda x: x.get("timestamp", 0))
                        
                        # Calculate time between syncs
                        latencies = []
                        for i in range(1, len(entries)):
                            latency = entries[i].get("timestamp", 0) - entries[i-1].get("timestamp", 0)
                            latencies.append(latency)
                        
                        # Store latencies
                        if sync_type == "orbit-to-fireproof" and latencies:
                            self.monitor_state["metrics"]["syncLatency"]["orbitToFireproof"] = latencies[-10:]  # Last 10 latencies
                        elif sync_type == "fireproof-to-orbit" and latencies:
                            self.monitor_state["metrics"]["syncLatency"]["fireproofToOrbit"] = latencies[-10:]
                        elif sync_type == "duckdb-export" and latencies:
                            self.monitor_state["metrics"]["syncLatency"]["duckdbExport"] = latencies[-10:]
                        elif sync_type == "duckdb-import" and latencies:
                            self.monitor_state["metrics"]["syncLatency"]["duckdbImport"] = latencies[-10:]
                
                # Calculate sync trends
                if len(self.monitor_state["syncHistory"]) > 0:
                    self._calculate_sync_trends()
                
                # Update last updated timestamp
                self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Queue metrics update for subscribers
            self.update_queue.put({
                "type": "metrics",
                "data": self.get_sync_metrics(),
                "timestamp": int(time.time() * 1000)
            })
            
            # Check for alert conditions
            if self.config["enableAlerts"]:
                self._check_sync_delay_alerts()
                self._check_error_rate_alerts()
            
            # Update dashboard if enabled
            if self.config["enableDashboard"]:
                self.update_dashboard()
            
            # Save metrics to disk periodically
            self._save_metrics()
            
            return True
        except Exception as e:
            logger.error(f"Error collecting metrics: {str(e)}")
            return False
    
    def _calculate_sync_trends(self):
        """
        Calculate sync trends from historical data
        """
        try:
            # Define time periods
            now = int(time.time() * 1000)
            hour_ago = now - (60 * 60 * 1000)
            day_ago = now - (24 * 60 * 60 * 1000)
            week_ago = now - (7 * 24 * 60 * 60 * 1000)
            
            # Filter history by time period
            hourly_history = [e for e in self.monitor_state["syncHistory"] if e.get("timestamp", 0) >= hour_ago]
            daily_history = [e for e in self.monitor_state["syncHistory"] if e.get("timestamp", 0) >= day_ago]
            weekly_history = [e for e in self.monitor_state["syncHistory"] if e.get("timestamp", 0) >= week_ago]
            
            # Calculate hourly trends
            hourly_trends = self._calculate_trend_metrics(hourly_history)
            
            # Calculate daily trends
            daily_trends = self._calculate_trend_metrics(daily_history)
            
            # Calculate weekly trends
            weekly_trends = self._calculate_trend_metrics(weekly_history)
            
            # Update trends in monitor state
            self.monitor_state["syncTrends"]["hourly"] = hourly_trends
            self.monitor_state["syncTrends"]["daily"] = daily_trends
            self.monitor_state["syncTrends"]["weekly"] = weekly_trends
            
        except Exception as e:
            logger.error(f"Error calculating sync trends: {str(e)}")
    
    def _calculate_trend_metrics(self, history):
        """
        Calculate trend metrics from a list of sync history entries
        
        Args:
            history (list): List of sync history entries
            
        Returns:
            dict: Trend metrics
        """
        # Initialize trend metrics
        trend_metrics = {
            "count": len(history),
            "success_rate": 0.0,
            "error_rate": 0.0,
            "conflict_rate": 0.0,
            "by_type": {},
            "data_volume": {
                "orbitToFireproof": 0,
                "fireproofToOrbit": 0,
                "duckdbExport": 0,
                "duckdbImport": 0
            }
        }
        
        # Group by sync type
        by_type = {}
        total_errors = 0
        total_conflicts = 0
        
        for entry in history:
            entry_type = entry.get("type")
            stats = entry.get("stats", {})
            
            # Count by type
            if entry_type not in by_type:
                by_type[entry_type] = 0
            by_type[entry_type] += 1
            
            # Count errors and conflicts
            total_errors += stats.get("errors", 0)
            total_conflicts += stats.get("conflicts", 0)
            
            # Sum data volume
            if entry_type == "orbit-to-fireproof":
                trend_metrics["data_volume"]["orbitToFireproof"] += stats.get("processed", 0)
            elif entry_type == "fireproof-to-orbit":
                trend_metrics["data_volume"]["fireproofToOrbit"] += stats.get("processed", 0)
            elif entry_type == "duckdb-export":
                trend_metrics["data_volume"]["duckdbExport"] += stats.get("rows", 0)
            elif entry_type == "duckdb-import":
                trend_metrics["data_volume"]["duckdbImport"] += stats.get("rows", 0)
        
        # Calculate rates
        if trend_metrics["count"] > 0:
            success_count = len([e for e in history if e.get("status", "") == SYNC_STATUS["COMPLETE"]])
            trend_metrics["success_rate"] = success_count / trend_metrics["count"]
            
            # Get processed docs count for calculating rates
            total_processed = sum(
                entry.get("stats", {}).get("processed", 0)
                for entry in history
                if "processed" in entry.get("stats", {})
            )
            
            if total_processed > 0:
                trend_metrics["error_rate"] = total_errors / total_processed
                trend_metrics["conflict_rate"] = total_conflicts / total_processed
        
        # Add by type counts
        trend_metrics["by_type"] = by_type
        
        return trend_metrics
    
    def _check_alert_conditions(self, sync_type, stats):
        """
        Check for conditions that should trigger alerts
        
        Args:
            sync_type (str): Sync operation type
            stats (dict): Sync operation stats
        """
        try:
            # Check for high error rate
            total = stats.get("processed", 0)
            errors = stats.get("errors", 0)
            
            if total > 0:
                error_rate = errors / total
                error_threshold = self.config["alertThresholds"]["highErrorRateThreshold"]
                
                if error_rate > error_threshold:
                    # Create alert for high error rate
                    self._create_alert(
                        severity=ALERT_SEVERITY["WARNING"],
                        component=sync_type,
                        message=f"High error rate ({error_rate:.1%}) during {sync_type} sync",
                        details={
                            "type": sync_type,
                            "errorRate": error_rate,
                            "threshold": error_threshold,
                            "errors": errors,
                            "total": total
                        }
                    )
            
            # Check for high conflict rate
            conflicts = stats.get("conflicts", 0)
            
            if total > 0:
                conflict_rate = conflicts / total
                conflict_threshold = self.config["alertThresholds"]["conflictRateThreshold"]
                
                if conflict_rate > conflict_threshold:
                    # Create alert for high conflict rate
                    self._create_alert(
                        severity=ALERT_SEVERITY["WARNING"],
                        component=sync_type,
                        message=f"High conflict rate ({conflict_rate:.1%}) during {sync_type} sync",
                        details={
                            "type": sync_type,
                            "conflictRate": conflict_rate,
                            "threshold": conflict_threshold,
                            "conflicts": conflicts,
                            "total": total
                        }
                    )
                    
        except Exception as e:
            logger.error(f"Error checking alert conditions: {str(e)}")
    
    def _check_sync_delay_alerts(self):
        """
        Check for sync delay alerts
        """
        try:
            sync_manager = self.resources["syncManager"]
            sync_state = sync_manager.sync_state
            now = int(time.time() * 1000)
            
            # Get sync delay threshold in milliseconds
            delay_threshold = self.config["alertThresholds"]["syncDelayMinutes"] * 60 * 1000
            
            # Check OrbitDB sync delay
            last_orbit_sync = sync_state.get("lastOrbitDBSync", 0)
            if last_orbit_sync > 0 and (now - last_orbit_sync) > delay_threshold:
                # Create alert for delayed OrbitDB sync
                self._create_alert(
                    severity=ALERT_SEVERITY["WARNING"],
                    component="orbit-to-fireproof",
                    message=f"OrbitDB to FireproofDB sync delayed by {(now - last_orbit_sync) / (60 * 1000):.1f} minutes",
                    details={
                        "lastSync": last_orbit_sync,
                        "currentTime": now,
                        "delay": now - last_orbit_sync,
                        "threshold": delay_threshold
                    }
                )
            
            # Check FireproofDB sync delay
            last_fireproof_sync = sync_state.get("lastFireproofDBSync", 0)
            if last_fireproof_sync > 0 and (now - last_fireproof_sync) > delay_threshold:
                # Create alert for delayed FireproofDB sync
                self._create_alert(
                    severity=ALERT_SEVERITY["WARNING"],
                    component="fireproof-to-orbit",
                    message=f"FireproofDB to OrbitDB sync delayed by {(now - last_fireproof_sync) / (60 * 1000):.1f} minutes",
                    details={
                        "lastSync": last_fireproof_sync,
                        "currentTime": now,
                        "delay": now - last_fireproof_sync,
                        "threshold": delay_threshold
                    }
                )
            
            # Check DuckDB export delay
            last_duckdb_export = sync_state.get("lastDuckDBExport", 0)
            if last_duckdb_export > 0 and (now - last_duckdb_export) > delay_threshold:
                # Create alert for delayed DuckDB export
                self._create_alert(
                    severity=ALERT_SEVERITY["WARNING"],
                    component="duckdb-export",
                    message=f"DuckDB export delayed by {(now - last_duckdb_export) / (60 * 1000):.1f} minutes",
                    details={
                        "lastExport": last_duckdb_export,
                        "currentTime": now,
                        "delay": now - last_duckdb_export,
                        "threshold": delay_threshold
                    }
                )
            
            # Check DuckDB import delay
            last_duckdb_import = sync_state.get("lastDuckDBImport", 0)
            if last_duckdb_import > 0 and (now - last_duckdb_import) > delay_threshold:
                # Create alert for delayed DuckDB import
                self._create_alert(
                    severity=ALERT_SEVERITY["WARNING"],
                    component="duckdb-import",
                    message=f"DuckDB import delayed by {(now - last_duckdb_import) / (60 * 1000):.1f} minutes",
                    details={
                        "lastImport": last_duckdb_import,
                        "currentTime": now,
                        "delay": now - last_duckdb_import,
                        "threshold": delay_threshold
                    }
                )
                
        except Exception as e:
            logger.error(f"Error checking sync delay alerts: {str(e)}")
    
    def _check_error_rate_alerts(self):
        """
        Check for error rate alerts
        """
        try:
            # Check overall error rate
            total_ops = self.monitor_state["metrics"]["syncOperations"]["total"]
            failed_ops = self.monitor_state["metrics"]["syncOperations"]["failed"]
            
            if total_ops > 0:
                failure_rate = failed_ops / total_ops
                threshold = self.config["alertThresholds"]["highErrorRateThreshold"]
                
                if failure_rate > threshold:
                    # Create alert for high overall failure rate
                    self._create_alert(
                        severity=ALERT_SEVERITY["ERROR"],
                        component="sync-manager",
                        message=f"High sync failure rate ({failure_rate:.1%})",
                        details={
                            "failureRate": failure_rate,
                            "threshold": threshold,
                            "totalOperations": total_ops,
                            "failedOperations": failed_ops
                        }
                    )
            
            # Check consecutive failures
            consecutive_failures = 0
            if len(self.monitor_state["syncHistory"]) > 0:
                for entry in reversed(self.monitor_state["syncHistory"]):
                    if entry.get("status") == SYNC_STATUS["FAILED"]:
                        consecutive_failures += 1
                    else:
                        break
            
            failure_count_threshold = self.config["alertThresholds"]["syncFailureCount"]
            if consecutive_failures >= failure_count_threshold:
                # Create alert for consecutive failures
                self._create_alert(
                    severity=ALERT_SEVERITY["ERROR"],
                    component="sync-manager",
                    message=f"Multiple consecutive sync failures ({consecutive_failures})",
                    details={
                        "consecutiveFailures": consecutive_failures,
                        "threshold": failure_count_threshold
                    }
                )
                
        except Exception as e:
            logger.error(f"Error checking error rate alerts: {str(e)}")
    
    def _create_alert(self, severity, component, message, details=None):
        """
        Create and record an alert
        
        Args:
            severity (str): Alert severity level
            component (str): Component that triggered the alert
            message (str): Alert message
            details (dict): Additional alert details
            
        Returns:
            dict: Created alert
        """
        try:
            # Create alert object
            alert = {
                "id": f"alert-{int(time.time() * 1000)}-{hash(message) % 10000}",
                "timestamp": int(time.time() * 1000),
                "severity": severity,
                "component": component,
                "message": message,
                "details": details or {},
                "acknowledged": False
            }
            
            with self.lock:
                # Add to alerts list
                self.monitor_state["alerts"].append(alert)
                
                # Limit alerts list size
                max_alerts = 100  # Keep last 100 alerts
                if len(self.monitor_state["alerts"]) > max_alerts:
                    self.monitor_state["alerts"] = self.monitor_state["alerts"][-max_alerts:]
            
            # Log the alert
            log_method = logging.warning if severity == ALERT_SEVERITY["WARNING"] else (
                logging.error if severity in [ALERT_SEVERITY["ERROR"], ALERT_SEVERITY["CRITICAL"]] else logging.info
            )
            log_method(f"SYNC ALERT [{severity}] {component}: {message}")
            
            # Queue alert for subscribers
            self.update_queue.put({
                "type": "alerts",
                "data": alert,
                "timestamp": int(time.time() * 1000)
            })
            
            return alert
        except Exception as e:
            logger.error(f"Error creating alert: {str(e)}")
            return {
                "id": f"error-alert-{int(time.time() * 1000)}",
                "timestamp": int(time.time() * 1000),
                "severity": ALERT_SEVERITY["ERROR"],
                "component": "alert-system",
                "message": f"Error creating alert: {str(e)}",
                "acknowledged": False
            }
    
    def acknowledge_alert(self, alert_id):
        """
        Acknowledge an alert
        
        Args:
            alert_id (str): ID of the alert to acknowledge
            
        Returns:
            dict: Acknowledgement result
        """
        with self.lock:
            for alert in self.monitor_state["alerts"]:
                if alert.get("id") == alert_id:
                    alert["acknowledged"] = True
                    alert["acknowledgedAt"] = int(time.time() * 1000)
                    
                    # Queue update for subscribers
                    self.update_queue.put({
                        "type": "alerts",
                        "data": {
                            "action": "acknowledge",
                            "alertId": alert_id,
                            "alert": alert
                        },
                        "timestamp": int(time.time() * 1000)
                    })
                    
                    return {"success": True, "message": f"Alert {alert_id} acknowledged"}
        
        return {"success": False, "message": f"Alert {alert_id} not found"}
    
    async def _initialize_monitoring_state(self):
        """
        Initialize monitoring state from sync manager and disk
        """
        try:
            # Load previous state if exists
            monitor_state_path = os.path.join(self.config["monitorDir"], "monitor_state.json")
            if os.path.exists(monitor_state_path):
                with open(monitor_state_path, "r") as f:
                    loaded_state = json.load(f)
                    # Selectively update our state with loaded values
                    if "metrics" in loaded_state:
                        self.monitor_state["metrics"] = loaded_state["metrics"]
                    if "syncHistory" in loaded_state:
                        self.monitor_state["syncHistory"] = loaded_state["syncHistory"]
                    if "alerts" in loaded_state:
                        # Only load unacknowledged alerts or recent alerts
                        now = int(time.time() * 1000)
                        cutoff = now - (7 * 24 * 60 * 60 * 1000)  # 7 days ago
                        self.monitor_state["alerts"] = [
                            a for a in loaded_state["alerts"]
                            if not a.get("acknowledged") or a.get("timestamp", 0) > cutoff
                        ]
            
            # Initialize sync status from sync manager
            sync_manager = self.resources["syncManager"]
            
            # Get last sync timestamps
            last_orbit_sync = sync_manager.sync_state.get("lastOrbitDBSync", 0)
            last_fireproof_sync = sync_manager.sync_state.get("lastFireproofDBSync", 0)
            last_duckdb_export = sync_manager.sync_state.get("lastDuckDBExport", 0)
            last_duckdb_import = sync_manager.sync_state.get("lastDuckDBImport", 0)
            
            # Determine initial statuses based on timestamps
            now = int(time.time() * 1000)
            sync_threshold = 24 * 60 * 60 * 1000  # 24 hours in milliseconds
            
            # If sync has happened in the last 24 hours, consider it complete
            # Otherwise, consider it unknown
            with self.lock:
                self.monitor_state["syncStatus"]["orbitToFireproof"] = (
                    SYNC_STATUS["COMPLETE"] if last_orbit_sync > 0 and (now - last_orbit_sync) < sync_threshold
                    else SYNC_STATUS["UNKNOWN"]
                )
                
                self.monitor_state["syncStatus"]["fireproofToOrbit"] = (
                    SYNC_STATUS["COMPLETE"] if last_fireproof_sync > 0 and (now - last_fireproof_sync) < sync_threshold
                    else SYNC_STATUS["UNKNOWN"]
                )
                
                self.monitor_state["syncStatus"]["duckdbExport"] = (
                    SYNC_STATUS["COMPLETE"] if last_duckdb_export > 0 and (now - last_duckdb_export) < sync_threshold
                    else SYNC_STATUS["UNKNOWN"]
                )
                
                self.monitor_state["syncStatus"]["duckdbImport"] = (
                    SYNC_STATUS["COMPLETE"] if last_duckdb_import > 0 and (now - last_duckdb_import) < sync_threshold
                    else SYNC_STATUS["UNKNOWN"]
                )
                
                # Update active jobs
                self.monitor_state["activeJobs"] = json.loads(json.dumps(sync_manager.sync_state.get("activeJobs", {})))
                
                # Update overall status
                self._update_overall_status()
                
                # Update last updated timestamp
                self.monitor_state["lastUpdated"] = int(time.time() * 1000)
            
            # Calculate initial metrics
            self._collect_metrics()
            
        except Exception as e:
            logger.error(f"Error initializing monitoring state: {str(e)}")
    
    def _save_metrics(self):
        """
        Save metrics to disk
        """
        try:
            # Create a copy of the state for saving
            with self.lock:
                state_copy = {
                    "syncStatus": self.monitor_state["syncStatus"].copy(),
                    "metrics": json.loads(json.dumps(self.monitor_state["metrics"])),
                    "alerts": json.loads(json.dumps(self.monitor_state["alerts"])),
                    "syncHistory": json.loads(json.dumps(self.monitor_state["syncHistory"])),
                    "syncTrends": json.loads(json.dumps(self.monitor_state["syncTrends"])),
                    "lastUpdated": self.monitor_state["lastUpdated"]
                }
            
            # Save to disk
            monitor_state_path = os.path.join(self.config["monitorDir"], "monitor_state.json")
            with open(monitor_state_path, "w") as f:
                json.dump(state_copy, f, indent=2)
                
            # Save metrics history
            metrics_path = os.path.join(
                self.config["monitorDir"], 
                f"metrics-{datetime.now().strftime('%Y%m%d')}.json"
            )
            
            # Append to daily metrics file
            with open(metrics_path, "a") as f:
                # Only append metrics with timestamp
                metrics_entry = {
                    "timestamp": int(time.time() * 1000),
                    "metrics": json.loads(json.dumps(self.monitor_state["metrics"])),
                    "status": self.monitor_state["syncStatus"].copy()
                }
                f.write(json.dumps(metrics_entry) + "\n")
                
            # Clean up old metrics files
            self._cleanup_old_metrics()
                
        except Exception as e:
            logger.error(f"Error saving metrics: {str(e)}")
    
    def _cleanup_old_metrics(self):
        """
        Clean up old metrics files based on retention policy
        """
        try:
            # Get retention period in days
            retention_days = self.config["retentionDays"]
            cutoff_date = datetime.now() - timedelta(days=retention_days)
            
            # List metrics files
            metrics_dir = Path(self.config["monitorDir"])
            metrics_files = list(metrics_dir.glob("metrics-*.json"))
            
            for metrics_file in metrics_files:
                try:
                    # Extract date from filename
                    date_str = metrics_file.name.split("-")[1].split(".")[0]
                    file_date = datetime.strptime(date_str, "%Y%m%d")
                    
                    # Delete if older than retention period
                    if file_date < cutoff_date:
                        metrics_file.unlink()
                        logger.info(f"Deleted old metrics file: {metrics_file.name}")
                except Exception as parse_error:
                    logger.warning(f"Error parsing metrics filename {metrics_file.name}: {str(parse_error)}")
                    
        except Exception as e:
            logger.error(f"Error cleaning up old metrics: {str(e)}")
    
    async def close(self):
        """
        Clean up resources before shutdown
        
        Returns:
            dict: Close result
        """
        try:
            # Stop metrics collection
            self.stop_metrics_collection()
            
            # Stop update thread
            self.stop_update_thread()
            
            # Remove event listeners from sync manager
            sync_manager = self.resources["syncManager"]
            if hasattr(sync_manager, "remove_listener"):
                sync_manager.remove_listener("sync", self._handle_sync_event)
                sync_manager.remove_listener("error", self._handle_error_event)
                sync_manager.remove_listener("change", self._handle_change_event)
                sync_manager.remove_listener("duckdb-export", self._handle_duckdb_export_event)
                sync_manager.remove_listener("duckdb-import", self._handle_duckdb_import_event)
            
            # Save final state
            self._save_metrics()
            
            logger.info("Database sync monitor closed")
            return {"success": True, "message": "Database sync monitor closed"}
        except Exception as e:
            logger.error(f"Error closing database sync monitor: {str(e)}")
            return {"success": False, "message": f"Error closing database sync monitor: {str(e)}"}

# Export constants
DATABASE_SYNC_STATUS = SYNC_STATUS
DATABASE_ALERT_SEVERITY = ALERT_SEVERITY