import unittest
import os
import shutil
import tempfile
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
parent_dir = str(Path(__file__).parent.parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

try:
    from hallucinate_app.python.hallucinate_app.database_backup_manager import DatabaseBackupManager
    from hallucinate_app.python.hallucinate_app.auth import AuthManager
    from hallucinate_app.python.hallucinate_app.keystore import Keystore
except ImportError:
    print("Failed to import required modules. Make sure the project structure is correct.")
    raise

class TestDatabaseBackupManager(unittest.TestCase):
    """Test the DatabaseBackupManager functionality"""

    def setUp(self):
        """Set up test environment"""
        # Create a temporary directory for test data
        self.temp_dir = tempfile.mkdtemp()
        self.backup_dir = os.path.join(self.temp_dir, "backups")
        self.temp_backup_dir = os.path.join(self.temp_dir, "temp")
        
        # Ensure directories exist
        os.makedirs(self.backup_dir, exist_ok=True)
        os.makedirs(self.temp_backup_dir, exist_ok=True)
        
        # Create mock auth manager
        self.auth_manager = AuthManager(
            options={"use_mock_implementation": True}
        )
        
        # Create mock keystore
        self.keystore = Keystore(
            options={"use_mock_implementation": True}
        )
        
        # Initialize both components
        self.auth_manager.init()
        self.keystore.init()
        
        # Create mock resources
        self.resources = {
            "auth": self.auth_manager,
            "keystore": self.keystore,
            # Add other necessary mocks here
        }
        
        # Set up the backup manager
        self.backup_manager = DatabaseBackupManager(
            resources=self.resources,
            metadata={
                "backup_dir": self.backup_dir,
                "temp_dir": self.temp_backup_dir
            }
        )
        
        # Initialize the backup manager
        self.backup_manager.init()
        
    def tearDown(self):
        """Clean up after tests"""
        # Remove the temporary directory
        shutil.rmtree(self.temp_dir)
        
        # Clean up resources
        if hasattr(self, 'backup_manager') and self.backup_manager:
            self.backup_manager.close()
    
    def test_initialization(self):
        """Test initialization of the backup manager"""
        self.assertTrue(self.backup_manager.initialized)
        self.assertTrue(os.path.exists(self.backup_dir))
        self.assertTrue(os.path.exists(self.temp_backup_dir))
    
    def test_orbitdb_backup(self):
        """Test OrbitDB backup functionality"""
        # Create mock data to insert into backup metadata
        mock_data = {
            "databases": [
                {
                    "name": "test_db",
                    "collections": [
                        {
                            "name": "users",
                            "documents": [
                                {"id": "user1", "name": "Test User", "email": "test@example.com"},
                                {"id": "user2", "name": "Another User", "email": "another@example.com"}
                            ]
                        }
                    ]
                }
            ]
        }
        
        # Create a test file to simulate the database content
        test_data_path = os.path.join(self.temp_backup_dir, "orbitdb_test_data.json")
        with open(test_data_path, "w") as f:
            json.dump(mock_data, f)
            
        # Create a backup
        backup_result = self.backup_manager.backup_orbitdb(
            collections=["users"],
            auth_token="test-token",
            metadata={"description": "Test backup"}
        )
        
        # Verify backup success
        self.assertTrue(backup_result.get("success"))
        self.assertIsNotNone(backup_result.get("backup_id"))
        self.assertIsNotNone(backup_result.get("cid"))
        
        # Verify backup file exists
        backup_id = backup_result.get("backup_id")
        backup_file_path = os.path.join(self.backup_dir, "orbitdb", f"{backup_id}.json")
        self.assertTrue(os.path.exists(backup_file_path))
        
        # Verify metadata file exists
        metadata_file_path = os.path.join(self.backup_dir, "orbitdb", "metadata.json")
        self.assertTrue(os.path.exists(metadata_file_path))
        
        # Verify content in metadata file
        with open(metadata_file_path, "r") as f:
            metadata = json.load(f)
        
        self.assertIn(backup_id, metadata)
        self.assertEqual(metadata[backup_id]["collections"], ["users"])
        self.assertEqual(metadata[backup_id]["cid"], backup_result.get("cid"))
        self.assertEqual(metadata[backup_id]["metadata"]["description"], "Test backup")
    
    def test_list_backups(self):
        """Test listing backups for a specific database type"""
        # Create mock data for testing
        mock_data = {
            "databases": [
                {
                    "name": "test_db",
                    "collections": [
                        {
                            "name": "users",
                            "documents": [
                                {"id": "user1", "name": "Test User", "email": "test@example.com"}
                            ]
                        }
                    ]
                }
            ]
        }
        
        # Create two test backups
        test_data_path = os.path.join(self.temp_backup_dir, "orbitdb_test_data.json")
        with open(test_data_path, "w") as f:
            json.dump(mock_data, f)
            
        # Create first backup
        backup1 = self.backup_manager.backup_orbitdb(
            collections=["users"],
            auth_token="test-token",
            metadata={"description": "First backup"}
        )
        
        # Create second backup
        backup2 = self.backup_manager.backup_orbitdb(
            collections=["users"],
            auth_token="test-token", 
            metadata={"description": "Second backup"}
        )
        
        # List backups
        result = self.backup_manager.list_backups("orbitdb", "test-token")
        
        # Verify listing
        self.assertTrue(result.get("success"))
        backups = result.get("backups", [])
        self.assertEqual(len(backups), 2)
        
        # Verify backup details
        backup_ids = [b["backup_id"] for b in backups]
        self.assertIn(backup1["backup_id"], backup_ids)
        self.assertIn(backup2["backup_id"], backup_ids)
    
    def test_delete_backup(self):
        """Test deleting a backup"""
        # Create mock data for testing
        mock_data = {
            "databases": [
                {
                    "name": "test_db",
                    "collections": [
                        {
                            "name": "users",
                            "documents": [
                                {"id": "user1", "name": "Test User", "email": "test@example.com"}
                            ]
                        }
                    ]
                }
            ]
        }
        
        # Create test backup
        test_data_path = os.path.join(self.temp_backup_dir, "orbitdb_test_data.json")
        with open(test_data_path, "w") as f:
            json.dump(mock_data, f)
            
        backup = self.backup_manager.backup_orbitdb(
            collections=["users"],
            auth_token="test-token",
            metadata={"description": "Test backup"}
        )
        
        backup_id = backup["backup_id"]
        
        # Verify backup exists
        result = self.backup_manager.list_backups("orbitdb", "test-token")
        backups = result.get("backups", [])
        self.assertEqual(len(backups), 1)
        
        # Delete the backup
        delete_result = self.backup_manager.delete_backup("orbitdb", backup_id, "test-token")
        
        # Verify deletion success
        self.assertTrue(delete_result.get("success"))
        
        # Verify backup no longer exists
        result = self.backup_manager.list_backups("orbitdb", "test-token")
        backups = result.get("backups", [])
        self.assertEqual(len(backups), 0)
        
    def test_backup_scheduling(self):
        """Test backup scheduling functionality"""
        # Create a schedule
        schedule = {
            "db_type": "orbitdb",
            "collections": ["users"],
            "interval": 24,  # hours
            "description": "Daily users backup",
            "active": True
        }
        
        # Create the schedule
        schedule_result = self.backup_manager.schedule_backup(schedule, "test-token")
        
        # Verify schedule creation
        self.assertTrue(schedule_result.get("success"))
        self.assertIsNotNone(schedule_result.get("schedule_id"))
        
        # List schedules
        list_result = self.backup_manager.list_schedules("test-token")
        
        # Verify listing
        self.assertTrue(list_result.get("success"))
        schedules = list_result.get("schedules", [])
        self.assertEqual(len(schedules), 1)
        
        # Verify schedule details
        self.assertEqual(schedules[0]["db_type"], "orbitdb")
        self.assertEqual(schedules[0]["interval"], 24)
        self.assertEqual(schedules[0]["description"], "Daily users backup")
        
        # Delete the schedule
        delete_result = self.backup_manager.delete_schedule(
            schedules[0]["id"], 
            "test-token"
        )
        
        # Verify deletion
        self.assertTrue(delete_result.get("success"))
        
        # Verify schedule no longer exists
        list_result = self.backup_manager.list_schedules("test-token")
        schedules = list_result.get("schedules", [])
        self.assertEqual(len(schedules), 0)
    
    def test_pyarrow_content_index_integration(self):
        """Test integration with PyArrow content index"""
        # This test would verify that the backup manager correctly
        # registers backups with the PyArrow content index.
        # For this mock test, we'll just check that the backup CID
        # is correctly generated and would be registered.
        
        # Create mock data
        mock_data = {
            "databases": [
                {
                    "name": "test_db",
                    "collections": [
                        {
                            "name": "users",
                            "documents": [
                                {"id": "user1", "name": "Test User", "email": "test@example.com"}
                            ]
                        }
                    ]
                }
            ]
        }
        
        # Create test file to simulate database
        test_data_path = os.path.join(self.temp_backup_dir, "duckdb_test_data.json")
        with open(test_data_path, "w") as f:
            json.dump(mock_data, f)
            
        # Create backup with integration flag
        backup_result = self.backup_manager.backup_duckdb(
            tables=["users"],
            auth_token="test-token",
            metadata={
                "description": "Test backup",
                "register_in_content_index": True
            }
        )
        
        # Verify backup success
        self.assertTrue(backup_result.get("success"))
        self.assertIsNotNone(backup_result.get("backup_id"))
        self.assertIsNotNone(backup_result.get("cid"))
        
        # Verify content index registration flag
        backup_id = backup_result.get("backup_id")
        backup_file_path = os.path.join(self.backup_dir, "duckdb", f"{backup_id}.json")
        
        with open(backup_file_path, "r") as f:
            backup_data = json.load(f)
        
        # Check if the backup includes the content index registration flag
        self.assertTrue(backup_data.get("metadata", {}).get("register_in_content_index", False))
    
    def test_module_test_method(self):
        """Test the standard module test() method"""
        # Run the test method
        test_result = self.backup_manager.test()
        
        # Verify test structure and success
        self.assertIsInstance(test_result, dict)
        self.assertTrue(test_result.get("success"))
        self.assertIn("steps", test_result)
        self.assertIn("diagnostics", test_result)
        
        # Verify test steps
        steps = test_result.get("steps", {})
        self.assertIn("initialization", steps)
        self.assertIn("backup_orbitdb", steps)
        self.assertIn("backup_fireproofdb", steps)
        self.assertIn("backup_duckdb", steps)
        self.assertIn("scheduling", steps)
        
        # Verify success of individual steps
        for step, data in steps.items():
            self.assertTrue(data.get("success"), f"Step {step} failed")

if __name__ == "__main__":
    unittest.main()