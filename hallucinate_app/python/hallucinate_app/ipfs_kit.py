import os
import json
import logging
import sys
import tempfile
import subprocess
import shutil
import asyncio
import time
from pathlib import Path
import ipfs_kit_py

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_kit")

class IPFSKit:
    """Base class for IPFS interactions"""
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize IPFS Kit with resources and metadata
        
        Args:
            resources (dict): Resources required by the kit
            metadata (dict): Metadata for IPFS operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Get IPFS path from metadata or default
        self.ipfs_path = self.metadata.get('ipfsPath', os.path.expanduser("~/.cache/ipfs"))
        
        # Get role from metadata or default to leecher
        self.role = self.metadata.get('role', 'leecher')
        if self.role not in ['master', 'worker', 'leecher']:
            logger.warning(f"Invalid role '{self.role}', defaulting to 'leecher'")
            self.role = 'leecher'
            
        # Get cluster name from metadata or default
        self.cluster_name = self.metadata.get('clusterName', 'cloudkit_storage')
        
        # Initialize ipfs_kit_py instance
        self.ipfs_kit_py = ipfs_kit_py.IPFSKitPy(resources=self.resources, metadata=self.metadata)
        
        self.initialized = False
        logger.info(f"IPFSKit initialized with role={self.role}, path={self.ipfs_path}")
    
    async def init(self):
        """Initialize IPFS connections and services"""
        try:
            # Make sure IPFS is running
            is_ready = await self.is_ready()
            
            if not is_ready:
                # Start IPFS daemon
                await self.start_daemon()
                
                # Wait for daemon to be ready
                for _ in range(10):  # Try for 10 seconds
                    is_ready = await self.is_ready()
                    if is_ready:
                        break
                    await asyncio.sleep(1)
            
            if not is_ready:
                logger.error("Failed to start IPFS daemon")
                return False
                
            self.initialized = True
            logger.info("IPFSKit initialized successfully")
            return True
        except Exception as e:
            logger.error(f"IPFSKit initialization failed: {e}")
            return False
    
    async def is_ready(self):
        """Check if IPFS daemon is running and ready"""
        try:
            result = await self.ipfs_kit_py.ipfs_kit_ready()
            if isinstance(result, bool):
                return result
            elif isinstance(result, dict) and 'ipfs' in result:
                return result['ipfs']
            return False
        except Exception as e:
            logger.error(f"IPFS ready check failed: {e}")
            return False
    
    async def start_daemon(self):
        """Start IPFS daemon"""
        try:
            result = await self.ipfs_kit_py.ipfs_kit_start()
            return result.get('ipfs', False) not in [None, False]
        except Exception as e:
            logger.error(f"IPFS daemon start failed: {e}")
            return False
    
    async def stop_daemon(self):
        """Stop IPFS daemon"""
        try:
            result = await self.ipfs_kit_py.ipfs_kit_stop()
            return result.get('ipfs', False) not in [None, False]
        except Exception as e:
            logger.error(f"IPFS daemon stop failed: {e}")
            return False
    
    async def fetch_from_ipfs(self, cid, path=None):
        """
        Fetch content from IPFS by CID
        
        Args:
            cid (str): Content identifier
            path (str, optional): Path within the IPFS object
            
        Returns:
            dict: Content data and metadata
        """
        if not self.initialized:
            logger.warning("Attempted fetch before initialization")
            await self.init()
        
        try:
            # Create a temp path if none provided
            if path is None:
                temp_dir = tempfile.mkdtemp()
                path = os.path.join(temp_dir, "ipfs_fetch")
            
            # Fetch with ipfs_kit_py
            result = await self.ipfs_kit_py.ipget_download_object(cid, path)
            
            # Read the downloaded content
            with open(path, 'r') as f:
                content = f.read()
            
            # Clean up temp dir if we created one
            if path.startswith(temp_dir):
                shutil.rmtree(temp_dir)
                
            return {
                "cid": cid,
                "path": path,
                "data": content,
                "metadata": {
                    "size": len(content),
                    "created": "2023-01-01"  # Placeholder
                }
            }
        except Exception as e:
            logger.error(f"IPFS fetch failed: {e}")
            raise e
    
    async def add_to_ipfs(self, data, metadata=None):
        """
        Add content to IPFS
        
        Args:
            data (any): Data to add to IPFS
            metadata (dict, optional): Additional metadata
            
        Returns:
            str: Content identifier (CID)
        """
        if not self.initialized:
            logger.warning("Attempted add before initialization")
            await self.init()
        
        try:
            # Create a temp file with the data
            temp_dir = tempfile.mkdtemp()
            file_path = os.path.join(temp_dir, "ipfs_add")
            
            if isinstance(data, (str, bytes)):
                content = data
            else:
                content = json.dumps(data)
                
            # Write content to file
            with open(file_path, 'w') as f:
                f.write(content if isinstance(content, str) else content.decode())
            
            # Add to IPFS
            result = await self.ipfs_kit_py.ipfs_upload_object(file_path)
            
            # Clean up
            shutil.rmtree(temp_dir)
            
            # Extract CID from result
            ipfs_upload_object = result.get('ipfsUploadObject', {})
            results = ipfs_upload_object.get('results', [])
            
            if results and len(results) > 0:
                cid = results[0].get('hash', '')
                return {
                    "cid": cid,
                    "size": len(content),
                    "metadata": metadata or {}
                }
            else:
                logger.error("Failed to extract CID from upload result")
                return {
                    "cid": '',
                    "size": len(content),
                    "metadata": metadata or {}
                }
        except Exception as e:
            logger.error(f"IPFS add failed: {e}")
            raise e
    
    async def pin_cid(self, cid):
        """
        Pin a CID to IPFS
        
        Args:
            cid (str): Content identifier to pin
            
        Returns:
            dict: Result of pin operation
        """
        if not self.initialized:
            logger.warning("Attempted pin before initialization")
            await self.init()
            
        try:
            result = await self.ipfs_kit_py.ipfs_add_pin(cid)
            return result
        except Exception as e:
            logger.error(f"IPFS pin failed: {e}")
            raise e
    
    async def remove_pin(self, cid):
        """
        Remove a pin from IPFS
        
        Args:
            cid (str): Content identifier to unpin
            
        Returns:
            dict: Result of unpin operation
        """
        if not self.initialized:
            logger.warning("Attempted unpin before initialization")
            await self.init()
            
        try:
            result = await self.ipfs_kit_py.ipfs_remove_pin(cid)
            return result
        except Exception as e:
            logger.error(f"IPFS unpin failed: {e}")
            raise e
    
    async def get_config(self):
        """
        Get IPFS configuration
        
        Returns:
            dict: IPFS configuration
        """
        if not self.initialized:
            logger.warning("Attempted get config before initialization")
            await self.init()
            
        try:
            result = await self.ipfs_kit_py.ipfs_get_config()
            return result
        except Exception as e:
            logger.error(f"IPFS get config failed: {e}")
            raise e
    
    def test(self):
        """
        Run tests for the IPFS Kit
        
        Returns:
            dict: Test results
        """
        logger.info("Running IPFS Kit tests")
        try:
            # Run basic connectivity test
            loop = asyncio.get_event_loop()
            is_ready = loop.run_until_complete(self.is_ready())
            
            # If not ready, try to start the daemon
            if not is_ready:
                logger.info("IPFS daemon not running, attempting to start")
                start_result = loop.run_until_complete(self.start_daemon())
                if start_result:
                    # Wait a bit for daemon to start
                    time.sleep(3)
                    is_ready = loop.run_until_complete(self.is_ready())
            
            # Initialize if needed and possible
            if is_ready and not self.initialized:
                init_result = loop.run_until_complete(self.init())
            else:
                init_result = self.initialized
                
            # Test operations if initialized
            ops_results = {
                "get": False,
                "add": False,
                "pin": False
            }
            
            if init_result:
                # Test add
                test_data = "IPFS Kit Python test data"
                try:
                    add_result = loop.run_until_complete(self.add_to_ipfs(test_data))
                    cid = add_result.get("cid", "")
                    ops_results["add"] = bool(cid)
                    
                    # Test pin if add worked
                    if ops_results["add"]:
                        try:
                            pin_result = loop.run_until_complete(self.pin_cid(cid))
                            ops_results["pin"] = (pin_result.get("ipfsAddPin") is not None or 
                                                 pin_result.get("ipfsClusterCtlAddPin") is not None)
                        except Exception as e:
                            logger.error(f"Pin test failed: {e}")
                            
                        # Test get
                        try:
                            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                                tmp_path = tmp.name
                                
                            get_result = loop.run_until_complete(self.fetch_from_ipfs(cid, tmp_path))
                            ops_results["get"] = os.path.exists(tmp_path) and "data" in get_result
                            
                            # Clean up temp file
                            try:
                                os.unlink(tmp_path)
                            except:
                                pass
                        except Exception as e:
                            logger.error(f"Get test failed: {e}")
                except Exception as e:
                    logger.error(f"Add test failed: {e}")
            
            # Compile test results
            results = {
                "success": is_ready and init_result and any(ops_results.values()),
                "module": "ipfs_kit",
                "initialization": init_result,
                "node_connection": is_ready,
                "content_operations": ops_results,
                "metadata": self.metadata
            }
            
            return results
        except Exception as e:
            logger.error(f"IPFS Kit test failed: {e}")
            return {
                "success": False,
                "module": "ipfs_kit",
                "error": str(e),
                "initialization": self.initialized,
                "node_connection": False,
                "content_operations": {
                    "get": False,
                    "add": False,
                    "pin": False
                },
                "metadata": self.metadata
            }

# Create default instance
ipfs_kit = IPFSKit()