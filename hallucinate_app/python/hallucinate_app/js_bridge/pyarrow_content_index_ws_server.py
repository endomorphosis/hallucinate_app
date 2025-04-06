"""
PyArrow Content Index WebSocket Server

This module implements a WebSocket server that sends real-time notifications 
about changes to the PyArrow Content Index. It interfaces with the JS bridge
and exposes an API for sending notifications to connected clients.

Usage:
    server = PyArrowContentIndexWSServer()
    await server.start()
    
    # To send notifications
    await server.notify_content_added(cid, path, mimetype, size)
    await server.notify_content_updated(cid, updates)
    await server.notify_content_deleted(cid)
    await server.notify_content_synced(added, updated, removed)
"""

import asyncio
import datetime
import json
import logging
import time
import uuid
import websockets
from typing import Dict, Any, Set, Optional, List, Union, Callable

# Try to import observed metrics
try:
    from hallucinate_app.observability import (
        get_metrics, 
        register_counter, 
        register_gauge, 
        register_histogram,
        timer
    )
    HAS_OBSERVABILITY = True
except ImportError:
    HAS_OBSERVABILITY = False
    
# Try to import UCAN auth
try:
    from hallucinate_app.auth import AuthManager
    from hallucinate_app.auth_keystore_integration import AuthKeystoreIntegration
    HAS_AUTH = True
except ImportError:
    HAS_AUTH = False

# Configure logger
logger = logging.getLogger(__name__)

