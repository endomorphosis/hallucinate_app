"""
IPFS Kit Server

This module runs IPFS operations in a separate thread to prevent blocking machine learning
operations in the main thread. It provides a non-blocking interface to IPFS operations.

Communication is handled via thread-safe queues.
"""

import os
import time
import json
import logging
import threading
import traceback
from queue import Queue, Empty
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# Set up logging
logger = logging.getLogger(__name__)

# Try to import IPFS libraries (fallback to mock if not available)
try:
    import ipfshttpclient
    HAS_IPFS = True
except ImportError:
    HAS_IPFS = False
    logger.warning("ipfshttpclient not available, using mock implementation")


class IPFSKitServer:
    """
    Server for running IPFS operations in a separate thread
    
    This class implements a server that runs in its own thread and processes IPFS operations
    without blocking the main thread. Communication happens via thread-safe queues.
    """
    
    def __init__(self, request_queue: Queue, response_queue: Queue, 
                 resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Kit Server
        
        Args:
            request_queue: Queue for receiving operation requests
            response_queue: Queue for sending operation results
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.request_queue = request_queue
        self.response_queue = response_queue
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "ipfs_api_url": self.metadata.get("ipfs_api_url", "/ip4/127.0.0.1/tcp/5001"),
            "use_mock": self.metadata.get("use_mock", not HAS_IPFS),
            "timeout": self.metadata.get("timeout", 120)
        }
        
        # State
        self.running = False
        self.client = None
        self.mock_storage = {}  # For mock implementation
        
        logger.info(f"IPFSKitServer initialized with API URL: {self.config['ipfs_api_url']}")
    
    def start(self):
        """
        Start the IPFS Kit Server
        """
        if self.running:
            logger.warning("IPFS Kit Server already running")
            return
        
        # Initialize IPFS client
        try:
            if not self.config["use_mock"]:
                self.client = ipfshttpclient.connect(self.config["ipfs_api_url"])
                logger.info("Connected to IPFS daemon")
            else:
                logger.info("Using mock IPFS implementation")
            
            self.running = True
            
            # Process requests
            self._process_requests()
        except Exception as e:
            logger.error(f"Failed to start IPFS Kit Server: {e}")
            self.running = False
            self.response_queue.put({
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "command_id": None
            })
    
    def _process_requests(self):
        """
        Process requests from the request queue
        """
        logger.info("IPFS Kit Server started processing requests")
        
        while self.running:
            try:
                # Get request from queue
                request = self.request_queue.get(timeout=0.1)
                
                # Check if it's a stop command
                if request.get("command") == "stop":
                    logger.info("Received stop command")
                    self.running = False
                    self.request_queue.task_done()
                    break
                
                # Process the request
                command_id = request.get("command_id")
                command = request.get("command")
                params = request.get("params", {})
                
                logger.debug(f"Processing command: {command} (ID: {command_id})")
                
                try:
                    # Execute the command
                    result = self._execute_command(command, params)
                    
                    # Send the result
                    self.response_queue.put({
                        "status": "success",
                        "result": result,
                        "command_id": command_id
                    })
                except Exception as e:
                    logger.error(f"Error executing command {command}: {e}")
                    self.response_queue.put({
                        "status": "error",
                        "error": str(e),
                        "traceback": traceback.format_exc(),
                        "command_id": command_id
                    })
                
                # Mark the task as done
                self.request_queue.task_done()
            except Empty:
                # No requests in the queue, just continue
                pass
            except Exception as e:
                logger.error(f"Error in request processing loop: {e}")
                time.sleep(0.1)  # Avoid tight loop on error
        
        # Clean up
        if self.client and not self.config["use_mock"]:
            try:
                self.client.close()
                logger.info("Closed IPFS client connection")
            except Exception as e:
                logger.error(f"Error closing IPFS client: {e}")
        
        logger.info("IPFS Kit Server stopped")
    
    def _execute_command(self, command: str, params: Dict[str, Any]) -> Any:
        """
        Execute an IPFS command
        
        Args:
            command: The command to execute
            params: Parameters for the command
            
        Returns:
            Any: Result of the command
        """
        if self.config["use_mock"]:
            return self._execute_mock_command(command, params)
        else:
            return self._execute_real_command(command, params)
    
    def _execute_real_command(self, command: str, params: Dict[str, Any]) -> Any:
        """
        Execute a command using the real IPFS client
        
        Args:
            command: The command to execute
            params: Parameters for the command
            
        Returns:
            Any: Result of the command
        """
        if not self.client:
            raise ValueError("IPFS client not initialized")
        
        # Map commands to IPFS client methods
        command_map = {
            "add": self._real_add,
            "cat": self._real_cat,
            "get": self._real_get,
            "pin_add": self._real_pin_add,
            "pin_rm": self._real_pin_rm,
            "pin_ls": self._real_pin_ls,
            "ls": self._real_ls,
            "id": self._real_id
        }
        
        if command not in command_map:
            raise ValueError(f"Unknown command: {command}")
        
        # Execute the command
        return command_map[command](params)
    
    def _real_add(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Add a file to IPFS"""
        path = params.get("path")
        if not path:
            raise ValueError("Path parameter is required for add command")
        
        options = params.get("options", {})
        result = self.client.add(path, **options)
        return result
    
    def _real_cat(self, params: Dict[str, Any]) -> bytes:
        """Get file contents from IPFS"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for cat command")
        
        result = self.client.cat(cid)
        return result
    
    def _real_get(self, params: Dict[str, Any]) -> str:
        """Download a file from IPFS"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for get command")
        
        output_dir = params.get("output_dir", "./ipfs_downloads")
        result = self.client.get(cid, output_dir)
        return output_dir
    
    def _real_pin_add(self, params: Dict[str, Any]) -> List[str]:
        """Pin a file in IPFS"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for pin_add command")
        
        recursive = params.get("recursive", True)
        result = self.client.pin.add(cid, recursive=recursive)
        return result
    
    def _real_pin_rm(self, params: Dict[str, Any]) -> List[str]:
        """Unpin a file in IPFS"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for pin_rm command")
        
        recursive = params.get("recursive", True)
        result = self.client.pin.rm(cid, recursive=recursive)
        return result
    
    def _real_pin_ls(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List pinned files in IPFS"""
        cid = params.get("cid")
        type_filter = params.get("type", "all")
        result = self.client.pin.ls(cid, type=type_filter)
        return result
    
    def _real_ls(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List directory contents in IPFS"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for ls command")
        
        result = self.client.ls(cid)
        return result
    
    def _real_id(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get IPFS node information"""
        result = self.client.id()
        return result
    
    def _execute_mock_command(self, command: str, params: Dict[str, Any]) -> Any:
        """
        Execute a command using the mock IPFS implementation
        
        Args:
            command: The command to execute
            params: Parameters for the command
            
        Returns:
            Any: Result of the command
        """
        # Map commands to mock implementations
        command_map = {
            "add": self._mock_add,
            "cat": self._mock_cat,
            "get": self._mock_get,
            "pin_add": self._mock_pin_add,
            "pin_rm": self._mock_pin_rm,
            "pin_ls": self._mock_pin_ls,
            "ls": self._mock_ls,
            "id": self._mock_id
        }
        
        if command not in command_map:
            raise ValueError(f"Unknown command: {command}")
        
        # Add some delay to simulate network operation
        time.sleep(0.05)
        
        # Execute the command
        return command_map[command](params)
    
    def _mock_add(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Mock implementation of add command"""
        path = params.get("path")
        if not path:
            raise ValueError("Path parameter is required for add command")
        
        # Generate a mock CID based on the path
        import hashlib
        hash_obj = hashlib.sha256(path.encode())
        mock_cid = f"QmMock{hash_obj.hexdigest()[:40]}"
        
        # Store the file content in mock storage
        try:
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    content = f.read()
                self.mock_storage[mock_cid] = content
        except OSError:
            logger.warning(
                "Failed to read file %s into mock storage; returning mock CID without cached content",
                path,
                exc_info=True,
            )
        
        return {"Name": path, "Hash": mock_cid, "Size": "1234"}
    
    def _mock_cat(self, params: Dict[str, Any]) -> bytes:
        """Mock implementation of cat command"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for cat command")
        
        # Return mock content
        if cid in self.mock_storage:
            return self.mock_storage[cid]
        else:
            return f"Mock content for {cid}".encode()
    
    def _mock_get(self, params: Dict[str, Any]) -> str:
        """Mock implementation of get command"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for get command")
        
        output_dir = params.get("output_dir", "./ipfs_downloads")
        
        # Create mock output directory and file
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, cid)
        
        with open(output_path, "wb") as f:
            if cid in self.mock_storage:
                f.write(self.mock_storage[cid])
            else:
                f.write(f"Mock content for {cid}".encode())
        
        return output_dir
    
    def _mock_pin_add(self, params: Dict[str, Any]) -> List[str]:
        """Mock implementation of pin_add command"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for pin_add command")
        
        return [{"Pins": [cid]}]
    
    def _mock_pin_rm(self, params: Dict[str, Any]) -> List[str]:
        """Mock implementation of pin_rm command"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for pin_rm command")
        
        return [{"Pins": [cid]}]
    
    def _mock_pin_ls(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Mock implementation of pin_ls command"""
        pins = {}
        for i in range(5):
            mock_cid = f"QmMock{i:04d}"
            pins[mock_cid] = {"Type": "recursive"}
        
        return {"Keys": pins}
    
    def _mock_ls(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Mock implementation of ls command"""
        cid = params.get("cid")
        if not cid:
            raise ValueError("CID parameter is required for ls command")
        
        objects = []
        for i in range(3):
            objects.append({
                "Name": f"mock_file_{i}.txt",
                "Hash": f"QmMock{i:04d}",
                "Size": 1024,
                "Type": "File"
            })
        
        return {"Objects": [{"Hash": cid, "Links": objects}]}
    
    def _mock_id(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Mock implementation of id command"""
        return {
            "ID": "MockPeerID",
            "PublicKey": "MockPublicKey",
            "Addresses": ["/ip4/127.0.0.1/tcp/4001"],
            "AgentVersion": "go-ipfs/mock",
            "ProtocolVersion": "ipfs/mock"
        }


class IPFSKitClient:
    """
    Client for communicating with the IPFS Kit Server
    
    This class provides a client interface for sending commands to the IPFS Kit Server
    running in a separate thread.
    """
    
    def __init__(self, request_queue: Queue, response_queue: Queue):
        """
        Initialize the IPFS Kit Client
        
        Args:
            request_queue: Queue for sending operation requests
            response_queue: Queue for receiving operation results
        """
        self.request_queue = request_queue
        self.response_queue = response_queue
        self.command_id = 0
    
    def _get_next_command_id(self) -> str:
        """Get the next command ID"""
        self.command_id += 1
        return f"cmd_{self.command_id}"
    
    def _send_command(self, command: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Send a command to the IPFS Kit Server
        
        Args:
            command: The command to execute
            params: Parameters for the command
            
        Returns:
            Dict[str, Any]: Result of the command
        """
        params = params or {}
        command_id = self._get_next_command_id()
        
        # Send the command
        self.request_queue.put({
            "command_id": command_id,
            "command": command,
            "params": params
        })
        
        # Wait for the response
        while True:
            response = self.response_queue.get()
            response_id = response.get("command_id")
            
            if response_id == command_id:
                self.response_queue.task_done()
                
                if response.get("status") == "error":
                    error = response.get("error", "Unknown error")
                    traceback = response.get("traceback", "")
                    raise Exception(f"Error executing command {command}: {error}\n{traceback}")
                
                return response.get("result")
            else:
                # Not our response, put it back
                self.response_queue.put(response)
                time.sleep(0.01)
    
    async def async_send_command(self, command: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Send a command to the IPFS Kit Server asynchronously
        
        This is a wrapper around _send_command that can be awaited in async code.
        
        Args:
            command: The command to execute
            params: Parameters for the command
            
        Returns:
            Dict[str, Any]: Result of the command
        """
        import asyncio
        
        # Run the command in a thread to avoid blocking
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._send_command, command, params
        )
    
    def add(self, path: str, **options) -> Dict[str, Any]:
        """
        Add a file to IPFS
        
        Args:
            path: Path to the file
            **options: Additional options
            
        Returns:
            Dict[str, Any]: Result of the add operation
        """
        return self._send_command("add", {"path": path, "options": options})
    
    async def async_add(self, path: str, **options) -> Dict[str, Any]:
        """Async version of add"""
        return await self.async_send_command("add", {"path": path, "options": options})
    
    def cat(self, cid: str) -> bytes:
        """
        Get file contents from IPFS
        
        Args:
            cid: Content ID
            
        Returns:
            bytes: File contents
        """
        return self._send_command("cat", {"cid": cid})
    
    async def async_cat(self, cid: str) -> bytes:
        """Async version of cat"""
        return await self.async_send_command("cat", {"cid": cid})
    
    def get(self, cid: str, output_dir: str = "./ipfs_downloads") -> str:
        """
        Download a file from IPFS
        
        Args:
            cid: Content ID
            output_dir: Output directory
            
        Returns:
            str: Path to the downloaded file
        """
        return self._send_command("get", {"cid": cid, "output_dir": output_dir})
    
    async def async_get(self, cid: str, output_dir: str = "./ipfs_downloads") -> str:
        """Async version of get"""
        return await self.async_send_command("get", {"cid": cid, "output_dir": output_dir})
    
    def pin_add(self, cid: str, recursive: bool = True) -> List[str]:
        """
        Pin a file in IPFS
        
        Args:
            cid: Content ID
            recursive: Whether to pin recursively
            
        Returns:
            List[str]: Pinned CIDs
        """
        return self._send_command("pin_add", {"cid": cid, "recursive": recursive})
    
    async def async_pin_add(self, cid: str, recursive: bool = True) -> List[str]:
        """Async version of pin_add"""
        return await self.async_send_command("pin_add", {"cid": cid, "recursive": recursive})
    
    def pin_rm(self, cid: str, recursive: bool = True) -> List[str]:
        """
        Unpin a file in IPFS
        
        Args:
            cid: Content ID
            recursive: Whether to unpin recursively
            
        Returns:
            List[str]: Unpinned CIDs
        """
        return self._send_command("pin_rm", {"cid": cid, "recursive": recursive})
    
    async def async_pin_rm(self, cid: str, recursive: bool = True) -> List[str]:
        """Async version of pin_rm"""
        return await self.async_send_command("pin_rm", {"cid": cid, "recursive": recursive})
    
    def pin_ls(self, cid: str = None, type_filter: str = "all") -> Dict[str, Any]:
        """
        List pinned files in IPFS
        
        Args:
            cid: Content ID (optional)
            type_filter: Pin type filter
            
        Returns:
            Dict[str, Any]: Pinned files
        """
        return self._send_command("pin_ls", {"cid": cid, "type": type_filter})
    
    async def async_pin_ls(self, cid: str = None, type_filter: str = "all") -> Dict[str, Any]:
        """Async version of pin_ls"""
        return await self.async_send_command("pin_ls", {"cid": cid, "type": type_filter})
    
    def ls(self, cid: str) -> Dict[str, Any]:
        """
        List directory contents in IPFS
        
        Args:
            cid: Content ID
            
        Returns:
            Dict[str, Any]: Directory contents
        """
        return self._send_command("ls", {"cid": cid})
    
    async def async_ls(self, cid: str) -> Dict[str, Any]:
        """Async version of ls"""
        return await self.async_send_command("ls", {"cid": cid})
    
    def id(self) -> Dict[str, Any]:
        """
        Get IPFS node information
        
        Returns:
            Dict[str, Any]: Node information
        """
        return self._send_command("id", {})
    
    async def async_id(self) -> Dict[str, Any]:
        """Async version of id"""
        return await self.async_send_command("id", {})
    
    def stop_server(self):
        """Stop the IPFS Kit Server"""
        self.request_queue.put({"command": "stop"})


# Example usage
if __name__ == "__main__":
    import asyncio
    
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Create queues
    request_queue = Queue()
    response_queue = Queue()
    
    # Create and start server in a separate thread
    server = IPFSKitServer(request_queue, response_queue, metadata={"use_mock": True})
    server_thread = threading.Thread(target=server.start)
    server_thread.daemon = True
    server_thread.start()
    
    # Create client
    client = IPFSKitClient(request_queue, response_queue)
    
    # Test synchronous operations
    try:
        # Add a file
        result = client.add(__file__)
        print(f"Added file: {result}")
        
        # Get node info
        node_info = client.id()
        print(f"Node info: {node_info}")
        
        # List pins
        pins = client.pin_ls()
        print(f"Pins: {pins}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test asynchronous operations
    async def test_async():
        try:
            # Add a file
            result = await client.async_add(__file__)
            print(f"Added file (async): {result}")
            
            # Get file contents
            cid = result["Hash"]
            content = await client.async_cat(cid)
            print(f"File content length: {len(content)} bytes")
            
            # Stop the server
            client.stop_server()
        except Exception as e:
            print(f"Error in async test: {e}")
    
    # Run async test
    asyncio.run(test_async())
    
    # Wait for server to stop
    server_thread.join()
