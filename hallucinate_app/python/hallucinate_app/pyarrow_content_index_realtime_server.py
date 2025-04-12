"""
PyArrow Content Index Real-Time Updates Server

This module provides a WebSocket server that enables real-time notifications
for changes to the PyArrow Content Index. It integrates with the existing
PyArrowContentIndexIntegration to provide notifications when content is
added, updated, or deleted.
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Any, Optional, Union, Set

import websockets
from websockets.server import WebSocketServerProtocol

# Import the PyArrow Content Index functionality
from hallucinate_app.pyarrow_content_index_integration import PyArrowContentIndexIntegration
from hallucinate_app.auth import AuthManager
from hallucinate_app.observability import get_observability

# Setup logging
logger = logging.getLogger(__name__)

class PyArrowContentIndexRealtimeServer:
    """
    WebSocket server that provides real-time updates for PyArrow Content Index changes.
    
    This server notifies clients about changes to the content index, including:
    - New content additions
    - Content updates
    - Content deletions
    - Index synchronization
    
    It also supports authentication with UCAN capabilities.
    """
    
    def __init__(self, 
                 content_index_integration: PyArrowContentIndexIntegration, 
                 host: str = "localhost", 
                 port: int = 8765,
                 auth_manager: Optional[AuthManager] = None,
                 strict_auth: bool = False,
                 path: str = "/pyarrow-content-index/ws"):
        """
        Initialize the real-time update server.
        
        Args:
            content_index_integration: PyArrow Content Index integration instance
            host: WebSocket server host
            port: WebSocket server port
            auth_manager: Optional authentication manager for capability verification
            strict_auth: If True, reject connections without valid authentication
            path: WebSocket server path
        """
        self.content_index_integration = content_index_integration
        self.host = host
        self.port = port
        self.path = path
        self.auth_manager = auth_manager
        self.strict_auth = strict_auth
        
        # Connected clients
        self.clients: Set[WebSocketServerProtocol] = set()
        self.authenticated_clients: Dict[WebSocketServerProtocol, Dict[str, Any]] = {}
        
        # Notification rate limiting
        self.last_notification_time: Dict[str, float] = {}
        self.min_notification_interval = 1.0  # Minimum seconds between notifications of the same type
        
        # Notification tracking for deduplication
        self.notification_history: Dict[str, Dict[str, Any]] = {}
        self.max_history_size = 1000  # Maximum number of notification IDs to track
        
        # Get observability if available
        self.observability = get_observability()
        if self.observability:
            self.setup_metrics()
        
        # Server state
        self.server = None
        self.running = False
        self.watch_task = None
        
        # Last event tracker
        self.last_check_time = time.time()
        self.recent_changes = set()
        
    def setup_metrics(self):
        """Set up Prometheus metrics for the server."""
        if not self.observability:
            return
        
        # Metrics for connections
        self.metrics = {
            "connected_clients": self.observability.register_gauge(
                "connected_clients", 
                "Number of connected WebSocket clients",
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "authenticated_clients": self.observability.register_gauge(
                "authenticated_clients", 
                "Number of authenticated WebSocket clients",
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "connection_total": self.observability.register_counter(
                "connection_total", 
                "Total number of WebSocket connections",
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "disconnection_total": self.observability.register_counter(
                "disconnection_total", 
                "Total number of WebSocket disconnections",
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "authentication_success_total": self.observability.register_counter(
                "authentication_success_total", 
                "Total number of successful authentications",
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "authentication_failure_total": self.observability.register_counter(
                "authentication_failure_total", 
                "Total number of failed authentications",
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            
            # Notification metrics
            "notification_sent_total": self.observability.register_counter(
                "notification_sent_total", 
                "Total number of notifications sent",
                ["type"],
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "notification_rate_limited_total": self.observability.register_counter(
                "notification_rate_limited_total", 
                "Total number of notifications rate limited",
                ["type"],
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            
            # Message metrics
            "message_received_total": self.observability.register_counter(
                "message_received_total", 
                "Total number of messages received from clients",
                ["type"],
                namespace="pyarrow_index",
                subsystem="realtime"
            ),
            "message_sent_total": self.observability.register_counter(
                "message_sent_total", 
                "Total number of messages sent to clients",
                ["type"],
                namespace="pyarrow_index",
                subsystem="realtime"
            )
        }
    
    async def start(self):
        """Start the WebSocket server."""
        if self.running:
            logger.warning("Real-time update server already running")
            return
        
        try:
            logger.info(f"Starting PyArrow Content Index real-time update server on {self.host}:{self.port}{self.path}")
            
            # Start WebSocket server
            self.server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                process_request=self.process_request
            )
            
            # Start index watching task
            self.watch_task = asyncio.create_task(self.watch_index_changes())
            
            # Update state
            self.running = True
            
            logger.info("PyArrow Content Index real-time update server started")
        except Exception as e:
            logger.error(f"Failed to start real-time update server: {e}")
            raise
    
    async def stop(self):
        """Stop the WebSocket server."""
        if not self.running:
            logger.warning("Real-time update server not running")
            return
        
        try:
            logger.info("Stopping PyArrow Content Index real-time update server")
            
            # Close all client connections
            close_tasks = [client.close() for client in self.clients]
            if close_tasks:
                await asyncio.gather(*close_tasks, return_exceptions=True)
            
            # Clear client sets
            self.clients.clear()
            self.authenticated_clients.clear()
            
            # Cancel watch task
            if self.watch_task:
                self.watch_task.cancel()
                try:
                    await self.watch_task
                except asyncio.CancelledError:
                    pass
                self.watch_task = None
            
            # Stop the server
            if self.server:
                self.server.close()
                await self.server.wait_closed()
                self.server = None
            
            # Update state
            self.running = False
            
            logger.info("PyArrow Content Index real-time update server stopped")
        except Exception as e:
            logger.error(f"Error stopping real-time update server: {e}")
            raise
    
    async def process_request(self, path, request_headers):
        """Process HTTP request before WebSocket upgrade."""
        # Only handle requests to our specific path
        if path != self.path:
            return None  # Let other handlers process this path
        
        # Additional request processing could be done here
        return None  # Continue with WebSocket upgrade
    
    async def handle_client(self, websocket: WebSocketServerProtocol, path: str):
        """Handle a client connection."""
        if path != self.path:
            await websocket.close(1003, f"Unsupported path: {path}")
            return
        
        # Track connection
        self.clients.add(websocket)
        client_ip = websocket.remote_address[0] if websocket.remote_address else "unknown"
        logger.info(f"Client connected from {client_ip}")
        
        # Update metrics
        if self.observability and hasattr(self, "metrics"):
            self.metrics["connection_total"].inc()
            self.metrics["connected_clients"].set(len(self.clients))
        
        # Initial authentication state
        is_authenticated = False
        auth_info = {}
        
        try:
            # Send welcome message
            welcome_msg = {
                "type": "system",
                "message": "Connected to PyArrow Content Index real-time updates",
                "auth_required": self.auth_manager is not None and self.strict_auth,
                "timestamp": self.get_timestamp()
            }
            await websocket.send(json.dumps(welcome_msg))
            
            # Track metrics for welcome message
            if self.observability and hasattr(self, "metrics"):
                self.metrics["message_sent_total"].labels(type="system").inc()
            
            # Process messages from this client
            async for message in websocket:
                try:
                    data = json.loads(message)
                    
                    # Track metrics for received message
                    if self.observability and hasattr(self, "metrics"):
                        msg_type = data.get("type", "unknown")
                        self.metrics["message_received_total"].labels(type=msg_type).inc()
                    
                    # Handle authentication message
                    if data.get("type") == "auth" and self.auth_manager:
                        token = data.get("token")
                        if not token:
                            await self.send_error(websocket, "auth_required", "Authentication token required")
                            continue
                        
                        # Verify token
                        try:
                            # Verify with appropriate capability
                            result = await self.auth_manager.verify_token(
                                token, 
                                "pyarrow-index:read"
                            )
                            
                            if result["valid"]:
                                # Authentication successful
                                is_authenticated = True
                                auth_info = {
                                    "principal": result.get("principal", "unknown"),
                                    "capabilities": result.get("capabilities", []),
                                    "expiration": result.get("expiration"),
                                    "authenticated_at": self.get_timestamp()
                                }
                                
                                self.authenticated_clients[websocket] = auth_info
                                
                                # Update metrics
                                if self.observability and hasattr(self, "metrics"):
                                    self.metrics["authentication_success_total"].inc()
                                    self.metrics["authenticated_clients"].set(len(self.authenticated_clients))
                                
                                # Send success response
                                await websocket.send(json.dumps({
                                    "type": "auth_success",
                                    "message": "Authentication successful",
                                    "principal": auth_info["principal"],
                                    "timestamp": self.get_timestamp()
                                }))
                                
                                logger.info(f"Client {client_ip} authenticated as {auth_info['principal']}")
                            else:
                                # Authentication failed
                                if self.observability and hasattr(self, "metrics"):
                                    self.metrics["authentication_failure_total"].inc()
                                
                                await self.send_error(websocket, "invalid_token", "Invalid authentication token")
                                
                                if self.strict_auth:
                                    logger.warning(f"Client {client_ip} failed authentication, closing connection")
                                    await websocket.close(1008, "Authentication required")
                                    return
                        except Exception as e:
                            logger.error(f"Authentication error: {e}")
                            if self.observability and hasattr(self, "metrics"):
                                self.metrics["authentication_failure_total"].inc()
                            
                            await self.send_error(websocket, "auth_error", f"Authentication error: {str(e)}")
                    
                    # Handle heartbeat
                    elif data.get("type") == "heartbeat":
                        await websocket.send(json.dumps({
                            "type": "heartbeat",
                            "timestamp": self.get_timestamp()
                        }))
                        
                        # Track metrics for heartbeat response
                        if self.observability and hasattr(self, "metrics"):
                            self.metrics["message_sent_total"].labels(type="heartbeat").inc()
                    
                    # Handle other message types
                    else:
                        # Check authentication if required
                        if self.auth_manager and self.strict_auth and not is_authenticated:
                            await self.send_error(websocket, "auth_required", "Authentication required")
                            continue
                        
                        # Process message based on type
                        if data.get("type") == "query":
                            # Handle query messages - we could implement this to allow clients to
                            # query the content index directly
                            await self.send_error(websocket, "not_implemented", "Query functionality not implemented")
                        else:
                            await self.send_error(websocket, "unknown_command", f"Unknown command: {data.get('type')}")
                
                except json.JSONDecodeError:
                    await self.send_error(websocket, "invalid_json", "Invalid JSON message")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    await self.send_error(websocket, "server_error", f"Server error: {str(e)}")
        
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_ip} disconnected")
        except Exception as e:
            logger.error(f"Unexpected error handling client: {e}")
        finally:
            # Clean up on disconnect
            self.clients.discard(websocket)
            self.authenticated_clients.pop(websocket, None)
            
            # Update metrics
            if self.observability and hasattr(self, "metrics"):
                self.metrics["disconnection_total"].inc()
                self.metrics["connected_clients"].set(len(self.clients))
                self.metrics["authenticated_clients"].set(len(self.authenticated_clients))
            
            logger.info(f"Client {client_ip} connection closed")
    
    async def broadcast(self, message: Dict[str, Any], notification_type: str = None):
        """
        Broadcast a message to all connected clients.
        
        Args:
            message: The message to broadcast
            notification_type: Optional notification type for rate limiting
        """
        if not self.clients:
            return
        
        # Apply rate limiting for notification type if specified
        if notification_type:
            current_time = time.time()
            last_time = self.last_notification_time.get(notification_type, 0)
            
            if current_time - last_time < self.min_notification_interval:
                # Rate limit this notification
                if self.observability and hasattr(self, "metrics"):
                    self.metrics["notification_rate_limited_total"].labels(type=notification_type).inc()
                return
            
            # Update last notification time
            self.last_notification_time[notification_type] = current_time
        
        # Set timestamp if not present
        if "timestamp" not in message:
            message["timestamp"] = self.get_timestamp()
        
        # Serialize message
        message_str = json.dumps(message)
        
        # Send to all authenticated clients or all clients if no auth required
        clients_to_notify = self.authenticated_clients.keys() if self.strict_auth else self.clients
        
        send_tasks = []
        for client in clients_to_notify:
            try:
                send_tasks.append(client.send(message_str))
            except Exception as e:
                logger.error(f"Error preparing to send message to client: {e}")
        
        if send_tasks:
            try:
                await asyncio.gather(*send_tasks, return_exceptions=True)
                
                # Track notification metrics
                if self.observability and hasattr(self, "metrics") and notification_type:
                    self.metrics["notification_sent_total"].labels(type=notification_type).inc()
                    self.metrics["message_sent_total"].labels(type=message.get("type", "notification")).inc()
            except Exception as e:
                logger.error(f"Error during message broadcast: {e}")
    
    async def send_error(self, websocket: WebSocketServerProtocol, error_code: str, message: str):
        """Send an error message to a client."""
        try:
            error_msg = {
                "type": "error",
                "error": error_code,
                "message": message,
                "timestamp": self.get_timestamp()
            }
            await websocket.send(json.dumps(error_msg))
            
            # Track metrics for error message
            if self.observability and hasattr(self, "metrics"):
                self.metrics["message_sent_total"].labels(type="error").inc()
            
        except Exception as e:
            logger.error(f"Error sending error message: {e}")
    
    async def watch_index_changes(self):
        """Watch for changes in the PyArrow Content Index."""
        logger.info("Starting PyArrow Content Index change monitor")
        
        # Since we don't have a built-in change notification system,
        # we'll poll the index for changes periodically
        
        try:
            while True:
                try:
                    # Record current time before checking for changes
                    current_time = time.time()
                    
                    # Get recent entries since last check
                    try:
                        # In a real implementation, we'd have a proper API for getting recent changes
                        # For now, we'll query the index with a timestamp filter
                        query_params = {
                            "updated_since": self.last_check_time,
                            "sort": "updated_at",
                            "sort_order": "desc",
                            "limit": 100
                        }
                        
                        # Query for recent changes
                        recent_entries = await self.content_index_integration.query(query_params)
                        
                        # Process entries
                        for entry in recent_entries:
                            cid = entry.get("cid")
                            if not cid:
                                continue
                                
                            # Generate a notification ID to prevent duplicates
                            notification_id = f"{cid}:{current_time}"
                            
                            # Skip if we've already seen this change
                            if notification_id in self.notification_history:
                                continue
                            
                            # Determine if this is a new or updated entry
                            created_at = entry.get("created_at", 0)
                            updated_at = entry.get("updated_at", 0)
                            
                            is_new = created_at >= self.last_check_time
                            notification_type = "content-added" if is_new else "content-updated"
                            
                            # Send notification
                            await self.broadcast({
                                "type": notification_type,
                                "data": {
                                    "id": notification_id,
                                    "cid": cid,
                                    "path": entry.get("path", ""),
                                    "mimetype": entry.get("mimetype", ""),
                                    "size": entry.get("size", 0),
                                    "timestamp": self.get_timestamp()
                                },
                                "action": "added" if is_new else "updated"
                            }, notification_type)
                            
                            # Track notification
                            self.notification_history[notification_id] = {
                                "type": notification_type,
                                "timestamp": current_time,
                                "cid": cid
                            }
                    except Exception as e:
                        logger.error(f"Error querying for recent entries: {e}")
                    
                    # Check for deleted entries (we don't have a good way to do this
                    # without maintaining a separate list of recently deleted entries)
                    
                    # Limit notification history size
                    if len(self.notification_history) > self.max_history_size:
                        # Remove oldest notifications
                        history_items = list(self.notification_history.items())
                        history_items.sort(key=lambda x: x[1]["timestamp"])
                        
                        # Remove the oldest 10%
                        to_remove = int(self.max_history_size * 0.1)
                        for i in range(to_remove):
                            if i < len(history_items):
                                del self.notification_history[history_items[i][0]]
                    
                    # Update last check time
                    self.last_check_time = current_time
                    
                    # Wait before checking again
                    await asyncio.sleep(2.0)  # Check every 2 seconds
                    
                except Exception as e:
                    logger.error(f"Error watching index changes: {e}")
                    await asyncio.sleep(5.0)  # Slightly longer delay on error
        
        except asyncio.CancelledError:
            logger.info("PyArrow Content Index change monitor stopped")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in index change monitor: {e}")
    
    @staticmethod
    def get_timestamp() -> str:
        """Get current timestamp in ISO format."""
        return time.strftime("%Y-%m-%dT%H:%M:%S.%fZ", time.gmtime())

# Function to create and start a WebSocket server
async def start_realtime_server(content_index_integration, host="localhost", port=8765, auth_manager=None):
    """
    Create and start a WebSocket server for real-time updates.
    
    Args:
        content_index_integration: PyArrow Content Index integration instance
        host: WebSocket server host
        port: WebSocket server port
        auth_manager: Optional authentication manager for capability verification
        
    Returns:
        PyArrowContentIndexRealtimeServer: The started server instance
    """
    server = PyArrowContentIndexRealtimeServer(
        content_index_integration=content_index_integration,
        host=host,
        port=port,
        auth_manager=auth_manager
    )
    
    await server.start()
    return server