class PyArrowContentIndexWSServer:
    """
    WebSocket server for PyArrow Content Index real-time updates
    
    Provides WebSocket-based notifications for changes to the PyArrow Content Index.
    Clients can connect to receive real-time updates about content changes.
    """
    
    def __init__(self, host: str = "localhost", port: int = 8765, path: str = "/pyarrow-content-index/ws"):
        """
        Initialize the WebSocket server
        
        Args:
            host: Hostname to bind the server to
            port: Port to listen on
            path: WebSocket endpoint path
        """
        self.host = host
        self.port = port
        self.path = path
        self.connected_clients: Set[websockets.WebSocketServerProtocol] = set()
        self.server = None
        self.running = False
        self.start_time = None
        
        # Client tracking with metadata
        self.client_info = {}  # client_id -> metadata
        
        # Authentication
        self.auth_required = False
        self.auth_manager = None
        self.auth_integration = None
        self.auth_capabilities = ["pyarrow-content-index:read"]
        
        # Rate limiting
        self.rate_limits = {
            'connect': 10,  # connections per minute
            'message': 60   # messages per minute
        }
        self.rate_tracking = {
            'connect': {},  # ip -> [timestamps]
            'message': {}   # client_id -> [timestamps]
        }
        
        # Initialize metrics
        self._init_metrics()
        
    def _init_metrics(self):
        """Initialize metrics for monitoring"""
        self.metrics = {}
        
        if HAS_OBSERVABILITY:
            try:
                # Server metrics
                self.metrics['server_uptime'] = register_gauge(
                    "pyarrow_content_index_ws_server_uptime_seconds",
                    "WebSocket server uptime in seconds",
                    [],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                # Connection metrics
                self.metrics['connections_total'] = register_counter(
                    "pyarrow_content_index_ws_connections_total",
                    "Total number of WebSocket connections",
                    [],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                self.metrics['connections_active'] = register_gauge(
                    "pyarrow_content_index_ws_connections_active",
                    "Number of active WebSocket connections",
                    [],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                self.metrics['connection_errors'] = register_counter(
                    "pyarrow_content_index_ws_connection_errors_total",
                    "Total number of WebSocket connection errors",
                    ["error_type"],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                # Message metrics
                self.metrics['messages_received'] = register_counter(
                    "pyarrow_content_index_ws_messages_received_total",
                    "Total number of WebSocket messages received",
                    ["message_type"],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                self.metrics['messages_sent'] = register_counter(
                    "pyarrow_content_index_ws_messages_sent_total",
                    "Total number of WebSocket messages sent",
                    ["message_type"],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                # Notification metrics
                self.metrics['notifications_sent'] = register_counter(
                    "pyarrow_content_index_ws_notifications_total",
                    "Total number of notifications sent",
                    ["notification_type"],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                # Rate limiting metrics
                self.metrics['rate_limits_exceeded'] = register_counter(
                    "pyarrow_content_index_ws_rate_limits_exceeded_total",
                    "Total number of rate limit exceeds",
                    ["limit_type"],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                # Authentication metrics
                self.metrics['auth_attempts'] = register_counter(
                    "pyarrow_content_index_ws_auth_attempts_total",
                    "Total number of authentication attempts",
                    ["status"],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                # Performance metrics
                self.metrics['notification_duration'] = register_histogram(
                    "pyarrow_content_index_ws_notification_duration_seconds",
                    "Time taken to send notifications",
                    ["notification_type"],
                    [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
                    "pyarrow_content_index",
                    "websocket"
                )
                
                logger.info("WebSocket server metrics initialized")
            except Exception as e:
                logger.error(f"Error initializing metrics: {e}")
    
    def _update_metrics(self):
        """Update metrics with current state"""
        if not HAS_OBSERVABILITY or not self.metrics:
            return
            
        try:
            # Update server uptime
            if self.start_time and 'server_uptime' in self.metrics:
                uptime = time.time() - self.start_time
                self.metrics['server_uptime'].set(uptime)
                
            # Update active connections
            if 'connections_active' in self.metrics:
                self.metrics['connections_active'].set(len(self.connected_clients))
        except Exception as e:
            logger.error(f"Error updating metrics: {e}")
    
    def setup_authentication(self, auth_required: bool = False, 
                            auth_manager = None, 
                            auth_integration = None,
                            auth_capabilities: List[str] = None):
        """
        Set up authentication for the WebSocket server
        
        Args:
            auth_required: Whether authentication is required
            auth_manager: Authentication manager instance
            auth_integration: Authentication keystore integration instance
            auth_capabilities: Required capabilities for access
        """
        if auth_required and not HAS_AUTH:
            logger.warning("Authentication required but auth module not available")
            return False
            
        self.auth_required = auth_required
        self.auth_manager = auth_manager
        self.auth_integration = auth_integration
        
        if auth_capabilities:
            self.auth_capabilities = auth_capabilities
            
        return True
    
    def _check_rate_limit(self, limit_type: str, identifier: str) -> bool:
        """
        Check if a rate limit has been exceeded
        
        Args:
            limit_type: Type of rate limit to check
            identifier: Identifier for the client/IP
            
        Returns:
            True if rate limit is allowed, False if exceeded
        """
        if limit_type not in self.rate_limits:
            return True
            
        # Get limit and tracking data
        limit = self.rate_limits[limit_type]
        tracking = self.rate_tracking.get(limit_type, {})
        
        # Initialize tracking if needed
        if identifier not in tracking:
            tracking[identifier] = []
        
        # Get timestamps for this identifier
        timestamps = tracking[identifier]
        
        # Clean up old timestamps (older than 1 minute)
        now = time.time()
        timestamps = [ts for ts in timestamps if now - ts < 60]
        tracking[identifier] = timestamps
        
        # Check if limit is exceeded
        if len(timestamps) >= limit:
            # Update metrics
            if HAS_OBSERVABILITY and 'rate_limits_exceeded' in self.metrics:
                self.metrics['rate_limits_exceeded'].labels(limit_type=limit_type).inc()
                
            return False
        
        # Add current timestamp and allow
        timestamps.append(now)
        return True
    
    async def start(self) -> None:
        """Start the WebSocket server"""
        if self.running:
            logger.warning("WebSocket server is already running")
            return
            
        try:
            self.server = await websockets.serve(
                self.handle_connection,
                self.host,
                self.port,
                process_request=self.process_request
            )
            
            self.running = True
            self.start_time = time.time()
            logger.info(f"WebSocket server started at ws://{self.host}:{self.port}{self.path}")
            
            # Start metrics updater if enabled
            if HAS_OBSERVABILITY and self.metrics:
                # Start metrics update loop in the background
                asyncio.create_task(self._metrics_update_loop())
            
        except Exception as e:
            logger.error(f"Failed to start WebSocket server: {e}")
            
            # Update connection error metrics
            if HAS_OBSERVABILITY and 'connection_errors' in self.metrics:
                self.metrics['connection_errors'].labels(error_type="start_error").inc()
                
            raise
            
    async def _metrics_update_loop(self):
        """Background task to update metrics periodically"""
        while self.running:
            try:
                self._update_metrics()
                await asyncio.sleep(10)  # Update every 10 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in metrics update loop: {e}")
                await asyncio.sleep(30)  # Longer delay after error
            
    async def stop(self) -> None:
        """Stop the WebSocket server"""
        if not self.running:
            logger.warning("WebSocket server is not running")
            return
            
        # Close all client connections
        close_tasks = []
        for client in self.connected_clients:
            try:
                close_tasks.append(asyncio.create_task(client.close()))
            except Exception as e:
                logger.warning(f"Error closing client connection: {e}")
                
        # Wait for all connections to close
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
            
        # Close the server
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            
        self.connected_clients.clear()
        self.client_info.clear()
        self.running = False
        logger.info("WebSocket server stopped")
        
    async def process_request(self, path: str, request_headers: Dict[str, str]) -> Optional[tuple]:
        """
        Process HTTP request to verify path and handle CORS
        
        Args:
            path: Request path
            request_headers: HTTP request headers
            
        Returns:
            Optional HTTP response or None to continue WebSocket handling
        """
        # Check if the path matches our endpoint
        if path != self.path:
            return 404, {}, b"Not found"
            
        # Check rate limit for connections (using remote IP)
        remote_ip = request_headers.get("X-Forwarded-For", "unknown_ip")
        if not self._check_rate_limit('connect', remote_ip):
            logger.warning(f"Connection rate limit exceeded for {remote_ip}")
            return 429, {}, b"Too many connection attempts, please try again later"
            
        # Handle CORS if needed
        origin = request_headers.get("Origin")
        if origin:
            headers = {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST",
                "Access-Control-Allow-Headers": "Authorization, Content-Type"
            }
            
            # Handle preflight request
            if request_headers.get("Request-Method") == "OPTIONS":
                return 200, headers, b""
                
            # Add CORS headers to normal response
            return None, headers, None
            
        # Continue with normal WebSocket processing
        return None
        
    async def _authenticate_client(self, websocket: websockets.WebSocketServerProtocol, 
                                 request_headers: Dict[str, str]) -> bool:
        """
        Authenticate a client connection
        
        Args:
            websocket: WebSocket connection
            request_headers: Request headers
            
        Returns:
            True if authentication succeeded, False otherwise
        """
        if not self.auth_required:
            return True
            
        if not self.auth_manager:
            logger.warning("Authentication required but no auth manager available")
            return False
            
        try:
            # Get auth token from headers or query parameter
            auth_header = request_headers.get("Authorization", "")
            token = None
            
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
            
            if not token:
                # Try to get token from initial handshake message
                try:
                    # Wait for auth message with timeout
                    message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(message)
                    
                    if data.get("type") == "auth" and "token" in data:
                        token = data["token"]
                        
                        # Update metrics
                        if HAS_OBSERVABILITY and 'messages_received' in self.metrics:
                            self.metrics['messages_received'].labels(message_type="auth").inc()
                except asyncio.TimeoutError:
                    logger.warning("Authentication timeout")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "error": "auth_timeout",
                        "message": "Authentication timeout"
                    }))
                    return False
                except json.JSONDecodeError:
                    logger.warning("Invalid auth message format")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "error": "invalid_format",
                        "message": "Invalid auth message format"
                    }))
                    return False
                except Exception as e:
                    logger.error(f"Error receiving auth message: {e}")
                    return False
            
            if not token:
                logger.warning("No authentication token provided")
                await websocket.send(json.dumps({
                    "type": "error",
                    "error": "auth_required",
                    "message": "Authentication token required"
                }))
                
                # Update metrics
                if HAS_OBSERVABILITY and 'auth_attempts' in self.metrics:
                    self.metrics['auth_attempts'].labels(status="missing_token").inc()
                    
                return False
            
            # Verify token with auth manager
            for capability in self.auth_capabilities:
                valid = await self.auth_manager.verify_token(token, capability)
                if not valid:
                    logger.warning(f"Invalid token for capability {capability}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "error": "invalid_token",
                        "message": f"Token doesn't have required capability: {capability}"
                    }))
                    
                    # Update metrics
                    if HAS_OBSERVABILITY and 'auth_attempts' in self.metrics:
                        self.metrics['auth_attempts'].labels(status="invalid_token").inc()
                        
                    return False
            
            # Get principal from token
            principal = await self.auth_manager.get_principal_from_token(token)
            
            # Store principal in client info
            client_id = id(websocket)
            self.client_info[client_id] = {
                "authenticated": True,
                "principal": principal,
                "capabilities": self.auth_capabilities,
                "connection_time": time.time()
            }
            
            # Send success message
            await websocket.send(json.dumps({
                "type": "auth_success",
                "message": "Authentication successful",
                "principal": principal
            }))
            
            # Update metrics
            if HAS_OBSERVABILITY and 'auth_attempts' in self.metrics:
                self.metrics['auth_attempts'].labels(status="success").inc()
                
            return True
            
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            
            # Update metrics
            if HAS_OBSERVABILITY and 'auth_attempts' in self.metrics:
                self.metrics['auth_attempts'].labels(status="error").inc()
                
            return False
            
    async def handle_connection(self, websocket: websockets.WebSocketServerProtocol, path: str) -> None:
        """
        Handle WebSocket connection
        
        Args:
            websocket: WebSocket connection
            path: Request path
        """
        # Get client information
        client_id = id(websocket)
        request_info = websocket.request_headers if hasattr(websocket, 'request_headers') else {}
        remote_ip = request_info.get("X-Forwarded-For", "unknown_ip")
        
        # Store basic client info
        self.client_info[client_id] = {
            "id": client_id,
            "remote_ip": remote_ip,
            "user_agent": request_info.get("User-Agent", "unknown"),
            "connection_time": time.time(),
            "authenticated": False
        }
        
        # Authenticate if required
        if self.auth_required:
            auth_success = await self._authenticate_client(websocket, request_info)
            if not auth_success:
                # Clean up client info
                if client_id in self.client_info:
                    del self.client_info[client_id]
                return
        
        # Add client to the set of connected clients
        self.connected_clients.add(websocket)
        logger.info(f"Client {client_id} connected, total clients: {len(self.connected_clients)}")
        
        # Update connection metrics
        if HAS_OBSERVABILITY:
            if 'connections_total' in self.metrics:
                self.metrics['connections_total'].inc()
            if 'connections_active' in self.metrics:
                self.metrics['connections_active'].set(len(self.connected_clients))
        
        try:
            # Send initial system notification
            await websocket.send(json.dumps({
                "type": "system",
                "message": "Connected to PyArrow Content Index WebSocket",
                "timestamp": datetime.datetime.now().isoformat()
            }))
            
            # Update metrics
            if HAS_OBSERVABILITY and 'messages_sent' in self.metrics:
                self.metrics['messages_sent'].labels(message_type="system").inc()
            
            # Process messages from the client (primarily heartbeats)
            async for message in websocket:
                try:
                    # Check rate limit for messages
                    if not self._check_rate_limit('message', client_id):
                        await websocket.send(json.dumps({
                            "type": "error",
                            "error": "rate_limit_exceeded",
                            "message": "Message rate limit exceeded"
                        }))
                        continue
                    
                    data = json.loads(message)
                    message_type = data.get("type", "unknown")
                    
                    # Update received message metrics
                    if HAS_OBSERVABILITY and 'messages_received' in self.metrics:
                        self.metrics['messages_received'].labels(message_type=message_type).inc()
                    
                    # Handle heartbeat messages
                    if message_type == "heartbeat":
                        await websocket.send(json.dumps({
                            "type": "heartbeat",
                            "timestamp": datetime.datetime.now().isoformat()
                        }))
                        
                        # Update sent message metrics
                        if HAS_OBSERVABILITY and 'messages_sent' in self.metrics:
                            self.metrics['messages_sent'].labels(message_type="heartbeat").inc()
                            
                        logger.debug(f"Heartbeat from client {client_id}")
                        
                except json.JSONDecodeError:
                    logger.warning(f"Received invalid JSON from client {client_id}: {message}")
                    
        except websockets.ConnectionClosed as e:
            logger.info(f"Connection to client {client_id} closed with code {e.code}: {e.reason}")
        except Exception as e:
            logger.error(f"Error handling client {client_id}: {e}")
            
            # Update connection error metrics
            if HAS_OBSERVABILITY and 'connection_errors' in self.metrics:
                self.metrics['connection_errors'].labels(error_type="handler_error").inc()
        finally:
            # Remove client from the set of connected clients
            self.connected_clients.remove(websocket)
            
            # Clean up client info
            if client_id in self.client_info:
                del self.client_info[client_id]
                
            logger.info(f"Client {client_id} disconnected, total clients: {len(self.connected_clients)}")
            
            # Update active connection metrics
            if HAS_OBSERVABILITY and 'connections_active' in self.metrics:
                self.metrics['connections_active'].set(len(self.connected_clients))
    
    async def notify_clients(self, notification: Dict[str, Any]) -> int:
        """
        Send notification to all connected clients
        
        Args:
            notification: Notification data to send
            
        Returns:
            Number of clients notification was sent to
        """
        if not self.connected_clients:
            logger.debug("No connected clients to notify")
            return 0
            
        # Convert notification to JSON string
        message = json.dumps(notification)
        notification_type = notification.get("type", "unknown")
        
        # Start timing if metrics are enabled
        start_time = time.time()
        
        # Track successful sends
        successful_sends = 0
        
        # Send to all connected clients
        for client in list(self.connected_clients):
            try:
                await client.send(message)
                successful_sends += 1
                
                # Update metrics
                if HAS_OBSERVABILITY and 'messages_sent' in self.metrics:
                    self.metrics['messages_sent'].labels(message_type=notification_type).inc()
            except websockets.ConnectionClosed:
                # Client disconnected, it will be removed on next connection handling
                pass
            except Exception as e:
                logger.warning(f"Error sending notification to client: {e}")
        
        # Update notification metrics
        if HAS_OBSERVABILITY:
            if 'notifications_sent' in self.metrics:
                self.metrics['notifications_sent'].labels(notification_type=notification_type).inc()
                
            # Record notification duration
            if 'notification_duration' in self.metrics:
                duration = time.time() - start_time
                self.metrics['notification_duration'].labels(notification_type=notification_type).observe(duration)
        
        logger.debug(f"Notification sent to {successful_sends}/{len(self.connected_clients)} clients")
        return successful_sends
    
    @timer(metric_name="pyarrow_content_index_ws_notification_operation", 
           labels={"operation": "notify_content_added"})
    async def notify_content_added(self, cid: str, path: str, 
                                  mimetype: Optional[str] = None, 
                                  size: Optional[int] = None,
                                  metadata: Optional[Dict[str, Any]] = None) -> int:
        """
        Notify clients that content was added to the index
        
        Args:
            cid: Content identifier
            path: Content path
            mimetype: Content MIME type
            size: Content size in bytes
            metadata: Additional metadata
            
        Returns:
            Number of clients notification was sent to
        """
        # Prepare notification data
        data = {
            "cid": cid,
            "path": path,
            "timestamp": datetime.datetime.now().isoformat(),
            "id": str(uuid.uuid4())  # Add unique ID for notification
        }
        
        # Add optional fields if provided
        if mimetype is not None:
            data["mimetype"] = mimetype
        if size is not None:
            data["size"] = size
        if metadata is not None:
            data["metadata"] = metadata
            
        # Send notification
        return await self.notify_clients({
            "type": "content-added",
            "data": data
        })
    
    @timer(metric_name="pyarrow_content_index_ws_notification_operation", 
           labels={"operation": "notify_content_updated"})
    async def notify_content_updated(self, cid: str, 
                                    updates: Dict[str, Any]) -> int:
        """
        Notify clients that content was updated in the index
        
        Args:
            cid: Content identifier
            updates: Fields that were updated
            
        Returns:
            Number of clients notification was sent to
        """
        # Prepare notification data
        data = {
            "cid": cid,
            "updates": updates,
            "timestamp": datetime.datetime.now().isoformat(),
            "id": str(uuid.uuid4())  # Add unique ID for notification
        }
        
        # Make sure it includes the original values
        if "path" in updates:
            data["path"] = updates["path"]
        if "mimetype" in updates:
            data["mimetype"] = updates["mimetype"]
        if "size" in updates:
            data["size"] = updates["size"]
            
        # Send notification
        return await self.notify_clients({
            "type": "content-updated",
            "data": data
        })
    
    @timer(metric_name="pyarrow_content_index_ws_notification_operation", 
           labels={"operation": "notify_content_deleted"})
    async def notify_content_deleted(self, cid: str, 
                                    path: Optional[str] = None) -> int:
        """
        Notify clients that content was deleted from the index
        
        Args:
            cid: Content identifier
            path: Content path (optional)
            
        Returns:
            Number of clients notification was sent to
        """
        # Prepare notification data
        data = {
            "cid": cid,
            "timestamp": datetime.datetime.now().isoformat(),
            "id": str(uuid.uuid4())  # Add unique ID for notification
        }
        
        # Add path if provided
        if path:
            data["path"] = path
            
        # Send notification
        return await self.notify_clients({
            "type": "content-deleted",
            "data": data
        })
    
    @timer(metric_name="pyarrow_content_index_ws_notification_operation", 
           labels={"operation": "notify_content_synced"})
    async def notify_content_synced(self, added: int = 0, 
                                  updated: int = 0, 
                                  removed: int = 0,
                                  details: Optional[Dict[str, Any]] = None) -> int:
        """
        Notify clients that a sync operation completed
        
        Args:
            added: Number of items added
            updated: Number of items updated
            removed: Number of items removed
            details: Additional details about the sync
            
        Returns:
            Number of clients notification was sent to
        """
        # Prepare notification data
        data = {
            "added": added,
            "updated": updated,
            "removed": removed,
            "timestamp": datetime.datetime.now().isoformat(),
            "id": str(uuid.uuid4())  # Add unique ID for notification
        }
        
        # Add details if provided
        if details:
            # Filter out large data structures to avoid overwhelming clients
            filtered_details = {}
            for key, value in details.items():
                # Skip large arrays and objects
                if isinstance(value, (list, dict)) and len(str(value)) > 1000:
                    continue
                filtered_details[key] = value
                
            data.update(filtered_details)
            
        # Send notification
        return await self.notify_clients({
            "type": "content-synced",
            "data": data
        })
    
    @timer(metric_name="pyarrow_content_index_ws_notification_operation", 
           labels={"operation": "notify_system"})
    async def notify_system(self, message: str, 
                          level: str = "info",
                          details: Optional[Dict[str, Any]] = None) -> int:
        """
        Send a system notification to all clients
        
        Args:
            message: System message
            level: Message level (info, warning, error)
            details: Additional details
            
        Returns:
            Number of clients notification was sent to
        """
        # Prepare notification data
        data = {
            "message": message,
            "level": level,
            "timestamp": datetime.datetime.now().isoformat(),
            "id": str(uuid.uuid4())  # Add unique ID for notification
        }
        
        # Add details if provided
        if details:
            data.update(details)
            
        # Send notification
        return await self.notify_clients({
            "type": "system",
            "data": data
        })
    
    async def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the WebSocket server
        
        Returns:
            Dictionary with server statistics
        """
        stats = {
            "running": self.running,
            "connected_clients": len(self.connected_clients),
            "uptime": time.time() - self.start_time if self.start_time else 0,
            "auth_required": self.auth_required,
            "rate_limits": self.rate_limits
        }
        
        # Add client information (filtered)
        stats["clients"] = [
            {
                "id": client_id,
                "connection_time": info.get("connection_time"),
                "authenticated": info.get("authenticated", False),
                "principal": info.get("principal", "none") if info.get("authenticated", False) else "none"
            }
            for client_id, info in self.client_info.items()
        ]
        
        # Add metrics if available
        if HAS_OBSERVABILITY and self.metrics:
            try:
                # Add metrics that are directly accessible (counters and gauges)
                metrics_snapshot = {}
                for name, metric in self.metrics.items():
                    if hasattr(metric, '_value') and not name.endswith('_duration'):
                        metrics_snapshot[name] = metric._value
                
                stats["metrics"] = metrics_snapshot
            except Exception as e:
                logger.error(f"Error getting metrics for stats: {e}")
        
        return stats

# Singleton instance for the application
_ws_server_instance = None

def get_ws_server():
    """Get or create the singleton WebSocket server instance"""
    global _ws_server_instance
    if _ws_server_instance is None:
        _ws_server_instance = PyArrowContentIndexWSServer()
    return _ws_server_instance

async def start_ws_server():
    """Start the WebSocket server if not already running"""
    server = get_ws_server()
    if not server.running:
        await server.start()
    return server

# Example usage
async def main():
    """Run the WebSocket server"""
    # Start the server
    server = await start_ws_server()
    
    # Keep the server running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("Stopping server...")
    finally:
        await server.stop()

if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run the server
    asyncio.run(main())