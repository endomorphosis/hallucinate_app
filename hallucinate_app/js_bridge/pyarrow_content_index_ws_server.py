"""
WebSocket Server for PyArrow Content Index Real-time Updates

Provides real-time notifications for clients about updates to the content index
including additions, updates, deletions, and synchronization events.
"""

import asyncio
import json
import logging
import time
import websockets
from typing import Dict, List, Any, Optional, Set
from threading import Lock

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index_ws_server")

class PyArrowContentIndexWSServer:
    """
    WebSocket server for real-time notifications about content index changes
    """
    
    def __init__(self, host: str = "localhost", port: int = 6789):
        """
        Initialize the WebSocket server
        
        Args:
            host: Host to bind to
            port: Port to bind to
        """
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.running = False
        self.lock = Lock()
        self.message_count = 0
        self.start_time = time.time()
        self.messages_by_type = {
            "content_added": 0,
            "content_updated": 0, 
            "content_deleted": 0,
            "content_synced": 0
        }
    
    async def register(self, websocket: websockets.WebSocketServerProtocol):
        """Register a new client"""
        self.clients.add(websocket)
        logger.info(f"New client connected. Total clients: {len(self.clients)}")
        
        # Send initial connection message
        await websocket.send(json.dumps({
            "type": "connected",
            "timestamp": time.time(),
            "clientCount": len(self.clients),
            "serverUptime": time.time() - self.start_time
        }))
    
    async def unregister(self, websocket: websockets.WebSocketServerProtocol):
        """Unregister a client"""
        self.clients.discard(websocket)
        logger.info(f"Client disconnected. Total clients: {len(self.clients)}")
    
    async def notify_clients(self, message: Dict[str, Any]):
        """Send a message to all connected clients"""
        if not self.clients:
            return
            
        # Add timestamp to all messages
        message["timestamp"] = time.time()
        
        # Convert message to JSON
        json_message = json.dumps(message)
        
        # Track metrics
        self.message_count += 1
        message_type = message.get("type", "unknown")
        if message_type in self.messages_by_type:
            self.messages_by_type[message_type] += 1
        
        # Snapshot clients to avoid mutation during iteration
        client_list = list(self.clients)
        send_tasks = [client.send(json_message) for client in client_list]

        # Wait for all sends; capture exceptions rather than raising so one
        # slow/dead client does not block others.
        if send_tasks:
            results = await asyncio.gather(*send_tasks, return_exceptions=True)
            for client, result in zip(client_list, results):
                if isinstance(result, Exception):
                    logger.warning(
                        f"Failed to send message to client (removing): {result}"
                    )
                    self.clients.discard(client)
    
    async def notify_content_added(self, cid: str, path: Optional[str] = None, 
                                   mimetype: Optional[str] = None, size: Optional[int] = None,
                                   metadata: Optional[Dict[str, Any]] = None):
        """Notify clients about new content being added"""
        message = {
            "type": "content_added",
            "cid": cid,
            "path": path,
            "mimetype": mimetype,
            "size": size
        }
        
        # Add metadata if provided
        if metadata:
            message["metadata"] = metadata
            
        await self.notify_clients(message)
    
    async def notify_content_updated(self, cid: str, updates: Dict[str, Any]):
        """Notify clients about content being updated"""
        message = {
            "type": "content_updated",
            "cid": cid,
            "updates": updates
        }
        await self.notify_clients(message)
    
    async def notify_content_deleted(self, cid: str, path: Optional[str] = None):
        """Notify clients about content being deleted"""
        message = {
            "type": "content_deleted",
            "cid": cid
        }
        
        if path:
            message["path"] = path
            
        await self.notify_clients(message)
    
    async def notify_content_synced(self, added: int, updated: int, removed: int, 
                                   details: Optional[Dict[str, Any]] = None):
        """Notify clients about content index being synced"""
        message = {
            "type": "content_synced",
            "added": added,
            "updated": updated,
            "removed": removed
        }
        
        if details:
            message["details"] = details
            
        await self.notify_clients(message)
    
    async def get_stats(self):
        """Get server statistics"""
        return {
            "clients": len(self.clients),
            "uptime": time.time() - self.start_time,
            "message_count": self.message_count,
            "messages_by_type": self.messages_by_type
        }

    async def send_client_error(self, websocket: websockets.WebSocketServerProtocol,
                                error: str, message: str):
        """Send a protocol error response to a websocket client"""
        await websocket.send(json.dumps({
            "type": "error",
            "error": error,
            "message": message,
            "timestamp": time.time()
        }))
    
    async def handler(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Handle websocket connections"""
        await self.register(websocket)
        try:
            async for message in websocket:
                # Parse message. Malformed client input is handled as a protocol
                # error; unexpected send or stats failures are allowed to surface.
                try:
                    data = json.loads(message)
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    logger.warning(f"Invalid JSON message from client: {e}")
                    await self.send_client_error(
                        websocket,
                        "invalid_json",
                        "Message must be valid JSON"
                    )
                    continue

                if not isinstance(data, dict):
                    logger.warning("Invalid websocket message envelope: expected JSON object")
                    await self.send_client_error(
                        websocket,
                        "invalid_message",
                        "Message must be a JSON object"
                    )
                    continue

                # Handle client messages
                if data.get("type") == "ping":
                    await websocket.send(json.dumps({
                        "type": "pong",
                        "timestamp": time.time()
                    }))
                elif data.get("type") == "stats":
                    stats = await self.get_stats()
                    await websocket.send(json.dumps({
                        "type": "stats",
                        "stats": stats,
                        "timestamp": time.time()
                    }))
        except websockets.exceptions.ConnectionClosed as e:
            logger.debug(f"WebSocket connection closed: {e}")
        finally:
            await self.unregister(websocket)
    
    async def start(self):
        """Start the WebSocket server"""
        with self.lock:
            if self.running:
                logger.warning("Server already running")
                return
                
            self.running = True
            self.start_time = time.time()
            
        logger.info(f"Starting WebSocket server on {self.host}:{self.port}")
        
        # Start the server
        self.server = await websockets.serve(self.handler, self.host, self.port)
        
        logger.info(f"WebSocket server running on ws://{self.host}:{self.port}")
    
    async def stop(self):
        """Stop the WebSocket server"""
        with self.lock:
            if not self.running:
                logger.warning("Server not running")
                return
                
            self.running = False
        
        # Close all client connections
        close_tasks = []
        for client in self.clients:
            close_tasks.append(asyncio.create_task(
                client.close(code=1001, reason="Server shutting down")
            ))
        
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
        
        # Close the server
        self.server.close()
        await self.server.wait_closed()
        
        logger.info("WebSocket server stopped")

# Create a singleton instance
_ws_server = PyArrowContentIndexWSServer()

def get_ws_server() -> PyArrowContentIndexWSServer:
    """Get the singleton WebSocket server instance"""
    return _ws_server

async def start_ws_server():
    """Start the WebSocket server if it's not already running"""
    if not _ws_server.running:
        await _ws_server.start()
    return _ws_server
