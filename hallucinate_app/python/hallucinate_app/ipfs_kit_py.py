"""
IPFS Kit Python Module

This module provides a Python implementation of the IPFS Kit for the hallucinate_app project.
It serves as a wrapper for the IPFSKitServer and IPFSKitClient classes, managing the thread-based
IPFS operations to prevent blocking machine learning operations.
"""

import os
import time
import json
import logging
import threading
import traceback
from queue import Queue, Empty
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Import the actual server implementation
try:
    from hallucinate_app.ipfs_kit_server import IPFSKitServer, IPFSKitClient
except ImportError:
    from ipfs_kit_server import IPFSKitServer, IPFSKitClient

# Set up logging
logger = logging.getLogger(__name__)

class IPFSKitPy:
    """
    Python implementation of the IPFS Kit
    
    This class provides a high-level interface to IPFS operations, managing the thread-based
    server and client components to enable non-blocking IPFS operations. It's designed to be
    integrated with the hallucinate_app resource pool.
    """

    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Kit Python implementation
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}

        # Configuration
        self.config = {
            "ipfs_api_url": self.metadata.get("ipfs_api_url", "/ip4/127.0.0.1/tcp/5001"),
            "use_mock": self.metadata.get("use_mock", False),
            "ipfs_path": self.metadata.get("ipfs_path", os.path.expanduser("~/.ipfs"))
        }

        # Create queues for inter-thread communication
        self.request_queue = Queue()
        self.response_queue = Queue()

        # Create server instance
        self.server = IPFSKitServer(
            self.request_queue, 
            self.response_queue, 
            resources=self.resources, 
            metadata=self.metadata
        )

        # Create client instance
        self.client = IPFSKitClient(self.request_queue, self.response_queue)

        # Start server in a separate thread
        self.server_thread = threading.Thread(target=self.server.start)
        self.server_thread.daemon = True
        self.server_thread.start()

        # Keep track of initialization state
        self.initialized = False

        logger.info(f"IPFSKitPy initialized with API URL: {self.config['ipfs_api_url']}")

    async def init(self):
        """
        Initialize the IPFS Kit
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Get node info to verify connection
            node_info = await self.client.async_id()
            
            self.initialized = True
            logger.info(f"IPFS Kit initialized, connected to node: {node_info.get('ID', 'unknown')}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize IPFS Kit: {e}")
            return False

    async def add(self, path: str, **kwargs):
        """
        Add a file or directory to IPFS
        
        Args:
            path: Path to file or directory
            **kwargs: Additional options
            
        Returns:
            dict: IPFS add result
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_add(path, **kwargs)
    
    async def cat(self, cid: str):
        """
        Get the contents of a file from IPFS
        
        Args:
            cid: Content identifier
            
        Returns:
            bytes: File contents
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_cat(cid)
    
    async def get(self, cid: str, output_dir: str = "./ipfs_downloads"):
        """
        Download a file from IPFS
        
        Args:
            cid: Content identifier
            output_dir: Output directory
            
        Returns:
            str: Path to downloaded file
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_get(cid, output_dir)
    
    async def pin_add(self, cid: str, recursive: bool = True):
        """
        Pin a file in IPFS
        
        Args:
            cid: Content identifier
            recursive: Whether to pin recursively
            
        Returns:
            list: Pinned CIDs
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_pin_add(cid, recursive)
    
    async def pin_rm(self, cid: str, recursive: bool = True):
        """
        Remove a pin from IPFS
        
        Args:
            cid: Content identifier
            recursive: Whether to unpin recursively
            
        Returns:
            list: Unpinned CIDs
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_pin_rm(cid, recursive)
    
    async def pin_ls(self, cid: str = None, type_filter: str = "all"):
        """
        List pins in IPFS
        
        Args:
            cid: Content identifier (optional)
            type_filter: Pin type filter
            
        Returns:
            dict: List of pins
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_pin_ls(cid, type_filter)
    
    async def ls(self, cid: str):
        """
        List directory contents in IPFS
        
        Args:
            cid: Content identifier
            
        Returns:
            dict: Directory contents
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_ls(cid)

    async def vfs_mount(self, ipfs_path: str, mount_point: str, read_only: bool = True):
        """
        Mount an IPFS path to a local VFS mount point

        Args:
            ipfs_path: IPFS path or CID to mount
            mount_point: Local mount point
            read_only: Whether the mount should be read-only

        Returns:
            dict: Mount result
        """
        if not self.initialized:
            await self.init()

        return await self.client.async_vfs_mount(ipfs_path, mount_point, read_only)

    async def vfs_unmount(self, mount_point: str):
        """
        Unmount a local VFS mount point

        Args:
            mount_point: Local mount point

        Returns:
            dict: Unmount result
        """
        if not self.initialized:
            await self.init()

        return await self.client.async_vfs_unmount(mount_point)

    async def vfs_list_mounts(self):
        """
        List active VFS mounts

        Returns:
            dict: Mount listing
        """
        if not self.initialized:
            await self.init()

        return await self.client.async_vfs_list_mounts()
    
    async def id(self):
        """
        Get IPFS node information
        
        Returns:
            dict: Node information
        """
        if not self.initialized:
            await self.init()
            
        return await self.client.async_id()
    
    async def test(self):
        """
        Run a self-test
        
        Returns:
            dict: Test results
        """
        try:
            # Initialize if not already
            if not self.initialized:
                init_result = await self.init()
                if not init_result:
                    return {
                        "success": False,
                        "error": "Failed to initialize IPFS Kit",
                        "module": "ipfs_kit_py",
                        "tests": []
                    }
            
            # Set up test results
            test_results = {
                "success": True,
                "module": "ipfs_kit_py",
                "tests": []
            }
            
            # Test node ID
            try:
                node_info = await self.id()
                test_results["tests"].append({
                    "name": "id",
                    "success": True,
                    "result": node_info
                })
            except Exception as e:
                test_results["tests"].append({
                    "name": "id",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
            
            # Test adding a small file
            try:
                # Create a temporary file
                import tempfile
                temp_file = tempfile.NamedTemporaryFile(delete=False)
                temp_path = temp_file.name
                
                with open(temp_path, "w") as f:
                    f.write("Test content for IPFS Kit")
                
                # Add the file
                add_result = await self.add(temp_path)
                test_cid = add_result["Hash"]
                
                test_results["tests"].append({
                    "name": "add",
                    "success": True,
                    "result": add_result
                })
                
                # Test cat on the added file
                cat_result = await self.cat(test_cid)
                test_results["tests"].append({
                    "name": "cat",
                    "success": True,
                    "content_matches": cat_result.decode("utf-8") == "Test content for IPFS Kit"
                })
                
                # Test pin operations
                pin_result = await self.pin_add(test_cid)
                test_results["tests"].append({
                    "name": "pin_add",
                    "success": True,
                    "result": pin_result
                })
                
                pin_ls_result = await self.pin_ls()
                test_results["tests"].append({
                    "name": "pin_ls",
                    "success": True,
                    "result": "OK"  # Truncated for clarity
                })
                
                # Clean up
                os.unlink(temp_path)
                
            except Exception as e:
                traceback.print_exc()
                test_results["tests"].append({
                    "name": "file_operations",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
            
            # Update overall success
            test_results["success"] = all(t["success"] for t in test_results["tests"])
            
            return test_results
            
        except Exception as e:
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "module": "ipfs_kit_py",
                "tests": []
            }
    
    async def close(self):
        """
        Clean up resources
        
        Returns:
            bool: True if cleanup successful
        """
        try:
            # Stop the server
            self.client.stop_server()
            
            # Wait for server thread to exit
            if self.server_thread and self.server_thread.is_alive():
                self.server_thread.join(timeout=5.0)
            
            return True
        except Exception as e:
            logger.error(f"Error during IPFS Kit cleanup: {e}")
            return False


# Simple usage example
if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Create IPFS Kit instance
        ipfs_kit = IPFSKitPy(metadata={"use_mock": True})
        
        # Initialize
        await ipfs_kit.init()
        
        # Run test
        test_results = await ipfs_kit.test()
        print(json.dumps(test_results, indent=2))
        
        # Clean up
        await ipfs_kit.close()
    
    # Run the example
    asyncio.run(main())