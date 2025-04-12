"""
Database Backup Manager

Provides functionality to backup databases to IPFS using ipfs_kit_py
Integrates with the PyArrow content index for metadata tracking
Supports scheduled snapshots, versioning, and retention policies
"""

import os
import json
import time
import logging
import asyncio
import threading
import tempfile
import hashlib
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_backup_manager")

# Backup capability constants
BACKUP_CAPABILITIES = {
    "BACKUP_ORBITDB": "backup:orbitdb",
    "BACKUP_FIREPROOFDB": "backup:fireproofdb",
    "BACKUP_DUCKDB": "backup:duckdb",
    "RESTORE_ORBITDB": "restore:orbitdb",
    "RESTORE_FIREPROOFDB": "restore:fireproofdb",
    "RESTORE_DUCKDB": "restore:duckdb",
    "SCHEDULE_BACKUP": "backup:schedule",
    "ADMIN": "backup:admin"
}

class BackupTracker:
    """Tracks backup versions and versions"""
    
    def __init__(self, backup_dir: str):
        """
        Initialize backup tracker
        
        Args:
            backup_dir (str): Directory to store backup metadata
        """
        self.backup_dir = backup_dir
        self.metadata_path = os.path.join(backup_dir, "backup_metadata.json")
        self.backups = {}
        self._load_metadata()
    
    def _load_metadata(self):
        """Load backup metadata from file"""
        try:
            if os.path.exists(self.metadata_path):
                with open(self.metadata_path, "r") as f:
                    self.backups = json.load(f)
            else:
                self.backups = {
                    "orbitdb": {},
                    "fireproofdb": {},
                    "duckdb": {},
                    "last_backup": {},
                    "scheduled_backups": []
                }
                self._save_metadata()
        except Exception as e:
            logger.error(f"Error loading backup metadata: {e}")
            self.backups = {
                "orbitdb": {},
                "fireproofdb": {},
                "duckdb": {},
                "last_backup": {},
                "scheduled_backups": []
            }
    
    def _save_metadata(self):
        """Save backup metadata to file"""
        try:
            os.makedirs(os.path.dirname(self.metadata_path), exist_ok=True)
            with open(self.metadata_path, "w") as f:
                json.dump(self.backups, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving backup metadata: {e}")
    
    def add_backup(self, db_type: str, backup_id: str, metadata: Dict[str, Any]):
        """
        Add a backup to the tracker
        
        Args:
            db_type (str): Type of database (orbitdb, fireproofdb, duckdb)
            backup_id (str): Unique ID for the backup
            metadata (dict): Backup metadata
        """
        if db_type not in self.backups:
            self.backups[db_type] = {}
        
        timestamp = datetime.now().isoformat()
        
        self.backups[db_type][backup_id] = {
            **metadata,
            "timestamp": timestamp,
            "backup_id": backup_id
        }
        
        # Update last backup timestamp
        self.backups["last_backup"][db_type] = timestamp
        
        self._save_metadata()
        
        return self.backups[db_type][backup_id]
    
    def get_backup(self, db_type: str, backup_id: str) -> Optional[Dict[str, Any]]:
        """
        Get backup information
        
        Args:
            db_type (str): Type of database
            backup_id (str): Backup ID
            
        Returns:
            dict: Backup metadata or None if not found
        """
        if db_type not in self.backups or backup_id not in self.backups[db_type]:
            return None
        
        return self.backups[db_type][backup_id]
    
    def list_backups(self, db_type: str) -> List[Dict[str, Any]]:
        """
        List backups for a specific database type
        
        Args:
            db_type (str): Type of database
            
        Returns:
            list: List of backup metadata objects
        """
        if db_type not in self.backups:
            return []
        
        # Convert to list and sort by timestamp (newest first)
        backups = list(self.backups[db_type].values())
        backups.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return backups
    
    def remove_backup(self, db_type: str, backup_id: str) -> bool:
        """
        Remove a backup from the tracker
        
        Args:
            db_type (str): Type of database
            backup_id (str): Backup ID
            
        Returns:
            bool: Success status
        """
        if db_type not in self.backups or backup_id not in self.backups[db_type]:
            return False
        
        del self.backups[db_type][backup_id]
        self._save_metadata()
        
        return True
    
    def add_scheduled_backup(self, schedule: Dict[str, Any]) -> int:
        """
        Add a scheduled backup
        
        Args:
            schedule (dict): Schedule information
            
        Returns:
            int: Schedule ID
        """
        if "scheduled_backups" not in self.backups:
            self.backups["scheduled_backups"] = []
        
        # Generate ID for the schedule
        schedule_id = len(self.backups["scheduled_backups"])
        
        # Add schedule with ID
        self.backups["scheduled_backups"].append({
            **schedule,
            "id": schedule_id,
            "created_at": datetime.now().isoformat(),
            "last_run": None
        })
        
        self._save_metadata()
        
        return schedule_id
    
    def update_schedule_last_run(self, schedule_id: int) -> bool:
        """
        Update the last run timestamp for a scheduled backup
        
        Args:
            schedule_id (int): Schedule ID
            
        Returns:
            bool: Success status
        """
        if "scheduled_backups" not in self.backups:
            return False
        
        for i, schedule in enumerate(self.backups["scheduled_backups"]):
            if schedule.get("id") == schedule_id:
                self.backups["scheduled_backups"][i]["last_run"] = datetime.now().isoformat()
                self._save_metadata()
                return True
        
        return False
    
    def get_due_schedules(self) -> List[Dict[str, Any]]:
        """
        Get schedules that are due to run
        
        Returns:
            list: List of due schedules
        """
        if "scheduled_backups" not in self.backups:
            return []
        
        now = datetime.now()
        due_schedules = []
        
        for schedule in self.backups["scheduled_backups"]:
            if not schedule.get("active", True):
                continue
                
            interval = schedule.get("interval", 0)  # In hours
            last_run_str = schedule.get("last_run")
            
            if not last_run_str:
                due_schedules.append(schedule)
                continue
            
            try:
                last_run = datetime.fromisoformat(last_run_str)
                next_run = last_run + timedelta(hours=interval)
                
                if now >= next_run:
                    due_schedules.append(schedule)
            except ValueError:
                logger.error(f"Invalid timestamp format for schedule {schedule.get('id')}")
        
        return due_schedules
    
    def get_schedule(self, schedule_id: int) -> Optional[Dict[str, Any]]:
        """
        Get a specific schedule
        
        Args:
            schedule_id (int): Schedule ID
            
        Returns:
            dict: Schedule information or None if not found
        """
        if "scheduled_backups" not in self.backups:
            return None
        
        for schedule in self.backups["scheduled_backups"]:
            if schedule.get("id") == schedule_id:
                return schedule
        
        return None
    
    def remove_schedule(self, schedule_id: int) -> bool:
        """
        Remove a scheduled backup
        
        Args:
            schedule_id (int): Schedule ID
            
        Returns:
            bool: Success status
        """
        if "scheduled_backups" not in self.backups:
            return False
        
        for i, schedule in enumerate(self.backups["scheduled_backups"]):
            if schedule.get("id") == schedule_id:
                del self.backups["scheduled_backups"][i]
                self._save_metadata()
                return True
        
        return False


class DatabaseBackupManager:
    """
    Database Backup Manager
    
    Provides functionality to backup databases to IPFS using ipfs_kit_py
    Integrates with the PyArrow content index for metadata tracking
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the database backup manager
        
        Args:
            resources (dict): Shared resources (secure managers, authManager, etc.)
            metadata (dict): Configuration metadata
        """
        # Set default values
        resources = resources or {}
        metadata = metadata or {}
        
        # Initialize resources
        self.resources = resources
        self.metadata = metadata
        
        # Check required resources
        if not resources.get("orbitDb"):
            logger.warning("OrbitDB resource not provided, some functionality may be limited")
        if not resources.get("fireproofDb"):
            logger.warning("FireproofDB resource not provided, some functionality may be limited")
        if not resources.get("duckDb"):
            logger.warning("DuckDB resource not provided, some functionality may be limited")
        if not resources.get("authManager"):
            raise ValueError("AuthManager resource is required")
        
        # Try to get content index integration from resources or import
        self.content_index_integration = resources.get("content_index_integration")
        if not self.content_index_integration:
            try:
                from pyarrow_content_index_integration import content_index_integration
                self.content_index_integration = content_index_integration
            except ImportError:
                logger.warning("PyArrow content index integration not available")
                self.content_index_integration = None
        
        # Try to import ipfs_kit_py or use provided resource
        self.ipfs_kit = resources.get("ipfs_kit")
        if not self.ipfs_kit:
            try:
                # We'll use our integration layer if available
                from ipfs_kit import ipfs_kit
                self.ipfs_kit = ipfs_kit
            except ImportError:
                try:
                    # Try to import ipfs_kit_py directly
                    import ipfs_kit_py
                    self.ipfs_kit = ipfs_kit_py
                except ImportError:
                    logger.warning("ipfs_kit_py not available, backup functionality will be limited")
                    self.ipfs_kit = None
        
        # Configuration options
        home_dir = os.path.expanduser("~")
        self.config = {
            "backup_dir": metadata.get("backup_dir", os.path.join(home_dir, ".hallucinate_app", "backups")),
            "temp_dir": metadata.get("temp_dir", os.path.join(home_dir, ".hallucinate_app", "temp")),
            "retention_count": metadata.get("retention_count", 5),  # Number of backups to keep per database
            "compression": metadata.get("compression", True),  # Whether to compress backups
            "add_to_content_index": metadata.get("add_to_content_index", True),  # Whether to add to content index
            "auto_scheduled_backups": metadata.get("auto_scheduled_backups", True),  # Enable scheduled backups
            "scheduler_interval": metadata.get("scheduler_interval", 60),  # Minutes between scheduler checks
        }
        
        # Create backup directories
        os.makedirs(self.config["backup_dir"], exist_ok=True)
        os.makedirs(self.config["temp_dir"], exist_ok=True)
        
        # Initialize backup tracker
        self.backup_tracker = BackupTracker(self.config["backup_dir"])
        
        # Scheduler
        self.scheduler_timer = None
        self.initialized = False
    
    async def init(self):
        """
        Initialize the backup manager
        
        Returns:
            bool: Success status
        """
        try:
            logger.info("Initializing database backup manager")
            
            # Initialize ipfs_kit if available
            if self.ipfs_kit and hasattr(self.ipfs_kit, "init"):
                await self.ipfs_kit.init()
            
            # Initialize content index if available
            if self.content_index_integration and hasattr(self.content_index_integration, "init"):
                await self.content_index_integration.init()
            
            # Start scheduler if auto_scheduled_backups is enabled
            if self.config["auto_scheduled_backups"]:
                self.start_scheduler()
                
            self.initialized = True
            logger.info("Database backup manager initialized")
            
            return True
        
        except Exception as e:
            logger.error(f"Error initializing database backup manager: {e}")
            return False
    
    async def _verify_capability(self, capability: str, token: str):
        """
        Verify the user has the required capability
        
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
            # Check for admin capability first (which grants all access)
            admin_result = await self.resources["authManager"].verify_capability(
                token, BACKUP_CAPABILITIES["ADMIN"]
            )
            
            if admin_result:
                return True
            
            # Check for specific capability
            result = await self.resources["authManager"].verify_capability(token, capability)
            return result
        except Exception as e:
            logger.error(f"Error verifying capability {capability}: {e}")
            raise ValueError(f"Access denied: {e}")
    
    async def backup_orbitdb(self, collections=None, auth_token=None, metadata=None):
        """
        Backup OrbitDB collections to IPFS
        
        Args:
            collections (list): List of collections to backup (None for all)
            auth_token (str): Authentication token
            metadata (dict): Additional metadata to store with the backup
            
        Returns:
            dict: Backup information
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["BACKUP_ORBITDB"], auth_token)
        
        # Verify OrbitDB is available
        if not self.resources.get("orbitDb"):
            raise ValueError("OrbitDB resource not available")
        
        # Verify IPFS Kit is available
        if not self.ipfs_kit:
            raise ValueError("IPFS Kit not available")
        
        try:
            # Get collections to backup
            if not collections:
                try:
                    collections = await self.resources["orbitDb"].get_collections()
                except:
                    # Fallback methods if get_collections is not available
                    try:
                        collections = await self.resources["orbitDb"].get_databases()
                    except:
                        try:
                            collections = await self.resources["orbitDb"].get_database_names()
                        except:
                            raise ValueError("Unable to get OrbitDB collections")
            
            if not collections:
                logger.warning("No OrbitDB collections found")
                return {"success": False, "error": "No collections found"}
            
            logger.info(f"Backing up OrbitDB collections: {collections}")
            
            # Create a temporary directory for the backup files
            backup_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            temp_backup_dir = os.path.join(self.config["temp_dir"], f"orbitdb_backup_{backup_timestamp}")
            os.makedirs(temp_backup_dir, exist_ok=True)
            
            # Process each collection
            collection_data = {}
            for collection in collections:
                try:
                    # Get all documents in the collection
                    documents = await self.resources["orbitDb"].get_all(collection)
                    
                    if not documents:
                        logger.info(f"Collection {collection} is empty")
                        collection_data[collection] = []
                        continue
                    
                    # Save documents to collection data
                    collection_data[collection] = documents
                    
                    # Write to a temporary JSON file
                    collection_file = os.path.join(temp_backup_dir, f"{collection}.json")
                    with open(collection_file, "w") as f:
                        json.dump(documents, f, indent=2)
                    
                    logger.info(f"Saved {len(documents)} documents from collection {collection}")
                    
                except Exception as e:
                    logger.error(f"Error backing up collection {collection}: {e}")
                    collection_data[collection] = {"error": str(e)}
            
            # Create a manifest file with metadata
            backup_id = f"orbitdb_{backup_timestamp}"
            manifest = {
                "type": "orbitdb",
                "collections": collections,
                "timestamp": datetime.now().isoformat(),
                "document_count": {
                    collection: len(docs) for collection, docs in collection_data.items() 
                    if isinstance(docs, list)
                },
                "metadata": metadata or {}
            }
            
            manifest_file = os.path.join(temp_backup_dir, "manifest.json")
            with open(manifest_file, "w") as f:
                json.dump(manifest, f, indent=2)
            
            # Add the backup directory to IPFS
            try:
                # Use ipfs_kit to add directory
                if hasattr(self.ipfs_kit, "add_directory"):
                    result = await self.ipfs_kit.add_directory(temp_backup_dir)
                    root_cid = result.get("cid") or result.get("hash")
                else:
                    # Fallback method
                    result = await self.ipfs_kit.add(temp_backup_dir, recursive=True)
                    # Get the root directory CID
                    root_cid = result[-1].get("cid") or result[-1].get("hash")
                
                logger.info(f"Backup added to IPFS with CID: {root_cid}")
                
                # Add to content index if available
                if self.content_index_integration and self.config["add_to_content_index"]:
                    entry = {
                        "cid": root_cid,
                        "path": f"/backups/orbitdb/{backup_id}",
                        "size": sum(os.path.getsize(os.path.join(dirpath, filename)) 
                                for dirpath, _, filenames in os.walk(temp_backup_dir) 
                                for filename in filenames),
                        "mimetype": "application/x-directory",
                        "metadata": {
                            "backup_type": "orbitdb",
                            "collections": collections,
                            "timestamp": manifest["timestamp"],
                            "document_count": manifest["document_count"],
                            "custom_metadata": metadata or {}
                        }
                    }
                    
                    await self.content_index_integration.add_entry(entry)
                    logger.info(f"Added backup metadata to PyArrow content index")
            except Exception as e:
                logger.error(f"Error adding backup to IPFS: {e}")
                raise ValueError(f"Failed to add backup to IPFS: {e}")
            
            # Track the backup
            backup_info = self.backup_tracker.add_backup("orbitdb", backup_id, {
                "cid": root_cid,
                "collections": collections,
                "document_count": manifest["document_count"],
                "timestamp": manifest["timestamp"],
                "metadata": metadata or {}
            })
            
            # Apply retention policy
            self._apply_retention_policy("orbitdb")
            
            # Clean up temporary directory
            import shutil
            shutil.rmtree(temp_backup_dir)
            
            return {
                "success": True,
                "backup_id": backup_id,
                "cid": root_cid,
                "timestamp": manifest["timestamp"],
                "collections": collections,
                "document_count": manifest["document_count"]
            }
            
        except Exception as e:
            logger.error(f"Error backing up OrbitDB: {e}")
            raise ValueError(f"Backup failed: {e}")
    
    async def backup_fireproofdb(self, collections=None, auth_token=None, metadata=None):
        """
        Backup FireproofDB collections to IPFS
        
        Args:
            collections (list): List of collections to backup (None for all)
            auth_token (str): Authentication token
            metadata (dict): Additional metadata to store with the backup
            
        Returns:
            dict: Backup information
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["BACKUP_FIREPROOFDB"], auth_token)
        
        # Verify FireproofDB is available
        if not self.resources.get("fireproofDb"):
            raise ValueError("FireproofDB resource not available")
        
        # Verify IPFS Kit is available
        if not self.ipfs_kit:
            raise ValueError("IPFS Kit not available")
        
        try:
            # Get collections to backup
            if not collections:
                try:
                    collections = await self.resources["fireproofDb"].get_collections()
                except:
                    # Fallback methods
                    try:
                        collections = await self.resources["fireproofDb"].get_databases()
                    except:
                        try:
                            collections = await self.resources["fireproofDb"].get_database_names()
                        except:
                            raise ValueError("Unable to get FireproofDB collections")
            
            if not collections:
                logger.warning("No FireproofDB collections found")
                return {"success": False, "error": "No collections found"}
            
            logger.info(f"Backing up FireproofDB collections: {collections}")
            
            # Create a temporary directory for the backup files
            backup_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            temp_backup_dir = os.path.join(self.config["temp_dir"], f"fireproofdb_backup_{backup_timestamp}")
            os.makedirs(temp_backup_dir, exist_ok=True)
            
            # Process each collection
            collection_data = {}
            for collection in collections:
                try:
                    # Get all documents in the collection
                    documents = await self.resources["fireproofDb"].get_all(collection)
                    
                    if not documents:
                        logger.info(f"Collection {collection} is empty")
                        collection_data[collection] = []
                        continue
                    
                    # Save documents to collection data
                    collection_data[collection] = documents
                    
                    # Write to a temporary JSON file
                    collection_file = os.path.join(temp_backup_dir, f"{collection}.json")
                    with open(collection_file, "w") as f:
                        json.dump(documents, f, indent=2)
                    
                    logger.info(f"Saved {len(documents)} documents from collection {collection}")
                    
                except Exception as e:
                    logger.error(f"Error backing up collection {collection}: {e}")
                    collection_data[collection] = {"error": str(e)}
            
            # Create a manifest file with metadata
            backup_id = f"fireproofdb_{backup_timestamp}"
            manifest = {
                "type": "fireproofdb",
                "collections": collections,
                "timestamp": datetime.now().isoformat(),
                "document_count": {
                    collection: len(docs) for collection, docs in collection_data.items() 
                    if isinstance(docs, list)
                },
                "metadata": metadata or {}
            }
            
            manifest_file = os.path.join(temp_backup_dir, "manifest.json")
            with open(manifest_file, "w") as f:
                json.dump(manifest, f, indent=2)
            
            # Add the backup directory to IPFS
            try:
                # Use ipfs_kit to add directory
                if hasattr(self.ipfs_kit, "add_directory"):
                    result = await self.ipfs_kit.add_directory(temp_backup_dir)
                    root_cid = result.get("cid") or result.get("hash")
                else:
                    # Fallback method
                    result = await self.ipfs_kit.add(temp_backup_dir, recursive=True)
                    # Get the root directory CID
                    root_cid = result[-1].get("cid") or result[-1].get("hash")
                
                logger.info(f"Backup added to IPFS with CID: {root_cid}")
                
                # Add to content index if available
                if self.content_index_integration and self.config["add_to_content_index"]:
                    entry = {
                        "cid": root_cid,
                        "path": f"/backups/fireproofdb/{backup_id}",
                        "size": sum(os.path.getsize(os.path.join(dirpath, filename)) 
                                for dirpath, _, filenames in os.walk(temp_backup_dir) 
                                for filename in filenames),
                        "mimetype": "application/x-directory",
                        "metadata": {
                            "backup_type": "fireproofdb",
                            "collections": collections,
                            "timestamp": manifest["timestamp"],
                            "document_count": manifest["document_count"],
                            "custom_metadata": metadata or {}
                        }
                    }
                    
                    await self.content_index_integration.add_entry(entry)
                    logger.info(f"Added backup metadata to PyArrow content index")
            except Exception as e:
                logger.error(f"Error adding backup to IPFS: {e}")
                raise ValueError(f"Failed to add backup to IPFS: {e}")
            
            # Track the backup
            backup_info = self.backup_tracker.add_backup("fireproofdb", backup_id, {
                "cid": root_cid,
                "collections": collections,
                "document_count": manifest["document_count"],
                "timestamp": manifest["timestamp"],
                "metadata": metadata or {}
            })
            
            # Apply retention policy
            self._apply_retention_policy("fireproofdb")
            
            # Clean up temporary directory
            import shutil
            shutil.rmtree(temp_backup_dir)
            
            return {
                "success": True,
                "backup_id": backup_id,
                "cid": root_cid,
                "timestamp": manifest["timestamp"],
                "collections": collections,
                "document_count": manifest["document_count"]
            }
            
        except Exception as e:
            logger.error(f"Error backing up FireproofDB: {e}")
            raise ValueError(f"Backup failed: {e}")
    
    async def backup_duckdb(self, tables=None, auth_token=None, metadata=None):
        """
        Backup DuckDB tables to IPFS
        
        Args:
            tables (list): List of tables to backup (None for all)
            auth_token (str): Authentication token
            metadata (dict): Additional metadata to store with the backup
            
        Returns:
            dict: Backup information
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["BACKUP_DUCKDB"], auth_token)
        
        # Verify DuckDB is available
        if not self.resources.get("duckDb"):
            raise ValueError("DuckDB resource not available")
        
        # Verify IPFS Kit is available
        if not self.ipfs_kit:
            raise ValueError("IPFS Kit not available")
        
        try:
            # Leveraging DuckDB's IPLD export capability if available
            if hasattr(self.resources["duckDb"], "export_database_to_ipld"):
                logger.info("Using DuckDB's native IPLD export capability")
                
                result = await self.resources["duckDb"].export_database_to_ipld({
                    "tables": tables,
                    "auth_token": auth_token
                })
                
                if not result or not result.get("cid"):
                    raise ValueError("Failed to export DuckDB to IPLD")
                
                # Create backup record
                backup_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                backup_id = f"duckdb_{backup_timestamp}"
                
                # Track the backup
                backup_info = self.backup_tracker.add_backup("duckdb", backup_id, {
                    "cid": result["cid"],
                    "tables": tables or result.get("tables", []),
                    "row_count": result.get("row_count", {}),
                    "timestamp": datetime.now().isoformat(),
                    "metadata": metadata or {}
                })
                
                # Add to content index if available and not already handled by DuckDB IPLD export
                if self.content_index_integration and self.config["add_to_content_index"]:
                    try:
                        entry = {
                            "cid": result["cid"],
                            "path": f"/backups/duckdb/{backup_id}",
                            "size": result.get("size", 0),
                            "mimetype": "application/x-duckdb-ipld",
                            "metadata": {
                                "backup_type": "duckdb",
                                "tables": tables or result.get("tables", []),
                                "timestamp": backup_info["timestamp"],
                                "row_count": result.get("row_count", {}),
                                "custom_metadata": metadata or {}
                            }
                        }
                        
                        await self.content_index_integration.add_entry(entry)
                        logger.info(f"Added backup metadata to PyArrow content index")
                    except Exception as e:
                        logger.warning(f"Failed to add content index entry: {e}")
                
                # Apply retention policy
                self._apply_retention_policy("duckdb")
                
                return {
                    "success": True,
                    "backup_id": backup_id,
                    "cid": result["cid"],
                    "timestamp": backup_info["timestamp"],
                    "tables": tables or result.get("tables", []),
                    "row_count": result.get("row_count", {})
                }
            
            # Otherwise, use manual export
            else:
                logger.info("Using manual DuckDB export")
                
                # Get tables to backup
                if not tables:
                    try:
                        # Query for all tables
                        result = await self.resources["duckDb"].query(
                            "SELECT table_name FROM information_schema.tables WHERE table_schema='main'",
                            {"auth_token": auth_token}
                        )
                        tables = [row["table_name"] for row in result]
                    except Exception as e:
                        raise ValueError(f"Unable to get DuckDB tables: {e}")
                
                if not tables:
                    logger.warning("No DuckDB tables found")
                    return {"success": False, "error": "No tables found"}
                
                logger.info(f"Backing up DuckDB tables: {tables}")
                
                # Create a temporary directory for the backup files
                backup_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                temp_backup_dir = os.path.join(self.config["temp_dir"], f"duckdb_backup_{backup_timestamp}")
                os.makedirs(temp_backup_dir, exist_ok=True)
                
                # Process each table
                table_data = {}
                for table in tables:
                    try:
                        # Get row count
                        count_result = await self.resources["duckDb"].query(
                            f'SELECT COUNT(*) as count FROM "{table}"',
                            {"auth_token": auth_token}
                        )
                        
                        count = count_result[0]["count"] if count_result else 0
                        table_data[table] = {"row_count": count}
                        
                        # For tables with reasonable size, export the data
                        if count <= 10000:  # Limit to avoid exporting huge tables
                            # Export table data
                            data_result = await self.resources["duckDb"].query(
                                f'SELECT * FROM "{table}"',
                                {"auth_token": auth_token}
                            )
                            
                            # Save to a JSON file
                            table_file = os.path.join(temp_backup_dir, f"{table}.json")
                            with open(table_file, "w") as f:
                                json.dump(data_result, f, indent=2)
                            
                            logger.info(f"Exported {count} rows from table {table}")
                        else:
                            logger.info(f"Table {table} has {count} rows, skipping data export (metadata only)")
                            
                            # Save just the table schema
                            schema_result = await self.resources["duckDb"].query(
                                f"DESCRIBE {table}",
                                {"auth_token": auth_token}
                            )
                            
                            schema_file = os.path.join(temp_backup_dir, f"{table}_schema.json")
                            with open(schema_file, "w") as f:
                                json.dump(schema_result, f, indent=2)
                    
                    except Exception as e:
                        logger.error(f"Error backing up table {table}: {e}")
                        table_data[table] = {"error": str(e)}
                
                # Create a manifest file with metadata
                backup_id = f"duckdb_{backup_timestamp}"
                manifest = {
                    "type": "duckdb",
                    "tables": tables,
                    "timestamp": datetime.now().isoformat(),
                    "row_count": {
                        table: data.get("row_count", 0) for table, data in table_data.items()
                    },
                    "metadata": metadata or {}
                }
                
                manifest_file = os.path.join(temp_backup_dir, "manifest.json")
                with open(manifest_file, "w") as f:
                    json.dump(manifest, f, indent=2)
                
                # Add the backup directory to IPFS
                try:
                    # Use ipfs_kit to add directory
                    if hasattr(self.ipfs_kit, "add_directory"):
                        result = await self.ipfs_kit.add_directory(temp_backup_dir)
                        root_cid = result.get("cid") or result.get("hash")
                    else:
                        # Fallback method
                        result = await self.ipfs_kit.add(temp_backup_dir, recursive=True)
                        # Get the root directory CID
                        root_cid = result[-1].get("cid") or result[-1].get("hash")
                    
                    logger.info(f"Backup added to IPFS with CID: {root_cid}")
                    
                    # Add to content index if available
                    if self.content_index_integration and self.config["add_to_content_index"]:
                        entry = {
                            "cid": root_cid,
                            "path": f"/backups/duckdb/{backup_id}",
                            "size": sum(os.path.getsize(os.path.join(dirpath, filename)) 
                                    for dirpath, _, filenames in os.walk(temp_backup_dir) 
                                    for filename in filenames),
                            "mimetype": "application/x-directory",
                            "metadata": {
                                "backup_type": "duckdb",
                                "tables": tables,
                                "timestamp": manifest["timestamp"],
                                "row_count": manifest["row_count"],
                                "custom_metadata": metadata or {}
                            }
                        }
                        
                        await self.content_index_integration.add_entry(entry)
                        logger.info(f"Added backup metadata to PyArrow content index")
                except Exception as e:
                    logger.error(f"Error adding backup to IPFS: {e}")
                    raise ValueError(f"Failed to add backup to IPFS: {e}")
                
                # Track the backup
                backup_info = self.backup_tracker.add_backup("duckdb", backup_id, {
                    "cid": root_cid,
                    "tables": tables,
                    "row_count": manifest["row_count"],
                    "timestamp": manifest["timestamp"],
                    "metadata": metadata or {}
                })
                
                # Apply retention policy
                self._apply_retention_policy("duckdb")
                
                # Clean up temporary directory
                import shutil
                shutil.rmtree(temp_backup_dir)
                
                return {
                    "success": True,
                    "backup_id": backup_id,
                    "cid": root_cid,
                    "timestamp": manifest["timestamp"],
                    "tables": tables,
                    "row_count": manifest["row_count"]
                }
                
        except Exception as e:
            logger.error(f"Error backing up DuckDB: {e}")
            raise ValueError(f"Backup failed: {e}")
    
    async def restore_orbitdb(self, backup_id=None, cid=None, auth_token=None, target_collections=None):
        """
        Restore OrbitDB from backup
        
        Args:
            backup_id (str): Backup ID to restore
            cid (str): IPFS CID to restore (alternative to backup_id)
            auth_token (str): Authentication token
            target_collections (list): Specific collections to restore (None for all)
            
        Returns:
            dict: Restore result
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["RESTORE_ORBITDB"], auth_token)
        
        # Verify OrbitDB is available
        if not self.resources.get("orbitDb"):
            raise ValueError("OrbitDB resource not available")
        
        # Verify IPFS Kit is available
        if not self.ipfs_kit:
            raise ValueError("IPFS Kit not available")
        
        try:
            # Get backup info
            if backup_id:
                backup_info = self.backup_tracker.get_backup("orbitdb", backup_id)
                if not backup_info:
                    raise ValueError(f"Backup ID {backup_id} not found")
                
                cid = backup_info["cid"]
            elif not cid:
                raise ValueError("Either backup_id or cid must be provided")
            
            logger.info(f"Restoring OrbitDB from CID: {cid}")
            
            # Create temporary directory for restoration
            restore_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            temp_restore_dir = os.path.join(self.config["temp_dir"], f"orbitdb_restore_{restore_timestamp}")
            os.makedirs(temp_restore_dir, exist_ok=True)
            
            # Get the backup from IPFS
            try:
                # Use ipfs_kit to get directory
                if hasattr(self.ipfs_kit, "get"):
                    await self.ipfs_kit.get(cid, temp_restore_dir)
                else:
                    # Fallback to manually downloading files
                    # This is a simplified approach, a real implementation would need more complex handling
                    if hasattr(self.ipfs_kit, "ls"):
                        files = await self.ipfs_kit.ls(cid)
                        for file in files:
                            file_path = os.path.join(temp_restore_dir, file["name"])
                            file_data = await self.ipfs_kit.cat(file["hash"])
                            with open(file_path, "wb") as f:
                                f.write(file_data)
                    else:
                        raise ValueError("IPFS Kit doesn't support required functionality")
            except Exception as e:
                logger.error(f"Error retrieving backup from IPFS: {e}")
                raise ValueError(f"Failed to retrieve backup: {e}")
            
            # Load the manifest
            manifest_path = os.path.join(temp_restore_dir, "manifest.json")
            if not os.path.exists(manifest_path):
                raise ValueError("Invalid backup: manifest.json not found")
            
            with open(manifest_path, "r") as f:
                manifest = json.load(f)
            
            if manifest.get("type") != "orbitdb":
                raise ValueError(f"Invalid backup type: {manifest.get('type')}, expected: orbitdb")
            
            # Determine which collections to restore
            collections_to_restore = target_collections or manifest.get("collections", [])
            
            # Keep track of restoration status
            restoration_status = {
                "success": True,
                "collections": {},
                "document_count": 0
            }
            
            # Restore each collection
            for collection in collections_to_restore:
                collection_file = os.path.join(temp_restore_dir, f"{collection}.json")
                
                if not os.path.exists(collection_file):
                    logger.warning(f"Collection file for {collection} not found in backup")
                    restoration_status["collections"][collection] = {
                        "success": False,
                        "error": "Collection file not found in backup"
                    }
                    continue
                
                try:
                    # Load documents from file
                    with open(collection_file, "r") as f:
                        documents = json.load(f)
                    
                    if not documents:
                        logger.info(f"No documents to restore for collection {collection}")
                        restoration_status["collections"][collection] = {
                            "success": True,
                            "documents_restored": 0
                        }
                        continue
                    
                    # Count documents to restore
                    document_count = len(documents)
                    
                    # Restore documents to OrbitDB
                    success_count = 0
                    for doc in documents:
                        try:
                            # Check if document has _id
                            doc_id = doc.get("_id")
                            if not doc_id:
                                logger.warning(f"Document without _id in collection {collection}, skipping")
                                continue
                            
                            # Put document in OrbitDB
                            result = await self.resources["orbitDb"].put(collection, doc, {
                                "auth_token": auth_token
                            })
                            
                            if result and (result.get("success", False) or result.get("id")):
                                success_count += 1
                            
                        except Exception as e:
                            logger.error(f"Error restoring document in collection {collection}: {e}")
                    
                    # Update restoration status
                    restoration_status["collections"][collection] = {
                        "success": success_count > 0,
                        "documents_restored": success_count,
                        "total_documents": document_count
                    }
                    
                    restoration_status["document_count"] += success_count
                    
                    logger.info(f"Restored {success_count}/{document_count} documents to collection {collection}")
                    
                except Exception as e:
                    logger.error(f"Error restoring collection {collection}: {e}")
                    restoration_status["collections"][collection] = {
                        "success": False,
                        "error": str(e)
                    }
                    restoration_status["success"] = False
            
            # Clean up temporary directory
            import shutil
            shutil.rmtree(temp_restore_dir)
            
            return {
                "success": restoration_status["success"],
                "backup_id": backup_id,
                "cid": cid,
                "collections": restoration_status["collections"],
                "document_count": restoration_status["document_count"],
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error restoring OrbitDB: {e}")
            raise ValueError(f"Restore failed: {e}")
    
    async def restore_fireproofdb(self, backup_id=None, cid=None, auth_token=None, target_collections=None):
        """
        Restore FireproofDB from backup
        
        Args:
            backup_id (str): Backup ID to restore
            cid (str): IPFS CID to restore (alternative to backup_id)
            auth_token (str): Authentication token
            target_collections (list): Specific collections to restore (None for all)
            
        Returns:
            dict: Restore result
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["RESTORE_FIREPROOFDB"], auth_token)
        
        # Verify FireproofDB is available
        if not self.resources.get("fireproofDb"):
            raise ValueError("FireproofDB resource not available")
        
        # Verify IPFS Kit is available
        if not self.ipfs_kit:
            raise ValueError("IPFS Kit not available")
        
        try:
            # Get backup info
            if backup_id:
                backup_info = self.backup_tracker.get_backup("fireproofdb", backup_id)
                if not backup_info:
                    raise ValueError(f"Backup ID {backup_id} not found")
                
                cid = backup_info["cid"]
            elif not cid:
                raise ValueError("Either backup_id or cid must be provided")
            
            logger.info(f"Restoring FireproofDB from CID: {cid}")
            
            # Create temporary directory for restoration
            restore_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            temp_restore_dir = os.path.join(self.config["temp_dir"], f"fireproofdb_restore_{restore_timestamp}")
            os.makedirs(temp_restore_dir, exist_ok=True)
            
            # Get the backup from IPFS
            try:
                # Use ipfs_kit to get directory
                if hasattr(self.ipfs_kit, "get"):
                    await self.ipfs_kit.get(cid, temp_restore_dir)
                else:
                    # Fallback to manually downloading files
                    # This is a simplified approach, a real implementation would need more complex handling
                    if hasattr(self.ipfs_kit, "ls"):
                        files = await self.ipfs_kit.ls(cid)
                        for file in files:
                            file_path = os.path.join(temp_restore_dir, file["name"])
                            file_data = await self.ipfs_kit.cat(file["hash"])
                            with open(file_path, "wb") as f:
                                f.write(file_data)
                    else:
                        raise ValueError("IPFS Kit doesn't support required functionality")
            except Exception as e:
                logger.error(f"Error retrieving backup from IPFS: {e}")
                raise ValueError(f"Failed to retrieve backup: {e}")
            
            # Load the manifest
            manifest_path = os.path.join(temp_restore_dir, "manifest.json")
            if not os.path.exists(manifest_path):
                raise ValueError("Invalid backup: manifest.json not found")
            
            with open(manifest_path, "r") as f:
                manifest = json.load(f)
            
            if manifest.get("type") != "fireproofdb":
                raise ValueError(f"Invalid backup type: {manifest.get('type')}, expected: fireproofdb")
            
            # Determine which collections to restore
            collections_to_restore = target_collections or manifest.get("collections", [])
            
            # Keep track of restoration status
            restoration_status = {
                "success": True,
                "collections": {},
                "document_count": 0
            }
            
            # Restore each collection
            for collection in collections_to_restore:
                collection_file = os.path.join(temp_restore_dir, f"{collection}.json")
                
                if not os.path.exists(collection_file):
                    logger.warning(f"Collection file for {collection} not found in backup")
                    restoration_status["collections"][collection] = {
                        "success": False,
                        "error": "Collection file not found in backup"
                    }
                    continue
                
                try:
                    # Load documents from file
                    with open(collection_file, "r") as f:
                        documents = json.load(f)
                    
                    if not documents:
                        logger.info(f"No documents to restore for collection {collection}")
                        restoration_status["collections"][collection] = {
                            "success": True,
                            "documents_restored": 0
                        }
                        continue
                    
                    # Count documents to restore
                    document_count = len(documents)
                    
                    # Restore documents to FireproofDB
                    success_count = 0
                    for doc in documents:
                        try:
                            # Check if document has _id
                            doc_id = doc.get("_id")
                            if not doc_id:
                                logger.warning(f"Document without _id in collection {collection}, skipping")
                                continue
                            
                            # Put document in FireproofDB
                            result = await self.resources["fireproofDb"].put(collection, doc, {
                                "auth_token": auth_token
                            })
                            
                            if result and (result.get("success", False) or result.get("id")):
                                success_count += 1
                            
                        except Exception as e:
                            logger.error(f"Error restoring document in collection {collection}: {e}")
                    
                    # Update restoration status
                    restoration_status["collections"][collection] = {
                        "success": success_count > 0,
                        "documents_restored": success_count,
                        "total_documents": document_count
                    }
                    
                    restoration_status["document_count"] += success_count
                    
                    logger.info(f"Restored {success_count}/{document_count} documents to collection {collection}")
                    
                except Exception as e:
                    logger.error(f"Error restoring collection {collection}: {e}")
                    restoration_status["collections"][collection] = {
                        "success": False,
                        "error": str(e)
                    }
                    restoration_status["success"] = False
            
            # Clean up temporary directory
            import shutil
            shutil.rmtree(temp_restore_dir)
            
            return {
                "success": restoration_status["success"],
                "backup_id": backup_id,
                "cid": cid,
                "collections": restoration_status["collections"],
                "document_count": restoration_status["document_count"],
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error restoring FireproofDB: {e}")
            raise ValueError(f"Restore failed: {e}")
    
    async def restore_duckdb(self, backup_id=None, cid=None, auth_token=None, target_tables=None):
        """
        Restore DuckDB from backup
        
        Args:
            backup_id (str): Backup ID to restore
            cid (str): IPFS CID to restore (alternative to backup_id)
            auth_token (str): Authentication token
            target_tables (list): Specific tables to restore (None for all)
            
        Returns:
            dict: Restore result
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["RESTORE_DUCKDB"], auth_token)
        
        # Verify DuckDB is available
        if not self.resources.get("duckDb"):
            raise ValueError("DuckDB resource not available")
        
        # Verify IPFS Kit is available
        if not self.ipfs_kit:
            raise ValueError("IPFS Kit not available")
        
        try:
            # Get backup info
            if backup_id:
                backup_info = self.backup_tracker.get_backup("duckdb", backup_id)
                if not backup_info:
                    raise ValueError(f"Backup ID {backup_id} not found")
                
                cid = backup_info["cid"]
            elif not cid:
                raise ValueError("Either backup_id or cid must be provided")
            
            logger.info(f"Restoring DuckDB from CID: {cid}")
            
            # Try using native DuckDB IPLD import if available
            if hasattr(self.resources["duckDb"], "import_ipld_to_database"):
                logger.info("Using DuckDB's native IPLD import capability")
                
                # Import directly
                result = await self.resources["duckDb"].import_ipld_to_database(
                    cid,
                    {"auth_token": auth_token, "tables": target_tables}
                )
                
                if not result or not result.get("success", False):
                    raise ValueError(f"Failed to import from IPLD: {result.get('error', 'Unknown error')}")
                
                return {
                    "success": True,
                    "backup_id": backup_id,
                    "cid": cid,
                    "tables": result.get("tables", []),
                    "row_count": result.get("row_count", {}),
                    "timestamp": datetime.now().isoformat()
                }
            
            # Otherwise, use manual import
            logger.info("Using manual DuckDB import")
            
            # Create temporary directory for restoration
            restore_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            temp_restore_dir = os.path.join(self.config["temp_dir"], f"duckdb_restore_{restore_timestamp}")
            os.makedirs(temp_restore_dir, exist_ok=True)
            
            # Get the backup from IPFS
            try:
                # Use ipfs_kit to get directory
                if hasattr(self.ipfs_kit, "get"):
                    await self.ipfs_kit.get(cid, temp_restore_dir)
                else:
                    # Fallback to manually downloading files
                    # This is a simplified approach, a real implementation would need more complex handling
                    if hasattr(self.ipfs_kit, "ls"):
                        files = await self.ipfs_kit.ls(cid)
                        for file in files:
                            file_path = os.path.join(temp_restore_dir, file["name"])
                            file_data = await self.ipfs_kit.cat(file["hash"])
                            with open(file_path, "wb") as f:
                                f.write(file_data)
                    else:
                        raise ValueError("IPFS Kit doesn't support required functionality")
            except Exception as e:
                logger.error(f"Error retrieving backup from IPFS: {e}")
                raise ValueError(f"Failed to retrieve backup: {e}")
            
            # Load the manifest
            manifest_path = os.path.join(temp_restore_dir, "manifest.json")
            if not os.path.exists(manifest_path):
                raise ValueError("Invalid backup: manifest.json not found")
            
            with open(manifest_path, "r") as f:
                manifest = json.load(f)
            
            if manifest.get("type") != "duckdb":
                raise ValueError(f"Invalid backup type: {manifest.get('type')}, expected: duckdb")
            
            # Determine which tables to restore
            tables_to_restore = target_tables or manifest.get("tables", [])
            
            # Keep track of restoration status
            restoration_status = {
                "success": True,
                "tables": {},
                "row_count": 0
            }
            
            # Restore each table
            for table in tables_to_restore:
                table_file = os.path.join(temp_restore_dir, f"{table}.json")
                schema_file = os.path.join(temp_restore_dir, f"{table}_schema.json")
                
                # Check if data file exists, otherwise use schema file
                if os.path.exists(table_file):
                    try:
                        # Load data from file
                        with open(table_file, "r") as f:
                            data = json.load(f)
                        
                        if not data:
                            logger.info(f"No data to restore for table {table}")
                            restoration_status["tables"][table] = {
                                "success": True,
                                "rows_restored": 0
                            }
                            continue
                        
                        # Create table from first row schema if it doesn't exist
                        first_row = data[0] if data else {}
                        columns = []
                        
                        for key, value in first_row.items():
                            # Infer column type
                            if isinstance(value, int):
                                columns.append(f"{key} INTEGER")
                            elif isinstance(value, float):
                                columns.append(f"{key} DOUBLE")
                            elif isinstance(value, bool):
                                columns.append(f"{key} BOOLEAN")
                            else:
                                columns.append(f"{key} VARCHAR")
                        
                        if columns:
                            # Create table
                            create_table_sql = f"""
                            CREATE TABLE IF NOT EXISTS "{table}" (
                                {', '.join(columns)}
                            )
                            """
                            
                            await self.resources["duckDb"].execute(
                                create_table_sql,
                                {"auth_token": auth_token}
                            )
                            
                            # Insert data row by row (not efficient but safe for this sample)
                            rows_inserted = 0
                            for row in data:
                                try:
                                    # Build insert SQL
                                    columns_str = ', '.join([f'"{k}"' for k in row.keys()])
                                    values_str = ', '.join([
                                        "NULL" if v is None else
                                        str(v) if isinstance(v, (int, float)) else
                                        "TRUE" if v is True else
                                        "FALSE" if v is False else
                                        "'" + str(v).replace("'", "''") + "'"
                                        for v in row.values()
                                    ])
                                    
                                    insert_sql = f"""
                                    INSERT INTO "{table}" ({columns_str})
                                    VALUES ({values_str})
                                    """
                                    
                                    result = await self.resources["duckDb"].execute(
                                        insert_sql,
                                        {"auth_token": auth_token}
                                    )
                                    
                                    if result and result.get("success", False):
                                        rows_inserted += 1
                                    
                                except Exception as e:
                                    logger.error(f"Error inserting row into table {table}: {e}")
                            
                            # Update restoration status
                            restoration_status["tables"][table] = {
                                "success": rows_inserted > 0,
                                "rows_restored": rows_inserted,
                                "total_rows": len(data)
                            }
                            
                            restoration_status["row_count"] += rows_inserted
                            
                            logger.info(f"Restored {rows_inserted}/{len(data)} rows to table {table}")
                        else:
                            logger.warning(f"No columns found for table {table}")
                            restoration_status["tables"][table] = {
                                "success": False,
                                "error": "No columns found"
                            }
                    
                    except Exception as e:
                        logger.error(f"Error restoring table {table}: {e}")
                        restoration_status["tables"][table] = {
                            "success": False,
                            "error": str(e)
                        }
                        restoration_status["success"] = False
                
                # If only schema file exists (for large tables that weren't fully exported)
                elif os.path.exists(schema_file):
                    try:
                        # Load schema from file
                        with open(schema_file, "r") as f:
                            schema = json.load(f)
                        
                        if not schema:
                            logger.info(f"No schema to restore for table {table}")
                            restoration_status["tables"][table] = {
                                "success": True,
                                "schema_only": True
                            }
                            continue
                        
                        # Create table from schema
                        columns = []
                        for col in schema:
                            column_name = col.get("column_name", "")
                            column_type = col.get("column_type", "VARCHAR")
                            
                            if column_name:
                                columns.append(f'"{column_name}" {column_type}')
                        
                        if columns:
                            # Create table
                            create_table_sql = f"""
                            CREATE TABLE IF NOT EXISTS "{table}" (
                                {', '.join(columns)}
                            )
                            """
                            
                            result = await self.resources["duckDb"].execute(
                                create_table_sql,
                                {"auth_token": auth_token}
                            )
                            
                            restoration_status["tables"][table] = {
                                "success": result and result.get("success", False),
                                "schema_only": True
                            }
                            
                            logger.info(f"Restored schema for table {table} (data not included in backup)")
                        else:
                            logger.warning(f"No columns found in schema for table {table}")
                            restoration_status["tables"][table] = {
                                "success": False,
                                "error": "No columns found in schema"
                            }
                    
                    except Exception as e:
                        logger.error(f"Error restoring schema for table {table}: {e}")
                        restoration_status["tables"][table] = {
                            "success": False,
                            "error": str(e)
                        }
                        restoration_status["success"] = False
                
                else:
                    logger.warning(f"Table data or schema for {table} not found in backup")
                    restoration_status["tables"][table] = {
                        "success": False,
                        "error": "Table data or schema not found in backup"
                    }
            
            # Clean up temporary directory
            import shutil
            shutil.rmtree(temp_restore_dir)
            
            return {
                "success": restoration_status["success"],
                "backup_id": backup_id,
                "cid": cid,
                "tables": restoration_status["tables"],
                "row_count": restoration_status["row_count"],
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error restoring DuckDB: {e}")
            raise ValueError(f"Restore failed: {e}")
    
    def _apply_retention_policy(self, db_type):
        """
        Apply retention policy to backups
        
        Args:
            db_type (str): Type of database
        """
        try:
            # Get backups for this database type
            backups = self.backup_tracker.list_backups(db_type)
            
            # If below retention limit, do nothing
            if len(backups) <= self.config["retention_count"]:
                return
            
            # Get the oldest backups to remove
            to_remove = backups[self.config["retention_count"]:]
            
            for backup in to_remove:
                backup_id = backup.get("backup_id")
                if backup_id:
                    # Remove from tracker
                    self.backup_tracker.remove_backup(db_type, backup_id)
                    logger.info(f"Removed old backup {backup_id} due to retention policy")
                    
                    # Note: We don't remove from IPFS since other nodes might be using this data
                    # and IPFS has its own garbage collection for unpinned content
        except Exception as e:
            logger.error(f"Error applying retention policy for {db_type}: {e}")
    
    def start_scheduler(self):
        """Start the scheduled backup checker"""
        def scheduler_task():
            try:
                # Check for due schedules
                due_schedules = self.backup_tracker.get_due_schedules()
                
                if due_schedules:
                    logger.info(f"Running {len(due_schedules)} scheduled backups")
                    
                    # Create an event loop for async operations
                    loop = asyncio.new_event_loop()
                    
                    for schedule in due_schedules:
                        try:
                            schedule_id = schedule.get("id")
                            db_type = schedule.get("db_type")
                            collections = schedule.get("collections")
                            token = schedule.get("auth_token")
                            
                            # Perform backup based on database type
                            if db_type == "orbitdb":
                                result = loop.run_until_complete(
                                    self.backup_orbitdb(collections, token)
                                )
                                logger.info(f"Scheduled backup of OrbitDB completed: {result.get('backup_id')}")
                            
                            elif db_type == "fireproofdb":
                                result = loop.run_until_complete(
                                    self.backup_fireproofdb(collections, token)
                                )
                                logger.info(f"Scheduled backup of FireproofDB completed: {result.get('backup_id')}")
                            
                            elif db_type == "duckdb":
                                result = loop.run_until_complete(
                                    self.backup_duckdb(collections, token)
                                )
                                logger.info(f"Scheduled backup of DuckDB completed: {result.get('backup_id')}")
                            
                            # Update the last run timestamp
                            self.backup_tracker.update_schedule_last_run(schedule_id)
                            
                        except Exception as e:
                            logger.error(f"Error running scheduled backup {schedule.get('id')}: {e}")
                    
                    # Close the event loop
                    loop.close()
                
                # Reschedule the task
                self.scheduler_timer = threading.Timer(
                    self.config["scheduler_interval"] * 60, 
                    scheduler_task
                )
                self.scheduler_timer.daemon = True
                self.scheduler_timer.start()
                
            except Exception as e:
                logger.error(f"Error in scheduler task: {e}")
                
                # Reschedule even after error
                self.scheduler_timer = threading.Timer(
                    self.config["scheduler_interval"] * 60, 
                    scheduler_task
                )
                self.scheduler_timer.daemon = True
                self.scheduler_timer.start()
        
        # Start the first task
        self.scheduler_timer = threading.Timer(
            self.config["scheduler_interval"] * 60, 
            scheduler_task
        )
        self.scheduler_timer.daemon = True
        self.scheduler_timer.start()
        
        logger.info(f"Backup scheduler started with interval of {self.config['scheduler_interval']} minutes")
    
    def stop_scheduler(self):
        """Stop the scheduled backup checker"""
        if self.scheduler_timer:
            self.scheduler_timer.cancel()
            self.scheduler_timer = None
            logger.info("Backup scheduler stopped")
    
    async def schedule_backup(self, schedule, auth_token):
        """
        Create a scheduled backup
        
        Args:
            schedule (dict): Schedule information
            auth_token (str): Authentication token
            
        Returns:
            dict: Schedule information
        """
        # Verify permission
        await self._verify_capability(BACKUP_CAPABILITIES["SCHEDULE_BACKUP"], auth_token)
        
        # Validate schedule
        if "db_type" not in schedule:
            raise ValueError("db_type is required")
        
        if schedule["db_type"] not in ["orbitdb", "fireproofdb", "duckdb"]:
            raise ValueError(f"Invalid db_type: {schedule['db_type']}")
        
        if "interval" not in schedule:
            raise ValueError("interval is required (in hours)")
        
        try:
            interval = float(schedule["interval"])
            if interval <= 0:
                raise ValueError("interval must be positive")
        except (ValueError, TypeError):
            raise ValueError("interval must be a number")
        
        # Add auth token to schedule
        if "auth_token" not in schedule:
            schedule["auth_token"] = auth_token
        
        # Add to scheduler
        schedule_id = self.backup_tracker.add_scheduled_backup(schedule)
        
        return {
            "success": True,
            "schedule_id": schedule_id,
            "schedule": self.backup_tracker.get_schedule(schedule_id)
        }
    
    async def list_schedules(self, auth_token):
        """
        List scheduled backups
        
        Args:
            auth_token (str): Authentication token
            
        Returns:
            dict: List of schedules
        """
        # Verify permission (admin capability needed to see all schedules)
        is_admin = await self._verify_capability(BACKUP_CAPABILITIES["ADMIN"], auth_token)
        
        # Get all schedules
        if not self.backup_tracker.backups.get("scheduled_backups"):
            return {
                "success": True,
                "schedules": []
            }
        
        # Filter schedules if not admin
        schedules = self.backup_tracker.backups["scheduled_backups"]
        if not is_admin:
            # Only include schedules created by this token
            # This is a simple approach and might need more sophisticated token tracking in practice
            schedules = [
                schedule for schedule in schedules
                if schedule.get("creator_token") == auth_token
            ]
        
        # Remove auth tokens from response
        sanitized_schedules = []
        for schedule in schedules:
            sanitized = {k: v for k, v in schedule.items() if k != "auth_token"}
            sanitized_schedules.append(sanitized)
        
        return {
            "success": True,
            "schedules": sanitized_schedules
        }
    
    async def delete_schedule(self, schedule_id, auth_token):
        """
        Delete a scheduled backup
        
        Args:
            schedule_id (int): Schedule ID
            auth_token (str): Authentication token
            
        Returns:
            dict: Success status
        """
        # Verify permission (admin capability needed to delete any schedule)
        is_admin = await self._verify_capability(BACKUP_CAPABILITIES["ADMIN"], auth_token)
        
        # Get schedule
        schedule = self.backup_tracker.get_schedule(schedule_id)
        if not schedule:
            raise ValueError(f"Schedule ID {schedule_id} not found")
        
        # Check if user has permission to delete this schedule
        if not is_admin and schedule.get("creator_token") != auth_token:
            raise ValueError("Permission denied: You can only delete your own schedules")
        
        # Delete schedule
        success = self.backup_tracker.remove_schedule(schedule_id)
        
        return {
            "success": success,
            "schedule_id": schedule_id
        }
    
    async def list_backups(self, db_type, auth_token):
        """
        List backups for a database type
        
        Args:
            db_type (str): Type of database
            auth_token (str): Authentication token
            
        Returns:
            dict: List of backups
        """
        # Verify permission (read permission for the specified database type)
        capability = f"backup:{db_type}"
        await self._verify_capability(capability, auth_token)
        
        # Get backups
        backups = self.backup_tracker.list_backups(db_type)
        
        return {
            "success": True,
            "db_type": db_type,
            "backups": backups
        }
    
    async def get_backup_info(self, db_type, backup_id, auth_token):
        """
        Get information about a specific backup
        
        Args:
            db_type (str): Type of database
            backup_id (str): Backup ID
            auth_token (str): Authentication token
            
        Returns:
            dict: Backup information
        """
        # Verify permission (read permission for the specified database type)
        capability = f"backup:{db_type}"
        await self._verify_capability(capability, auth_token)
        
        # Get backup info
        backup_info = self.backup_tracker.get_backup(db_type, backup_id)
        if not backup_info:
            raise ValueError(f"Backup ID {backup_id} not found for {db_type}")
        
        return {
            "success": True,
            "db_type": db_type,
            "backup_id": backup_id,
            "backup_info": backup_info
        }
    
    async def delete_backup(self, db_type, backup_id, auth_token):
        """
        Delete a backup
        
        Args:
            db_type (str): Type of database
            backup_id (str): Backup ID
            auth_token (str): Authentication token
            
        Returns:
            dict: Success status
        """
        # Verify permission (admin capability needed to delete backups)
        await self._verify_capability(BACKUP_CAPABILITIES["ADMIN"], auth_token)
        
        # Get backup info
        backup_info = self.backup_tracker.get_backup(db_type, backup_id)
        if not backup_info:
            raise ValueError(f"Backup ID {backup_id} not found for {db_type}")
        
        # Remove from tracker
        success = self.backup_tracker.remove_backup(db_type, backup_id)
        
        # Note: We don't remove from IPFS since other nodes might be using this data
        # and IPFS has its own garbage collection for unpinned content
        
        return {
            "success": success,
            "db_type": db_type,
            "backup_id": backup_id
        }
    
    async def close(self):
        """
        Clean up resources
        
        Returns:
            bool: Success status
        """
        try:
            # Stop scheduler
            self.stop_scheduler()
            
            # Clean up resources
            # (nothing else to clean up currently)
            
            return True
        except Exception as e:
            logger.error(f"Error closing database backup manager: {e}")
            return False


# Create singleton instance
database_backup_manager = DatabaseBackupManager()