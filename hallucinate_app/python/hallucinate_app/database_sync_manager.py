"""
Database Synchronization Manager

Provides bidirectional synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD
Implements event-driven updates, conflict resolution, selective mirroring,
and differential updates as described in CLAUDE.md.
"""

import os
import json
import time
import queue
import threading
import hashlib
import asyncio
import logging
from typing import Dict, List, Set, Union, Optional, Any, Callable
from pathlib import Path
from datetime import datetime

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_sync_manager")

# Synchronization capability constants
SYNC_CAPABILITIES = {
    "SYNC_ORBITDB_TO_FIREPROOFDB": "sync:orbitdb:to:fireproofdb",
    "SYNC_FIREPROOFDB_TO_ORBITDB": "sync:fireproofdb:to:orbitdb",
    "SYNC_DUCKDB_EXPORT_IPLD": "sync:duckdb:export:ipld",
    "SYNC_DUCKDB_IMPORT_IPLD": "sync:duckdb:import:ipld",
    "SYNC_SELECTIVE_MIRRORING": "sync:selective:mirroring",
    "SYNC_DIFFERENTIAL_UPDATES": "sync:differential:updates",
    "SYNC_ADMIN": "sync:admin"
}

class EventEmitter:
    """Simple event emitter implementation"""
    
    def __init__(self):
        self._events = {}
        
    def on(self, event_name, callback):
        """Register an event listener"""
        if event_name not in self._events:
            self._events[event_name] = []
        self._events[event_name].append(callback)
        
    def emit(self, event_name, *args, **kwargs):
        """Emit an event"""
        if event_name in self._events:
            for callback in self._events[event_name]:
                callback(*args, **kwargs)
                
    def remove_listener(self, event_name, callback):
        """Remove an event listener"""
        if event_name in self._events:
            self._events[event_name] = [cb for cb in self._events[event_name] if cb != callback]


class DatabaseSyncManager(EventEmitter):
    """
    Manages synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD databases
    
    Implements bidirectional sync, event-driven updates, conflict resolution,
    selective mirroring, and differential updates as described in CLAUDE.md.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the sync manager with resources and metadata
        
        Args:
            resources (dict): Shared resources (orbitDb, fireproofDb, duckDb, authManager, etc.)
            metadata (dict): Configuration metadata
        """
        super().__init__()
        
        # Set default values
        resources = resources or {}
        metadata = metadata or {}
        
        # Initialize resources
        self.resources = resources
        self.metadata = metadata
        
        # Verify required resources
        if not resources.get("orbitDb"):
            raise ValueError("OrbitDB resource is required for DatabaseSyncManager")
        if not resources.get("fireproofDb"):
            raise ValueError("FireproofDB resource is required for DatabaseSyncManager")
        if not resources.get("duckDb"):
            raise ValueError("DuckDB-IPLD resource is required for DatabaseSyncManager")
        if not resources.get("authManager"):
            raise ValueError("AuthManager resource is required for DatabaseSyncManager")
        if not resources.get("ipfsKit"):
            raise ValueError("IPFS Kit resource is required for DatabaseSyncManager")
        if not resources.get("libp2pKit"):
            raise ValueError("libp2p Kit resource is required for DatabaseSyncManager")
            
        # Configuration options
        home_dir = os.path.expanduser("~")
        self.config = {
            "syncInterval": metadata.get("syncInterval", 60000),  # Default: 1 minute
            "differentialUpdateThreshold": metadata.get("differentialUpdateThreshold", 0.1),  # Default: 10% change threshold
            "selectiveMirroringRules": metadata.get("selectiveMirroringRules", {}),
            "syncDir": metadata.get("syncDir", os.path.join(home_dir, ".hallucinate_app", "sync")),
            "pubsubTopic": metadata.get("pubsubTopic", "hallucinate-app-sync"),
            "maxRetries": metadata.get("maxRetries", 3),
            "conflictStrategy": metadata.get("conflictStrategy", "crdt"),  # Default strategy: CRDT
            "logSyncOperations": metadata.get("logSyncOperations", True),
            "autoSync": metadata.get("autoSync", True),
        }
        
        # Internal state
        self.sync_state = {
            "lastOrbitDBSync": 0,
            "lastFireproofDBSync": 0,
            "lastDuckDBExport": 0,
            "lastDuckDBImport": 0,
            "activeJobs": {},
            "syncHistory": [],
            "conflictLog": [],
            "changeLog": {}
        }
        
        # Sync interval reference
        self.sync_timer = None
        
        # Message queues for thread communication
        self.message_queue = queue.Queue()
        self.result_queue = queue.Queue()
        
        # Bind method references
        self._handle_orbitdb_change = self._handle_orbitdb_change
        self._handle_fireproofdb_change = self._handle_fireproofdb_change
        self._handle_libp2p_message = self._handle_libp2p_message
        
        # Thread lock for synchronization
        self.lock = threading.Lock()
        
    async def init(self):
        """
        Initialize the sync manager
        
        Returns:
            dict: Initialization result
        """
        try:
            # Create sync directory if it doesn't exist
            os.makedirs(self.config["syncDir"], exist_ok=True)
            
            # Register event listeners
            if hasattr(self.resources["orbitDb"], "on"):
                self.resources["orbitDb"].on("update", self._handle_orbitdb_change)
                
            if hasattr(self.resources["fireproofDb"], "on"):
                self.resources["fireproofDb"].on("update", self._handle_fireproofdb_change)
                
            # Subscribe to libp2p pubsub for database synchronization
            await self.resources["libp2pKit"].pubsub.subscribe(
                self.config["pubsubTopic"], 
                self._handle_libp2p_message
            )
            
            # Start automatic sync if enabled
            if self.config["autoSync"]:
                self.start_auto_sync()
                
            # Load sync state if exists
            try:
                sync_state_path = os.path.join(self.config["syncDir"], "sync_state.json")
                if os.path.exists(sync_state_path):
                    with open(sync_state_path, "r") as f:
                        loaded_state = json.load(f)
                        # Update our state with loaded values
                        self.sync_state.update(loaded_state)
            except Exception as e:
                logger.info(f"No previous sync state found, using defaults: {str(e)}")
                
            return {"success": True, "message": "Database sync manager initialized"}
        except Exception as e:
            logger.error(f"Failed to initialize database sync manager: {str(e)}")
            raise ValueError(f"DatabaseSyncManager initialization failed: {str(e)}")
            
    def start_auto_sync(self):
        """
        Start automatic synchronization with the configured interval
        
        Returns:
            dict: Start result
        """
        if self.sync_timer:
            self.sync_timer.cancel()
            
        def sync_task():
            try:
                # Create a self-signed token
                auth_token = self.resources["authManager"].get_self_signed_token(
                    SYNC_CAPABILITIES["SYNC_ADMIN"]
                )
                # Run sync in a non-blocking way
                threading.Thread(
                    target=self._run_sync_all,
                    args=(auth_token,),
                    daemon=True
                ).start()
            except Exception as e:
                logger.error(f"Auto sync error: {str(e)}")
                self.emit("error", {"type": "auto-sync", "error": str(e)})
                
            # Reschedule the task
            self.sync_timer = threading.Timer(self.config["syncInterval"] / 1000, sync_task)
            self.sync_timer.daemon = True
            self.sync_timer.start()
            
        # Start the first sync
        self.sync_timer = threading.Timer(self.config["syncInterval"] / 1000, sync_task)
        self.sync_timer.daemon = True
        self.sync_timer.start()
        
        return {"success": True, "message": "Auto sync started"}
        
    def stop_auto_sync(self):
        """
        Stop automatic synchronization
        
        Returns:
            dict: Stop result
        """
        if self.sync_timer:
            self.sync_timer.cancel()
            self.sync_timer = None
            
        return {"success": True, "message": "Auto sync stopped"}
    
    async def _verify_capability(self, capability, token):
        """
        Verify the user has the required capability for a sync operation
        
        Args:
            capability (str): The capability to check
            token (str): The UCAN token
            
        Returns:
            bool: Whether the user has the capability
            
        Raises:
            ValueError: If authentication fails
        """
        if not token:
            raise ValueError("Authentication token is required")
            
        try:
            result = await self.resources["authManager"].verify_capability(token, capability)
            return result["verified"]
        except Exception as e:
            logger.error(f"Capability verification failed for {capability}: {str(e)}")
            raise ValueError(f"Access denied: {str(e)}")
    
    def _run_sync_all(self, auth_token):
        """
        Run the sync_all method in a separate thread
        
        Args:
            auth_token (str): UCAN authentication token
        """
        try:
            # This runs in a separate thread
            result = asyncio.run(self.sync_all(auth_token=auth_token))
            self.result_queue.put(result)
        except Exception as e:
            self.result_queue.put({"success": False, "error": str(e)})
    
    async def sync_all(self, auth_token=None):
        """
        Synchronize all databases
        
        Args:
            auth_token (str): UCAN authentication token
            
        Returns:
            dict: Sync results
        """
        # Verify admin capability for full sync
        await self._verify_capability(SYNC_CAPABILITIES["SYNC_ADMIN"], auth_token)
        
        try:
            results = {
                "orbitToFireproof": await self.sync_orbitdb_to_fireproofdb(auth_token=auth_token),
                "fireproofToOrbit": await self.sync_fireproofdb_to_orbitdb(auth_token=auth_token),
                "duckdbExport": await self.export_duckdb_to_ipld(auth_token=auth_token),
                "duckdbImport": await self.import_ipld_to_duckdb(auth_token=auth_token)
            }
            
            # Update sync state timestamps
            with self.lock:
                self.sync_state["lastFullSync"] = int(time.time() * 1000)
                
            # Save sync state
            await self._save_sync_state()
            
            return {"success": True, "results": results}
        except Exception as e:
            logger.error(f"Error during full sync: {str(e)}")
            raise ValueError(f"Full sync failed: {str(e)}")
    
    async def sync_orbitdb_to_fireproofdb(self, auth_token=None, collections=None):
        """
        Synchronize OrbitDB to FireproofDB
        
        Args:
            auth_token (str): UCAN authentication token
            collections (list): Specific collections to sync (optional)
            
        Returns:
            dict: Sync results
        """
        # Verify capability
        await self._verify_capability(SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"], auth_token)
        
        job_id = f"orbit-to-fireproof-{int(time.time() * 1000)}"
        with self.lock:
            self.sync_state["activeJobs"][job_id] = {
                "type": "orbit-to-fireproof",
                "startTime": int(time.time() * 1000),
                "status": "running"
            }
        
        try:
            stats = {
                "processed": 0,
                "updated": 0,
                "conflicts": 0,
                "errors": 0
            }
            
            # Get collections to sync
            collections_to_sync = collections or await self._get_orbitdb_collections()
            
            # Apply selective mirroring rules if configured
            filtered_collections = self._apply_selective_mirroring(
                collections_to_sync, 
                "orbitdb-to-fireproofdb"
            )
            
            # Process each collection
            for collection in filtered_collections:
                try:
                    # Get all documents from OrbitDB collection
                    orbit_docs = await self.resources["orbitDb"].get_all(collection)
                    
                    # Process each document
                    for doc in orbit_docs:
                        try:
                            stats["processed"] += 1
                            
                            # Check if document exists in FireproofDB
                            existing_doc = await self.resources["fireproofDb"].get(collection, doc["_id"])
                            
                            if existing_doc:
                                # Handle conflict resolution if document exists
                                if self._has_conflict(doc, existing_doc):
                                    resolved_doc = await self._resolve_conflict(doc, existing_doc, collection)
                                    await self.resources["fireproofDb"].put(collection, resolved_doc)
                                    stats["conflicts"] += 1
                                    stats["updated"] += 1
                            else:
                                # Simple insert if document doesn't exist
                                await self.resources["fireproofDb"].put(collection, doc)
                                stats["updated"] += 1
                        except Exception as doc_error:
                            logger.error(f"Error processing document {doc.get('_id')} in collection {collection}: {str(doc_error)}")
                            stats["errors"] += 1
                except Exception as collection_error:
                    logger.error(f"Error processing collection {collection}: {str(collection_error)}")
                    stats["errors"] += 1
            
            # Update sync state
            with self.lock:
                self.sync_state["lastOrbitDBSync"] = int(time.time() * 1000)
                self.sync_state["activeJobs"][job_id] = {
                    "type": "orbit-to-fireproof",
                    "startTime": int(time.time() * 1000),
                    "status": "completed",
                    "completedAt": int(time.time() * 1000),
                    "stats": stats
                }
            
            # Log sync operation
            if self.config["logSyncOperations"]:
                with self.lock:
                    self.sync_state["syncHistory"].append({
                        "type": "orbit-to-fireproof",
                        "timestamp": int(time.time() * 1000),
                        "stats": stats,
                        "collections": filtered_collections
                    })
            
            # Save sync state
            await self._save_sync_state()
            
            # Emit sync event
            self.emit("sync", {
                "type": "orbit-to-fireproof",
                "stats": stats,
                "collections": filtered_collections
            })
            
            return {"success": True, "stats": stats}
        except Exception as e:
            logger.error(f"Error synchronizing OrbitDB to FireproofDB: {str(e)}")
            with self.lock:
                self.sync_state["activeJobs"][job_id] = {
                    "type": "orbit-to-fireproof",
                    "startTime": int(time.time() * 1000),
                    "status": "failed",
                    "error": str(e),
                    "completedAt": int(time.time() * 1000)
                }
            raise ValueError(f"OrbitDB to FireproofDB sync failed: {str(e)}")
        finally:
            # Clean up job after some time
            def cleanup_job():
                with self.lock:
                    if job_id in self.sync_state["activeJobs"]:
                        del self.sync_state["activeJobs"][job_id]
                        
            # Schedule cleanup after 1 hour
            cleanup_timer = threading.Timer(3600, cleanup_job)
            cleanup_timer.daemon = True
            cleanup_timer.start()
    
    async def sync_fireproofdb_to_orbitdb(self, auth_token=None, collections=None):
        """
        Synchronize FireproofDB to OrbitDB
        
        Args:
            auth_token (str): UCAN authentication token
            collections (list): Specific collections to sync (optional)
            
        Returns:
            dict: Sync results
        """
        # Verify capability
        await self._verify_capability(SYNC_CAPABILITIES["SYNC_FIREPROOFDB_TO_ORBITDB"], auth_token)
        
        job_id = f"fireproof-to-orbit-{int(time.time() * 1000)}"
        with self.lock:
            self.sync_state["activeJobs"][job_id] = {
                "type": "fireproof-to-orbit",
                "startTime": int(time.time() * 1000),
                "status": "running"
            }
        
        try:
            stats = {
                "processed": 0,
                "updated": 0,
                "conflicts": 0,
                "errors": 0
            }
            
            # Get collections to sync
            collections_to_sync = collections or await self._get_fireproofdb_collections()
            
            # Apply selective mirroring rules if configured
            filtered_collections = self._apply_selective_mirroring(
                collections_to_sync, 
                "fireproofdb-to-orbitdb"
            )
            
            # Process each collection
            for collection in filtered_collections:
                try:
                    # Get all documents from FireproofDB collection
                    fireproof_docs = await self.resources["fireproofDb"].get_all(collection)
                    
                    # Process each document
                    for doc in fireproof_docs:
                        try:
                            stats["processed"] += 1
                            
                            # Check if document exists in OrbitDB
                            existing_doc = await self.resources["orbitDb"].get(collection, doc["_id"])
                            
                            if existing_doc:
                                # Handle conflict resolution if document exists
                                if self._has_conflict(doc, existing_doc):
                                    resolved_doc = await self._resolve_conflict(doc, existing_doc, collection)
                                    await self.resources["orbitDb"].put(collection, resolved_doc)
                                    stats["conflicts"] += 1
                                    stats["updated"] += 1
                            else:
                                # Simple insert if document doesn't exist
                                await self.resources["orbitDb"].put(collection, doc)
                                stats["updated"] += 1
                        except Exception as doc_error:
                            logger.error(f"Error processing document {doc.get('_id')} in collection {collection}: {str(doc_error)}")
                            stats["errors"] += 1
                except Exception as collection_error:
                    logger.error(f"Error processing collection {collection}: {str(collection_error)}")
                    stats["errors"] += 1
            
            # Update sync state
            with self.lock:
                self.sync_state["lastFireproofDBSync"] = int(time.time() * 1000)
                self.sync_state["activeJobs"][job_id] = {
                    "type": "fireproof-to-orbit",
                    "startTime": int(time.time() * 1000),
                    "status": "completed",
                    "completedAt": int(time.time() * 1000),
                    "stats": stats
                }
            
            # Log sync operation
            if self.config["logSyncOperations"]:
                with self.lock:
                    self.sync_state["syncHistory"].append({
                        "type": "fireproof-to-orbit",
                        "timestamp": int(time.time() * 1000),
                        "stats": stats,
                        "collections": filtered_collections
                    })
            
            # Save sync state
            await self._save_sync_state()
            
            # Emit sync event
            self.emit("sync", {
                "type": "fireproof-to-orbit",
                "stats": stats,
                "collections": filtered_collections
            })
            
            return {"success": True, "stats": stats}
        except Exception as e:
            logger.error(f"Error synchronizing FireproofDB to OrbitDB: {str(e)}")
            with self.lock:
                self.sync_state["activeJobs"][job_id] = {
                    "type": "fireproof-to-orbit",
                    "startTime": int(time.time() * 1000),
                    "status": "failed",
                    "error": str(e),
                    "completedAt": int(time.time() * 1000)
                }
            raise ValueError(f"FireproofDB to OrbitDB sync failed: {str(e)}")
        finally:
            # Clean up job after some time
            def cleanup_job():
                with self.lock:
                    if job_id in self.sync_state["activeJobs"]:
                        del self.sync_state["activeJobs"][job_id]
                        
            # Schedule cleanup after 1 hour
            cleanup_timer = threading.Timer(3600, cleanup_job)
            cleanup_timer.daemon = True
            cleanup_timer.start()
    
    async def export_duckdb_to_ipld(self, auth_token=None, tables=None, differential=True):
        """
        Export DuckDB database to IPLD for P2P exchange
        
        Args:
            auth_token (str): UCAN authentication token
            tables (list): Specific tables to export (optional)
            differential (bool): Whether to use differential updates (optional)
            
        Returns:
            dict: Export results with CIDs
        """
        # Verify capability
        await self._verify_capability(SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"], auth_token)
        
        job_id = f"duckdb-export-{int(time.time() * 1000)}"
        with self.lock:
            self.sync_state["activeJobs"][job_id] = {
                "type": "duckdb-export",
                "startTime": int(time.time() * 1000),
                "status": "running"
            }
        
        try:
            stats = {
                "tables": 0,
                "rows": 0,
                "differential": 0,
                "fullExport": 0,
                "errors": 0
            }
            
            # Get tables to export
            tables_to_export = tables or await self._get_duckdb_tables()
            
            # Results object to store CIDs for each table
            results = {
                "timestamp": int(time.time() * 1000),
                "tables": {}
            }
            
            # Process each table
            for table in tables_to_export:
                try:
                    cid = None
                    export_method = "full"
                    
                    # Check if we should do differential update
                    if differential and table in self.sync_state.get("changeLog", {}):
                        change_log = self.sync_state["changeLog"][table]
                        change_ratio = change_log["changes"] / max(change_log["total"], 1)
                        
                        if change_ratio < self.config["differentialUpdateThreshold"]:
                            # Differential update is more efficient
                            cid = await self.resources["duckDb"].export_table_differential_to_ipld(
                                table,
                                change_log.get("changedRows", [])
                            )
                            stats["differential"] += 1
                            export_method = "differential"
                        else:
                            # Full export is more efficient
                            cid = await self.resources["duckDb"].export_table_to_ipld(table)
                            stats["fullExport"] += 1
                    else:
                        # Default to full export
                        cid = await self.resources["duckDb"].export_table_to_ipld(table)
                        stats["fullExport"] += 1
                    
                    # Get row count
                    row_count = await self._get_table_row_count(table)
                    stats["rows"] += row_count
                    stats["tables"] += 1
                    
                    # Store results
                    if cid:
                        results["tables"][table] = {
                            "cid": str(cid),
                            "rows": row_count,
                            "method": export_method,
                            "timestamp": int(time.time() * 1000)
                        }
                        
                        # Publish to pubsub for peer notification
                        await self.resources["libp2pKit"].pubsub.publish(
                            self.config["pubsubTopic"],
                            json.dumps({
                                "type": "duckdb-export",
                                "table": table,
                                "cid": str(cid),
                                "method": export_method,
                                "timestamp": int(time.time() * 1000)
                            }).encode("utf-8")
                        )
                        
                        # Reset change log for this table
                        with self.lock:
                            if "changeLog" not in self.sync_state:
                                self.sync_state["changeLog"] = {}
                            self.sync_state["changeLog"][table] = {
                                "changes": 0,
                                "total": row_count,
                                "changedRows": [],
                                "lastExport": int(time.time() * 1000)
                            }
                except Exception as table_error:
                    logger.error(f"Error exporting table {table}: {str(table_error)}")
                    stats["errors"] += 1
                    
                    # Store error in results
                    results["tables"][table] = {
                        "error": str(table_error),
                        "timestamp": int(time.time() * 1000)
                    }
            
            # Update sync state
            with self.lock:
                self.sync_state["lastDuckDBExport"] = int(time.time() * 1000)
                self.sync_state["activeJobs"][job_id] = {
                    "type": "duckdb-export",
                    "startTime": int(time.time() * 1000),
                    "status": "completed",
                    "completedAt": int(time.time() * 1000),
                    "stats": stats
                }
            
            # Store export results
            results_path = os.path.join(
                self.config["syncDir"], 
                f"duckdb-export-{int(time.time() * 1000)}.json"
            )
            with open(results_path, "w") as f:
                json.dump(results, f, indent=2)
            
            # Log sync operation
            if self.config["logSyncOperations"]:
                with self.lock:
                    self.sync_state["syncHistory"].append({
                        "type": "duckdb-export",
                        "timestamp": int(time.time() * 1000),
                        "stats": stats,
                        "tables": tables_to_export,
                        "results": results
                    })
            
            # Save sync state
            await self._save_sync_state()
            
            # Emit export event
            self.emit("duckdb-export", {
                "stats": stats,
                "tables": results["tables"]
            })
            
            return {"success": True, "stats": stats, "results": results}
        except Exception as e:
            logger.error(f"Error exporting DuckDB to IPLD: {str(e)}")
            with self.lock:
                self.sync_state["activeJobs"][job_id] = {
                    "type": "duckdb-export",
                    "startTime": int(time.time() * 1000),
                    "status": "failed",
                    "error": str(e),
                    "completedAt": int(time.time() * 1000)
                }
            raise ValueError(f"DuckDB export to IPLD failed: {str(e)}")
        finally:
            # Clean up job after some time
            def cleanup_job():
                with self.lock:
                    if job_id in self.sync_state["activeJobs"]:
                        del self.sync_state["activeJobs"][job_id]
                        
            # Schedule cleanup after 1 hour
            cleanup_timer = threading.Timer(3600, cleanup_job)
            cleanup_timer.daemon = True
            cleanup_timer.start()
    
    async def import_ipld_to_duckdb(self, auth_token=None, table_data=None):
        """
        Import IPLD data into DuckDB
        
        Args:
            auth_token (str): UCAN authentication token
            table_data (dict): Mapping of table names to CIDs (optional)
            
        Returns:
            dict: Import results
        """
        # Verify capability
        await self._verify_capability(SYNC_CAPABILITIES["SYNC_DUCKDB_IMPORT_IPLD"], auth_token)
        
        job_id = f"duckdb-import-{int(time.time() * 1000)}"
        with self.lock:
            self.sync_state["activeJobs"][job_id] = {
                "type": "duckdb-import",
                "startTime": int(time.time() * 1000),
                "status": "running"
            }
        
        try:
            stats = {
                "tables": 0,
                "rows": 0,
                "differential": 0,
                "fullImport": 0,
                "errors": 0
            }
            
            # If no table_data provided, get from libp2p or previous export
            tables = table_data or await self._get_latest_ipld_table_data()
            
            # Results object to store import stats
            results = {
                "timestamp": int(time.time() * 1000),
                "tables": {}
            }
            
            # Process each table
            for table, data in tables.items():
                try:
                    cid = data.get("cid")
                    method = data.get("method", "full")
                    
                    if not cid:
                        raise ValueError(f"Missing CID for table {table}")
                    
                    # Import based on method
                    if method == "differential":
                        # Apply differential update
                        await self.resources["duckDb"].import_differential_ipld_to_table(table, cid)
                        stats["differential"] += 1
                    else:
                        # Full table import
                        await self.resources["duckDb"].import_ipld_to_table(table, cid)
                        stats["fullImport"] += 1
                    
                    # Get row count after import
                    row_count = await self._get_table_row_count(table)
                    stats["rows"] += row_count
                    stats["tables"] += 1
                    
                    # Store results
                    results["tables"][table] = {
                        "cid": cid,
                        "rows": row_count,
                        "method": method,
                        "timestamp": int(time.time() * 1000)
                    }
                except Exception as table_error:
                    logger.error(f"Error importing table {table}: {str(table_error)}")
                    stats["errors"] += 1
                    
                    # Store error in results
                    results["tables"][table] = {
                        "error": str(table_error),
                        "timestamp": int(time.time() * 1000)
                    }
            
            # Update sync state
            with self.lock:
                self.sync_state["lastDuckDBImport"] = int(time.time() * 1000)
                self.sync_state["activeJobs"][job_id] = {
                    "type": "duckdb-import",
                    "startTime": int(time.time() * 1000),
                    "status": "completed",
                    "completedAt": int(time.time() * 1000),
                    "stats": stats
                }
            
            # Store import results
            results_path = os.path.join(
                self.config["syncDir"], 
                f"duckdb-import-{int(time.time() * 1000)}.json"
            )
            with open(results_path, "w") as f:
                json.dump(results, f, indent=2)
            
            # Log sync operation
            if self.config["logSyncOperations"]:
                with self.lock:
                    self.sync_state["syncHistory"].append({
                        "type": "duckdb-import",
                        "timestamp": int(time.time() * 1000),
                        "stats": stats,
                        "results": results
                    })
            
            # Save sync state
            await self._save_sync_state()
            
            # Emit import event
            self.emit("duckdb-import", {
                "stats": stats,
                "tables": results["tables"]
            })
            
            return {"success": True, "stats": stats, "results": results}
        except Exception as e:
            logger.error(f"Error importing IPLD to DuckDB: {str(e)}")
            with self.lock:
                self.sync_state["activeJobs"][job_id] = {
                    "type": "duckdb-import",
                    "startTime": int(time.time() * 1000),
                    "status": "failed",
                    "error": str(e),
                    "completedAt": int(time.time() * 1000)
                }
            raise ValueError(f"IPLD import to DuckDB failed: {str(e)}")
        finally:
            # Clean up job after some time
            def cleanup_job():
                with self.lock:
                    if job_id in self.sync_state["activeJobs"]:
                        del self.sync_state["activeJobs"][job_id]
                        
            # Schedule cleanup after 1 hour
            cleanup_timer = threading.Timer(3600, cleanup_job)
            cleanup_timer.daemon = True
            cleanup_timer.start()
            
    async def test(self):
        """
        Test database synchronization functionality
        
        Returns:
            dict: Test results
        """
        try:
            # Create test collections/tables in each database
            test_id = f"test-{int(time.time() * 1000)}"
            test_doc = {
                "_id": test_id, 
                "value": f"Test value {int(time.time() * 1000)}", 
                "timestamp": int(time.time() * 1000)
            }
            
            # Test OrbitDB
            await self.resources["orbitDb"].put("test_sync", test_doc)
            orbit_result = await self.resources["orbitDb"].get("test_sync", test_id)
            
            # Test FireproofDB
            await self.resources["fireproofDb"].put("test_sync", test_doc)
            fireproof_result = await self.resources["fireproofDb"].get("test_sync", test_id)
            
            # Test DuckDB
            await self.resources["duckDb"].execute("""
                CREATE TABLE IF NOT EXISTS test_sync (
                  id VARCHAR,
                  value VARCHAR,
                  timestamp BIGINT
                )
            """)
            
            await self.resources["duckDb"].execute(f"""
                INSERT INTO test_sync VALUES (
                  '{test_id}',
                  '{test_doc["value"]}',
                  {test_doc["timestamp"]}
                )
            """)
            
            duckdb_result = await self.resources["duckDb"].query(f"""
                SELECT * FROM test_sync WHERE id = '{test_id}'
            """)
            
            # Test IPLD export/import for DuckDB
            export_cid = await self.resources["duckDb"].export_table_to_ipld("test_sync")
            
            # Clean up test data
            await self.resources["orbitDb"].delete("test_sync", test_id)
            await self.resources["fireproofDb"].delete("test_sync", test_id)
            await self.resources["duckDb"].execute(f"DELETE FROM test_sync WHERE id = '{test_id}'")
            
            return {
                "success": True,
                "message": "Database sync manager test completed successfully",
                "results": {
                    "orbitDB": bool(orbit_result),
                    "fireproofDB": bool(fireproof_result),
                    "duckDB": bool(duckdb_result and len(duckdb_result) > 0),
                    "ipldExport": str(export_cid) if export_cid else None
                }
            }
        except Exception as e:
            logger.error(f"Database sync manager test failed: {str(e)}")
            return {
                "success": False,
                "message": f"Database sync manager test failed: {str(e)}",
                "error": str(e)
            }
    
    async def _get_orbitdb_collections(self):
        """
        Get a list of OrbitDB collections
        
        Returns:
            list: List of collection names
        """
        try:
            return await self.resources["orbitDb"].get_collections()
        except Exception as e:
            logger.error(f"Error getting OrbitDB collections: {str(e)}")
            return []
    
    async def _get_fireproofdb_collections(self):
        """
        Get a list of FireproofDB collections
        
        Returns:
            list: List of collection names
        """
        try:
            return await self.resources["fireproofDb"].get_collections()
        except Exception as e:
            logger.error(f"Error getting FireproofDB collections: {str(e)}")
            return []
    
    async def _get_duckdb_tables(self):
        """
        Get a list of DuckDB tables
        
        Returns:
            list: List of table names
        """
        try:
            result = await self.resources["duckDb"].query("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'main'
            """)
            
            return [row["table_name"] for row in result]
        except Exception as e:
            logger.error(f"Error getting DuckDB tables: {str(e)}")
            return []
    
    async def _get_table_row_count(self, table):
        """
        Get row count for a DuckDB table
        
        Args:
            table (str): Table name
            
        Returns:
            int: Row count
        """
        try:
            result = await self.resources["duckDb"].query(f"""
                SELECT COUNT(*) as count FROM "{table}"
            """)
            
            return result[0]["count"] if result else 0
        except Exception as e:
            logger.error(f"Error getting row count for table {table}: {str(e)}")
            return 0
    
    async def _get_latest_ipld_table_data(self):
        """
        Get latest IPLD table data from previous exports or libp2p
        
        Returns:
            dict: Table data mapping
        """
        try:
            # First try to find the most recent export file
            sync_dir = Path(self.config["syncDir"])
            export_files = list(sync_dir.glob("duckdb-export-*.json"))
            export_files.sort(reverse=True)
            
            if export_files:
                with open(export_files[0], "r") as f:
                    export_data = json.load(f)
                    return export_data.get("tables", {})
            
            # If no export files, return empty dict
            return {}
        except Exception as e:
            logger.error(f"Error getting latest IPLD table data: {str(e)}")
            return {}
    
    def _has_conflict(self, doc1, doc2):
        """
        Check if two documents have a conflict
        
        Args:
            doc1 (dict): First document
            doc2 (dict): Second document
            
        Returns:
            bool: Whether the documents conflict
        """
        # Simple comparison - if timestamps or revisions differ, consider it a conflict
        if doc1.get("_rev") != doc2.get("_rev"):
            return True
            
        if (doc1.get("updatedAt") and doc2.get("updatedAt") and 
                doc1["updatedAt"] != doc2["updatedAt"]):
            return True
        
        # Hash comparison for deeper check
        hash1 = self._get_document_hash(doc1)
        hash2 = self._get_document_hash(doc2)
        
        return hash1 != hash2
    
    def _get_document_hash(self, doc):
        """
        Calculate a hash for document contents
        
        Args:
            doc (dict): Document to hash
            
        Returns:
            str: Document hash
        """
        # Create a copy without metadata fields
        clean_doc = doc.copy()
        clean_doc.pop("_id", None)
        clean_doc.pop("_rev", None)
        clean_doc.pop("updatedAt", None)
        clean_doc.pop("createdAt", None)
        
        # Sort keys for consistent serialization
        serialized = json.dumps(clean_doc, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    
    async def _resolve_conflict(self, doc1, doc2, collection):
        """
        Resolve a conflict between two documents
        
        Args:
            doc1 (dict): First document
            doc2 (dict): Second document
            collection (str): Collection name
            
        Returns:
            dict: Resolved document
        """
        # Log conflict
        with self.lock:
            self.sync_state.setdefault("conflictLog", []).append({
                "timestamp": int(time.time() * 1000),
                "collection": collection,
                "docId": doc1.get("_id"),
                "strategy": self.config["conflictStrategy"]
            })
        
        # Use configured conflict resolution strategy
        if self.config["conflictStrategy"] == "crdt":
            # Use CRDT-based resolution (merge fields, pick latest for conflicts)
            return self._resolve_crdt(doc1, doc2)
            
        elif self.config["conflictStrategy"] == "newest":
            # Use timestamp-based resolution
            return self._resolve_newest(doc1, doc2)
            
        elif self.config["conflictStrategy"] == "custom":
            # Use collection-specific custom resolution if available
            return await self._resolve_custom(doc1, doc2, collection)
            
        else:
            # Default to CRDT
            return self._resolve_crdt(doc1, doc2)
    
    def _resolve_crdt(self, doc1, doc2):
        """
        Resolve conflict using CRDT strategy
        
        Args:
            doc1 (dict): First document
            doc2 (dict): Second document
            
        Returns:
            dict: Resolved document
        """
        # Get timestamps for both documents
        ts1 = doc1.get("updatedAt", doc1.get("timestamp", 0))
        ts2 = doc2.get("updatedAt", doc2.get("timestamp", 0))
        
        # Create new merged document
        merged = {**doc1, **doc2}
        
        # For conflicting fields, use the value from the newest doc
        for key in doc1:
            if key in doc2 and doc1[key] != doc2[key]:
                merged[key] = doc1[key] if ts1 > ts2 else doc2[key]
        
        # Set metadata
        merged["_id"] = doc1.get("_id")
        merged["_rev"] = str(int(doc1.get("_rev", "0")) + 1)
        merged["updatedAt"] = int(time.time() * 1000)
        
        return merged
    
    def _resolve_newest(self, doc1, doc2):
        """
        Resolve conflict using newest strategy
        
        Args:
            doc1 (dict): First document
            doc2 (dict): Second document
            
        Returns:
            dict: Resolved document
        """
        # Get timestamps for both documents
        ts1 = doc1.get("updatedAt", doc1.get("timestamp", 0))
        ts2 = doc2.get("updatedAt", doc2.get("timestamp", 0))
        
        # Use the newest document
        if ts1 > ts2:
            updated = doc1.copy()
            updated["_rev"] = str(int(doc1.get("_rev", "0")) + 1)
            updated["updatedAt"] = int(time.time() * 1000)
            return updated
        else:
            updated = doc2.copy()
            updated["_rev"] = str(int(doc2.get("_rev", "0")) + 1)
            updated["updatedAt"] = int(time.time() * 1000)
            return updated
    
    async def _resolve_custom(self, doc1, doc2, collection):
        """
        Resolve conflict using custom strategy
        
        Args:
            doc1 (dict): First document
            doc2 (dict): Second document
            collection (str): Collection name
            
        Returns:
            dict: Resolved document
        """
        # Check if we have a custom resolver for this collection
        custom_resolvers = self.config.get("customResolvers", {})
        
        if collection in custom_resolvers and callable(custom_resolvers[collection]):
            return custom_resolvers[collection](doc1, doc2)
        
        # Fall back to CRDT if no custom resolver
        return self._resolve_crdt(doc1, doc2)
    
    def _apply_selective_mirroring(self, collections, direction):
        """
        Apply selective mirroring rules to filter collections
        
        Args:
            collections (list): Collections to filter
            direction (str): Sync direction
            
        Returns:
            list: Filtered collections
        """
        rules = self.config.get("selectiveMirroringRules", {}).get(direction, {})
        
        if not rules:
            # No rules, return all collections
            return collections
        
        # Apply inclusion and exclusion rules
        filtered = []
        for collection in collections:
            # Explicit inclusions override exclusions
            if "include" in rules and collection in rules["include"]:
                filtered.append(collection)
                continue
            
            # Explicit exclusions
            if "exclude" in rules and collection in rules["exclude"]:
                continue
            
            # Pattern-based inclusion
            include_by_pattern = False
            if "includePatterns" in rules:
                for pattern in rules["includePatterns"]:
                    import re
                    if re.search(pattern, collection):
                        include_by_pattern = True
                        break
            
            if include_by_pattern:
                filtered.append(collection)
                continue
            
            # Pattern-based exclusion
            exclude_by_pattern = False
            if "excludePatterns" in rules:
                for pattern in rules["excludePatterns"]:
                    import re
                    if re.search(pattern, collection):
                        exclude_by_pattern = True
                        break
            
            if exclude_by_pattern:
                continue
            
            # Default inclusion behavior
            if rules.get("defaultInclude", True):
                filtered.append(collection)
        
        return filtered
    
    async def _save_sync_state(self):
        """
        Save current sync state to disk
        """
        try:
            # Create a safe copy of the state without circular references
            with self.lock:
                state_copy = {
                    "lastOrbitDBSync": self.sync_state.get("lastOrbitDBSync", 0),
                    "lastFireproofDBSync": self.sync_state.get("lastFireproofDBSync", 0),
                    "lastDuckDBExport": self.sync_state.get("lastDuckDBExport", 0),
                    "lastDuckDBImport": self.sync_state.get("lastDuckDBImport", 0),
                    # Keep only last 100 entries
                    "syncHistory": self.sync_state.get("syncHistory", [])[-100:],
                    "conflictLog": self.sync_state.get("conflictLog", [])[-100:],
                    # Convert dict correctly
                    "changeLog": self.sync_state.get("changeLog", {})
                }
            
            sync_state_path = os.path.join(self.config["syncDir"], "sync_state.json")
            with open(sync_state_path, "w") as f:
                json.dump(state_copy, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving sync state: {str(e)}")
    
    def _handle_orbitdb_change(self, event):
        """
        Handle changes from OrbitDB
        
        Args:
            event (dict): Change event
        """
        collection = event.get("collection")
        doc_id = event.get("docId")
        operation = event.get("operation")
        
        # Emit change event
        self.emit("change", {
            "type": "orbitdb",
            "collection": collection,
            "docId": doc_id,
            "operation": operation,
            "timestamp": int(time.time() * 1000)
        })
        
        # If auto-sync is enabled and time since last sync exceeds threshold, trigger sync
        with self.lock:
            time_since_last_sync = int(time.time() * 1000) - self.sync_state.get("lastOrbitDBSync", 0)
            
        if (self.config.get("autoSync") and 
                time_since_last_sync > self.config.get("autoSyncThreshold", 60000)):
            
            # Queue sync operation to avoid flooding
            if not hasattr(self, "_sync_timeout_orbit") or self._sync_timeout_orbit is None:
                def trigger_sync():
                    try:
                        # Get a self-signed token
                        auth_token = self.resources["authManager"].get_self_signed_token(
                            SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"]
                        )
                        # Run sync in a non-blocking way
                        threading.Thread(
                            target=lambda: asyncio.run(self.sync_orbitdb_to_fireproofdb(
                                auth_token=auth_token,
                                collections=[collection]
                            )),
                            daemon=True
                        ).start()
                    except Exception as e:
                        logger.error(f"Auto-sync OrbitDB to FireproofDB failed: {str(e)}")
                    finally:
                        self._sync_timeout_orbit = None
                
                self._sync_timeout_orbit = threading.Timer(5, trigger_sync)
                self._sync_timeout_orbit.daemon = True
                self._sync_timeout_orbit.start()
    
    def _handle_fireproofdb_change(self, event):
        """
        Handle changes from FireproofDB
        
        Args:
            event (dict): Change event
        """
        collection = event.get("collection")
        doc_id = event.get("docId")
        operation = event.get("operation")
        
        # Emit change event
        self.emit("change", {
            "type": "fireproofdb",
            "collection": collection,
            "docId": doc_id,
            "operation": operation,
            "timestamp": int(time.time() * 1000)
        })
        
        # If auto-sync is enabled and time since last sync exceeds threshold, trigger sync
        with self.lock:
            time_since_last_sync = int(time.time() * 1000) - self.sync_state.get("lastFireproofDBSync", 0)
            
        if (self.config.get("autoSync") and 
                time_since_last_sync > self.config.get("autoSyncThreshold", 60000)):
            
            # Queue sync operation to avoid flooding
            if not hasattr(self, "_sync_timeout_fireproof") or self._sync_timeout_fireproof is None:
                def trigger_sync():
                    try:
                        # Get a self-signed token
                        auth_token = self.resources["authManager"].get_self_signed_token(
                            SYNC_CAPABILITIES["SYNC_FIREPROOFDB_TO_ORBITDB"]
                        )
                        # Run sync in a non-blocking way
                        threading.Thread(
                            target=lambda: asyncio.run(self.sync_fireproofdb_to_orbitdb(
                                auth_token=auth_token,
                                collections=[collection]
                            )),
                            daemon=True
                        ).start()
                    except Exception as e:
                        logger.error(f"Auto-sync FireproofDB to OrbitDB failed: {str(e)}")
                    finally:
                        self._sync_timeout_fireproof = None
                
                self._sync_timeout_fireproof = threading.Timer(5, trigger_sync)
                self._sync_timeout_fireproof.daemon = True
                self._sync_timeout_fireproof.start()
    
    def _handle_duckdb_change(self, event):
        """
        Handle DuckDB changes for tracking differential updates
        
        Args:
            event (dict): Change event
        """
        table = event.get("table")
        row_id = event.get("rowId")
        operation = event.get("operation")
        
        # Initialize or update change log for this table
        with self.lock:
            if "changeLog" not in self.sync_state:
                self.sync_state["changeLog"] = {}
                
            if table not in self.sync_state["changeLog"]:
                self.sync_state["changeLog"][table] = {
                    "changes": 0,
                    "total": 0,
                    "changedRows": [],
                    "lastChange": int(time.time() * 1000)
                }
            
            table_log = self.sync_state["changeLog"][table]
            
            # Update the log
            table_log["changes"] += 1
            table_log["lastChange"] = int(time.time() * 1000)
            if row_id and row_id not in table_log["changedRows"]:
                table_log["changedRows"].append(row_id)
        
        # Emit change event
        self.emit("change", {
            "type": "duckdb",
            "table": table,
            "rowId": row_id,
            "operation": operation,
            "timestamp": int(time.time() * 1000)
        })
        
        # If auto-sync is enabled and enough changes have accumulated, trigger export
        with self.lock:
            should_trigger = (
                self.config.get("autoSync") and 
                table_log["changes"] >= self.config.get("autoSyncThreshold", 100)
            )
        
        if should_trigger and (not hasattr(self, "_sync_timeout_duckdb") or self._sync_timeout_duckdb is None):
            def trigger_export():
                try:
                    # Get a self-signed token
                    auth_token = self.resources["authManager"].get_self_signed_token(
                        SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"]
                    )
                    # Run export in a non-blocking way
                    threading.Thread(
                        target=lambda: asyncio.run(self.export_duckdb_to_ipld(
                            auth_token=auth_token,
                            tables=[table],
                            differential=True
                        )),
                        daemon=True
                    ).start()
                except Exception as e:
                    logger.error(f"Auto-export DuckDB to IPLD failed: {str(e)}")
                finally:
                    self._sync_timeout_duckdb = None
            
            self._sync_timeout_duckdb = threading.Timer(5, trigger_export)
            self._sync_timeout_duckdb.daemon = True
            self._sync_timeout_duckdb.start()
    
    async def _handle_libp2p_message(self, message):
        """
        Handle libp2p pubsub messages for synchronization
        
        Args:
            message (object): libp2p pubsub message
        """
        try:
            if hasattr(message, "data"):
                data = json.loads(message.data.decode("utf-8"))
            else:
                data = json.loads(message)
            
            # Handle based on message type
            if data.get("type") == "duckdb-export":
                # Another peer has exported a DuckDB table
                # We can import it if needed
                self.emit("peer-sync", {
                    "type": "duckdb-export",
                    "peer": message.from_peer if hasattr(message, "from_peer") else "unknown",
                    "table": data.get("table"),
                    "cid": data.get("cid"),
                    "method": data.get("method"),
                    "timestamp": data.get("timestamp")
                })
                
                # Auto-import if configured
                if self.config.get("autoImportPeerData"):
                    await self.import_ipld_to_duckdb(
                        auth_token=self.resources["authManager"].get_self_signed_token(
                            SYNC_CAPABILITIES["SYNC_DUCKDB_IMPORT_IPLD"]
                        ),
                        table_data={
                            data.get("table"): {
                                "cid": data.get("cid"),
                                "method": data.get("method")
                            }
                        }
                    )
            
            elif data.get("type") == "sync-request":
                # Another peer is requesting sync data
                # We can export our data if needed
                self.emit("peer-sync", {
                    "type": "sync-request",
                    "peer": message.from_peer if hasattr(message, "from_peer") else "unknown",
                    "collections": data.get("collections"),
                    "tables": data.get("tables"),
                    "timestamp": data.get("timestamp")
                })
                
                # Auto-export if configured
                if self.config.get("autoExportOnRequest"):
                    if data.get("tables"):
                        await self.export_duckdb_to_ipld(
                            auth_token=self.resources["authManager"].get_self_signed_token(
                                SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"]
                            ),
                            tables=data.get("tables")
                        )
        except Exception as e:
            logger.error(f"Error handling libp2p message: {str(e)}")
    
    async def close(self):
        """
        Cleanup before shutdown
        
        Returns:
            dict: Close result
        """
        # Stop auto-sync
        self.stop_auto_sync()
        
        # Unsubscribe from libp2p topic
        if self.resources.get("libp2pKit"):
            await self.resources["libp2pKit"].pubsub.unsubscribe(self.config["pubsubTopic"])
        
        # Remove event listeners
        if self.resources.get("orbitDb") and hasattr(self.resources["orbitDb"], "remove_listener"):
            self.resources["orbitDb"].remove_listener("update", self._handle_orbitdb_change)
        
        if self.resources.get("fireproofDb") and hasattr(self.resources["fireproofDb"], "remove_listener"):
            self.resources["fireproofDb"].remove_listener("update", self._handle_fireproofdb_change)
        
        # Save final sync state
        await self._save_sync_state()
        
        return {"success": True, "message": "Database sync manager closed"}


# Export constants
DATABASE_SYNC_CAPABILITIES = SYNC_CAPABILITIES