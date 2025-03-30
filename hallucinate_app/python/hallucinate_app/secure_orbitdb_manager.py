"""
Secure OrbitDB Manager Module

Provides capability-based secure access to OrbitDB operations
Integrates with UCAN authentication for decentralized auth
Implements proper error handling and access control
"""

import json
import time
from typing import Dict, Any, List, Set, Optional, Union
from datetime import datetime

# Define capability namespaces for OrbitDB operations
ORBITDB_CAPABILITIES = {
    "CREATE": "orbitdb:create",
    "OPEN": "orbitdb:open",
    "WRITE": "orbitdb:write",
    "READ": "orbitdb:read",
    "CLOSE": "orbitdb:close",
    "REPLICATE": "orbitdb:replicate",
    "ADMIN": "orbitdb:admin",
}

class SecureOrbitDBManager:
    """
    Secure wrapper for OrbitDB operations with UCAN capability verification
    Implements security checks and resource usage tracking
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the secure OrbitDB manager
        
        Args:
            resources: Resource pool containing dependencies
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Use resources if provided, otherwise attempt to import defaults
        if self.resources.get('auth'):
            self.auth = self.resources['auth']
        else:
            try:
                from .auth import auth_manager
                self.auth = auth_manager
            except ImportError:
                self.auth = None
                print("WARNING: Auth manager not found, capability verification will fail")
        
        if self.resources.get('orbitdb'):
            self.orbitdb_manager = self.resources['orbitdb']
        else:
            try:
                from .orbitdb_kit import orbitdb_kit
                self.orbitdb_manager = orbitdb_kit
            except ImportError:
                self.orbitdb_manager = None
                print("WARNING: OrbitDB kit not found, using mock implementation")
        
        self.initialized = False
        
        # Cache for tracking databases and their capabilities
        self.db_access_cache = {}
        self.db_open_requests = {}
        
        # Operational stats
        self.stats = {
            "access_granted": 0,
            "access_denied": 0,
            "databases_created": 0,
            "databases_opened": 0,
            "write_operations": 0,
            "read_operations": 0,
            "replication_events": 0,
            "last_request": None
        }
        
        # Resource usage monitoring
        self.resource_usage = {
            "by_database": {},
            "by_user": {}
        }
        
        print("Secure OrbitDB Manager initialized")
    
    async def init(self) -> bool:
        """
        Initialize the secure OrbitDB manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure auth manager is initialized
            if self.auth and hasattr(self.auth, 'init') and not getattr(self.auth, 'initialized', False):
                await self.auth.init()
            
            # Initialize underlying OrbitDB manager if needed
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'init'):
                await self.orbitdb_manager.init()
            
            self.initialized = True
            return True
        except Exception as e:
            print(f"Failed to initialize secure OrbitDB manager: {str(e)}")
            return False
    
    async def create_database(self, name: str, db_type: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely create an OrbitDB database with capability verification
        
        Args:
            name: Database name
            db_type: Database type (keyvalue, docstore, eventlog, feed, counter)
            options: Creation options including authToken for authorization
            
        Returns:
            Dict: Creation result
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "create_database",
            "name": name,
            "type": db_type,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            create_options = options.get("create_options", {})
            
            if not auth_token:
                raise ValueError("Authentication token required for OrbitDB database creation")
            
            # Verify capability token for database creation
            capability_string = f"{ORBITDB_CAPABILITIES['CREATE']}:{name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader orbitdb:create:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['CREATE']}:*")
                
                if not wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized database creation attempt for {name}")
                    raise PermissionError(f"Not authorized to create database: {name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying OrbitDB manager
            result = {}
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'create_database'):
                result = await self.orbitdb_manager.create_database(name, db_type, create_options)
                
                if result and not result.get("error") and result.get("address"):
                    address = result["address"]
                    
                    # Update cache with successful creation
                    self.db_access_cache[address] = {
                        "name": name,
                        "type": db_type,
                        "created_at": datetime.utcnow().isoformat(),
                        "created_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.utcnow().isoformat()
                    }
                    
                    # Update stats
                    self.stats["databases_created"] += 1
                    self._update_resource_usage("create", address, options)
            else:
                # Mock implementation if no OrbitDB manager available
                import hashlib
                import base64
                
                # Create a predictable but unique mock address
                h = hashlib.sha256(f"{name}-{db_type}-{time.time()}".encode()).digest()
                mock_id = base64.b16encode(h[:10]).decode().lower()
                mock_address = f"/orbitdb/{mock_id}/mock-{db_type}"
                
                result = {
                    "success": True,
                    "name": name,
                    "type": db_type,
                    "address": mock_address,
                    "mock": True
                }
                
                # Update cache with mock creation
                self.db_access_cache[mock_address] = {
                    "name": name,
                    "type": db_type,
                    "created_at": datetime.utcnow().isoformat(),
                    "created_by": self._extract_principal_from_token(auth_token),
                    "token": auth_token,
                    "last_used": datetime.utcnow().isoformat(),
                    "mock": True
                }
                
                # Update stats
                self.stats["databases_created"] += 1
                self._update_resource_usage("create", mock_address, options)
            
            return result
        except Exception as e:
            print(f"Secure OrbitDB database creation failed: {str(e)}")
            raise
    
    async def open_database(self, address: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely open an OrbitDB database with capability verification
        
        Args:
            address: OrbitDB address to open
            options: Open options including authToken for authorization
            
        Returns:
            Dict: Database instance result
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "open_database",
            "address": address,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            open_options = options.get("open_options", {})
            
            if not auth_token:
                raise ValueError("Authentication token required for opening OrbitDB database")
            
            # Extract name from address if possible
            db_name = address.split("/")[-1] if "/" in address else address
            
            # Verify capability token for database opening
            capability_string = f"{ORBITDB_CAPABILITIES['OPEN']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for address-based capability
                address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['OPEN']}:{address}")
                
                if not address_capability:
                    # Check if a broader orbitdb:open:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['OPEN']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        print(f"Unauthorized database open attempt for {address}")
                        raise PermissionError(f"Not authorized to open database: {address}")
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Track pending open requests
            self.db_open_requests[address] = {
                "requested_at": datetime.utcnow().isoformat(),
                "requested_by": self._extract_principal_from_token(auth_token),
                "token": auth_token
            }
            
            # Call underlying OrbitDB manager
            result = {}
            try:
                if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'open_database'):
                    result = await self.orbitdb_manager.open_database(address, open_options)
                    
                    if result and not result.get("error"):
                        # Update cache with successful open
                        if address not in self.db_access_cache:
                            self.db_access_cache[address] = {
                                "name": db_name,
                                "address": address,
                                "created_at": "unknown",
                                "created_by": "unknown",
                                "last_used": datetime.utcnow().isoformat()
                            }
                        else:
                            # Update last used timestamp
                            db_info = self.db_access_cache[address]
                            db_info["last_used"] = datetime.utcnow().isoformat()
                            self.db_access_cache[address] = db_info
                        
                        # Update stats
                        self.stats["databases_opened"] += 1
                        self._update_resource_usage("open", address, options)
                else:
                    # Mock implementation if no OrbitDB manager available
                    result = {
                        "success": True,
                        "address": address,
                        "name": db_name,
                        "mock": True,
                        "db_instance": {
                            "address": address,
                            "type": "mock",
                            "get": lambda key: None,
                            "put": lambda key, value: "mock-hash",
                            "add": lambda data: "mock-hash"
                        }
                    }
                    
                    # Update cache with mock open
                    if address not in self.db_access_cache:
                        self.db_access_cache[address] = {
                            "name": db_name,
                            "address": address,
                            "created_at": datetime.utcnow().isoformat(),
                            "created_by": self._extract_principal_from_token(auth_token),
                            "last_used": datetime.utcnow().isoformat(),
                            "mock": True
                        }
                    else:
                        # Update last used timestamp
                        db_info = self.db_access_cache[address]
                        db_info["last_used"] = datetime.utcnow().isoformat()
                        self.db_access_cache[address] = db_info
                    
                    # Update stats
                    self.stats["databases_opened"] += 1
                    self._update_resource_usage("open", address, options)
            finally:
                # Clean up open request
                if address in self.db_open_requests:
                    del self.db_open_requests[address]
            
            return result
        except Exception as e:
            # Clean up open request
            if address in self.db_open_requests:
                del self.db_open_requests[address]
            
            print(f"Secure OrbitDB database opening failed: {str(e)}")
            raise
    
    async def write(self, address: str, operation: str, data: Any, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely write to an OrbitDB database with capability verification
        
        Args:
            address: OrbitDB address to write to
            operation: Write operation (put, add, inc, etc.)
            data: Data to write
            options: Write options including authToken for authorization
            
        Returns:
            Dict: Write result
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "write",
            "address": address,
            "operation": operation,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            key = options.get("key")
            write_options = options.get("write_options", {})
            
            if not auth_token:
                raise ValueError("Authentication token required for OrbitDB write operations")
            
            # Extract name from address if possible
            db_name = address.split("/")[-1] if "/" in address else address
            
            # Verify capability token for database writing
            capability_string = f"{ORBITDB_CAPABILITIES['WRITE']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for address-based capability
                address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['WRITE']}:{address}")
                
                if not address_capability:
                    # Check if a broader orbitdb:write:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['WRITE']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        print(f"Unauthorized database write attempt for {address}")
                        raise PermissionError(f"Not authorized to write to database: {address}")
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update last used timestamp in cache
            if address in self.db_access_cache:
                db_info = self.db_access_cache[address]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[address] = db_info
            
            # Call underlying OrbitDB manager
            result = {}
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'write'):
                result = await self.orbitdb_manager.write(address, operation, data, key, write_options)
                
                if result and not result.get("error"):
                    # Update stats
                    self.stats["write_operations"] += 1
                    self._update_resource_usage("write", address, options)
            else:
                # Mock implementation if no OrbitDB manager available
                import hashlib
                import base64
                
                # Create a mock hash for the operation
                data_str = json.dumps(data) if isinstance(data, (dict, list)) else str(data)
                h = hashlib.sha256(f"{address}-{operation}-{data_str}-{key}-{time.time()}".encode()).digest()
                mock_hash = "z" + base64.b32encode(h[:20]).decode().lower()
                
                result = {
                    "success": True,
                    "hash": mock_hash,
                    "operation": operation,
                    "address": address,
                    "mock": True
                }
                
                # Update stats
                self.stats["write_operations"] += 1
                self._update_resource_usage("write", address, options)
            
            return result
        except Exception as e:
            print(f"Secure OrbitDB write operation failed: {str(e)}")
            raise
    
    async def read(self, address: str, operation: str, key=None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely read from an OrbitDB database with capability verification
        
        Args:
            address: OrbitDB address to read from
            operation: Read operation (get, query, iterator, etc.)
            key: Key or query parameters for read operation
            options: Read options including authToken for authorization
            
        Returns:
            Dict: Read result
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "read",
            "address": address,
            "operation": operation,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            read_options = options.get("read_options", {})
            
            if not auth_token:
                raise ValueError("Authentication token required for OrbitDB read operations")
            
            # Extract name from address if possible
            db_name = address.split("/")[-1] if "/" in address else address
            
            # Verify capability token for database reading
            capability_string = f"{ORBITDB_CAPABILITIES['READ']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for address-based capability
                address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['READ']}:{address}")
                
                if not address_capability:
                    # Check if a broader orbitdb:read:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['READ']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        print(f"Unauthorized database read attempt for {address}")
                        raise PermissionError(f"Not authorized to read from database: {address}")
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update last used timestamp in cache
            if address in self.db_access_cache:
                db_info = self.db_access_cache[address]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[address] = db_info
            
            # Call underlying OrbitDB manager
            result = None
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'read'):
                result = await self.orbitdb_manager.read(address, operation, key, read_options)
                
                # Update stats
                self.stats["read_operations"] += 1
                self._update_resource_usage("read", address, options)
            else:
                # Mock implementation if no OrbitDB manager available
                if operation == "get":
                    result = {"id": key, "value": f"mock-value-for-{key}"} if key else None
                elif operation == "query":
                    result = [{"id": "mock1", "value": "Mock data 1"}, {"id": "mock2", "value": "Mock data 2"}]
                elif operation == "iterator":
                    # This is a simplified mock; in reality would need to match Python's expected iterator interface
                    result = [{"id": "mock1", "value": "Mock data 1"}, {"id": "mock2", "value": "Mock data 2"}]
                else:
                    result = None
                
                # Update stats
                self.stats["read_operations"] += 1
                self._update_resource_usage("read", address, options)
            
            return {
                "success": True,
                "address": address,
                "operation": operation,
                "key": key,
                "result": result,
                "mock": not (self.orbitdb_manager and hasattr(self.orbitdb_manager, 'read'))
            }
        except Exception as e:
            print(f"Secure OrbitDB read operation failed: {str(e)}")
            raise
    
    async def close_database(self, address: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely close an OrbitDB database with capability verification
        
        Args:
            address: OrbitDB address to close
            options: Close options including authToken for authorization
            
        Returns:
            Dict: Close result
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "close_database",
            "address": address,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for closing OrbitDB database")
            
            # Extract name from address if possible
            db_name = address.split("/")[-1] if "/" in address else address
            
            # Verify capability token for database closing
            capability_string = f"{ORBITDB_CAPABILITIES['CLOSE']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for address-based capability
                address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['CLOSE']}:{address}")
                
                if not address_capability:
                    # Check for write capability (which implies close capability)
                    write_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['WRITE']}:{db_name}")
                    write_address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['WRITE']}:{address}")
                    
                    if not write_capability and not write_address_capability:
                        # Check for wildcard capabilities
                        wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['CLOSE']}:*")
                        write_wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['WRITE']}:*")
                        
                        if not wildcard_authorized and not write_wildcard_authorized:
                            self.stats["access_denied"] += 1
                            print(f"Unauthorized database close attempt for {address}")
                            raise PermissionError(f"Not authorized to close database: {address}")
                        else:
                            is_authorized = True
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying OrbitDB manager
            result = {}
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'close_database'):
                result = await self.orbitdb_manager.close_database(address)
            else:
                # Mock implementation if no OrbitDB manager available
                result = {
                    "success": True,
                    "address": address,
                    "mock": True
                }
            
            # Update last used timestamp in cache before removing
            if address in self.db_access_cache:
                db_info = self.db_access_cache[address]
                db_info["last_used"] = datetime.utcnow().isoformat()
                db_info["closed"] = True
                self.db_access_cache[address] = db_info
            
            return result
        except Exception as e:
            print(f"Secure OrbitDB database closing failed: {str(e)}")
            raise
    
    async def replicate_database(self, address: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely replicate an OrbitDB database with capability verification
        
        Args:
            address: OrbitDB address to replicate
            options: Replication options including authToken for authorization
            
        Returns:
            Dict: Replication result
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "replicate_database",
            "address": address,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            replication_options = options.get("replication_options", {})
            
            if not auth_token:
                raise ValueError("Authentication token required for OrbitDB database replication")
            
            # Extract name from address if possible
            db_name = address.split("/")[-1] if "/" in address else address
            
            # Verify capability token for database replication
            capability_string = f"{ORBITDB_CAPABILITIES['REPLICATE']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for address-based capability
                address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['REPLICATE']}:{address}")
                
                if not address_capability:
                    # Check if a broader orbitdb:replicate:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['REPLICATE']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        print(f"Unauthorized database replication attempt for {address}")
                        raise PermissionError(f"Not authorized to replicate database: {address}")
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update last used timestamp in cache
            if address in self.db_access_cache:
                db_info = self.db_access_cache[address]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[address] = db_info
            
            # Call underlying OrbitDB manager
            result = {}
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'replicate_database'):
                result = await self.orbitdb_manager.replicate_database(address, replication_options)
                
                if result and not result.get("error"):
                    # Update stats
                    self.stats["replication_events"] += 1
                    self._update_resource_usage("replicate", address, options)
            else:
                # Mock implementation if no OrbitDB manager available
                result = {
                    "success": True,
                    "address": address,
                    "peers": ["QmMock1", "QmMock2"],
                    "progress": 100,
                    "mock": True
                }
                
                # Update stats
                self.stats["replication_events"] += 1
                self._update_resource_usage("replicate", address, options)
            
            return result
        except Exception as e:
            print(f"Secure OrbitDB database replication failed: {str(e)}")
            raise
    
    async def list_databases(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely list OrbitDB databases with capability verification
        
        Args:
            options: List options including authToken for authorization
            
        Returns:
            Dict: List of databases
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "list_databases",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for listing OrbitDB databases")
            
            # Verify capability token for database listing (admin capability)
            capability_string = f"{ORBITDB_CAPABILITIES['ADMIN']}:list"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                self.stats["access_denied"] += 1
                print("Unauthorized database listing attempt")
                raise PermissionError("Not authorized to list OrbitDB databases")
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying OrbitDB manager if available
            external_databases = {}
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'list_databases'):
                try:
                    external_list = await self.orbitdb_manager.list_databases()
                    if external_list and not external_list.get("error") and "databases" in external_list:
                        external_databases = external_list["databases"]
                except Exception as e:
                    print(f"Error listing databases from OrbitDB manager: {str(e)}")
            
            # Merge external databases with cache
            databases = {}
            
            # Add all cached databases
            for address, db_info in self.db_access_cache.items():
                databases[address] = {
                    "address": address,
                    "name": db_info.get("name"),
                    "created_at": db_info.get("created_at"),
                    "created_by": db_info.get("created_by"),
                    "last_used": db_info.get("last_used"),
                    "type": db_info.get("type", "unknown"),
                    "closed": db_info.get("closed", False),
                    "mock": db_info.get("mock", False)
                }
            
            # Add any external databases not in cache
            for address, db_info in external_databases.items():
                if address not in databases:
                    databases[address] = db_info
                    
                    # Add to cache
                    self.db_access_cache[address] = {
                        "name": db_info.get("name") or address.split("/")[-1] if "/" in address else address,
                        "type": db_info.get("type", "unknown"),
                        "created_at": db_info.get("created_at", datetime.utcnow().isoformat()),
                        "created_by": db_info.get("created_by", "unknown"),
                        "last_used": datetime.utcnow().isoformat()
                    }
            
            return {
                "success": True,
                "databases": databases,
                "count": len(databases)
            }
        except Exception as e:
            print(f"Secure OrbitDB database listing failed: {str(e)}")
            raise
    
    async def get_database_info(self, address: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get database information with capability verification
        
        Args:
            address: OrbitDB address to get info about
            options: Options including authToken for authorization
            
        Returns:
            Dict: Database information
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "get_database_info",
            "address": address,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for getting database info")
            
            # Extract name from address if possible
            db_name = address.split("/")[-1] if "/" in address else address
            
            # Verify capability token for database reading (read access implies info access)
            capability_string = f"{ORBITDB_CAPABILITIES['READ']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for address-based capability
                address_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['READ']}:{address}")
                
                if not address_capability:
                    # Check for admin capability
                    admin_capability = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['ADMIN']}:*")
                    
                    if not admin_capability:
                        # Check for wildcard read capability
                        wildcard_authorized = await self.auth.verify_capability(auth_token, f"{ORBITDB_CAPABILITIES['READ']}:*")
                        
                        if not wildcard_authorized:
                            self.stats["access_denied"] += 1
                            print(f"Unauthorized database info request for {address}")
                            raise PermissionError(f"Not authorized to get info for database: {address}")
                        else:
                            is_authorized = True
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update last used timestamp in cache
            cached_info = None
            if address in self.db_access_cache:
                db_info = self.db_access_cache[address]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[address] = db_info
                cached_info = db_info
            
            # Get info from underlying OrbitDB manager if available
            external_info = None
            if self.orbitdb_manager and hasattr(self.orbitdb_manager, 'get_database_info'):
                try:
                    external_info = await self.orbitdb_manager.get_database_info(address)
                except Exception as e:
                    print(f"Error getting database info for {address} from OrbitDB manager: {str(e)}")
            
            # Combine cached and external info, preferring external if available
            default_info = {
                "address": address,
                "name": db_name,
                "type": "unknown",
                "created_at": "unknown",
                "created_by": "unknown",
                "last_used": datetime.utcnow().isoformat()
            }
            
            # Start with default info
            info = default_info.copy()
            
            # Add cached info if available
            if cached_info:
                for key, value in cached_info.items():
                    # Convert Python snake_case to JavaScript camelCase
                    js_key = "".join([key.split("_")[0]] + [part.capitalize() for part in key.split("_")[1:]])
                    info[js_key] = value
            
            # Add external info if available
            if external_info and not external_info.get("error"):
                for key, value in external_info.items():
                    info[key] = value
            
            # Update stats
            self.stats["read_operations"] += 1
            self._update_resource_usage("info", address, options)
            
            return {
                "success": True,
                "info": info,
                "mock": not external_info and (not self.orbitdb_manager or not hasattr(self.orbitdb_manager, 'get_database_info'))
            }
        except Exception as e:
            print(f"Secure OrbitDB get database info failed: {str(e)}")
            raise
    
    def _extract_principal_from_token(self, token: str) -> str:
        """
        Extract principal ID from auth token (simplified)
        
        Args:
            token: Auth token
            
        Returns:
            str: Principal ID
        """
        # In a real implementation, this would decode the UCAN token
        # For now, we'll just return a placeholder value
        return "principal:unknown"
    
    def _update_resource_usage(self, operation: str, address: str, options: Dict[str, Any] = None) -> None:
        """
        Update resource usage tracking
        
        Args:
            operation: Operation type
            address: Database address
            options: Operation options
        """
        options = options or {}
        
        # Initialize database tracking if needed
        if address not in self.resource_usage["by_database"]:
            self.resource_usage["by_database"][address] = {
                "creates": 0,
                "opens": 0,
                "writes": 0,
                "reads": 0,
                "replications": 0,
                "last_access": None
            }
        
        # Initialize user tracking if options has user info
        user_id = options.get("user_id", "anonymous")
        if user_id not in self.resource_usage["by_user"]:
            self.resource_usage["by_user"][user_id] = {
                "creates": 0,
                "opens": 0,
                "writes": 0,
                "reads": 0,
                "replications": 0,
                "databases": set()
            }
        
        # Update counters based on operation
        if operation == "create":
            self.resource_usage["by_database"][address]["creates"] += 1
            self.resource_usage["by_user"][user_id]["creates"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(address)
        elif operation == "open":
            self.resource_usage["by_database"][address]["opens"] += 1
            self.resource_usage["by_user"][user_id]["opens"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(address)
        elif operation == "write":
            self.resource_usage["by_database"][address]["writes"] += 1
            self.resource_usage["by_user"][user_id]["writes"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(address)
        elif operation == "read" or operation == "info":
            self.resource_usage["by_database"][address]["reads"] += 1
            self.resource_usage["by_user"][user_id]["reads"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(address)
        elif operation == "replicate":
            self.resource_usage["by_database"][address]["replications"] += 1
            self.resource_usage["by_user"][user_id]["replications"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(address)
        
        # Update last access timestamp
        self.resource_usage["by_database"][address]["last_access"] = datetime.utcnow().isoformat()
    
    async def get_stats(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get module statistics
        
        Args:
            options: Options for stats retrieval including authToken
            
        Returns:
            Dict: Module statistics
        """
        if not self.initialized:
            raise RuntimeError("Secure OrbitDB manager not initialized. Call init() first")
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            # Verify capability token for admin access
            capability_string = f"{ORBITDB_CAPABILITIES['ADMIN']}:stats"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                print("Unauthorized stats access attempt")
                raise PermissionError("Not authorized to access module statistics")
            
            # Convert Python set to list for JSON serialization in user stats
            user_stats = {}
            for user_id, stats in self.resource_usage["by_user"].items():
                user_stats[user_id] = {
                    "creates": stats["creates"],
                    "opens": stats["opens"],
                    "writes": stats["writes"],
                    "reads": stats["reads"],
                    "replications": stats["replications"],
                    "databases": list(stats["databases"])
                }
            
            # Return copy of stats with serializable user stats
            return {
                **self.stats,
                "database_count": len(self.db_access_cache),
                "resource_usage": {
                    "database_count": len(self.resource_usage["by_database"]),
                    "user_count": len(self.resource_usage["by_user"]),
                    "total_writes": self.stats["write_operations"],
                    "total_reads": self.stats["read_operations"],
                    "top_databases": self._get_top_databases(5),
                    "by_user": user_stats
                }
            }
        except Exception as e:
            print(f"Failed to get secure OrbitDB manager stats: {str(e)}")
            raise
    
    def _get_top_databases(self, count: int = 5) -> List[Dict[str, Any]]:
        """
        Get top N databases by usage
        
        Args:
            count: Number of databases to return
            
        Returns:
            List: Top databases
        """
        database_stats = sorted(
            [(address, stats) for address, stats in self.resource_usage["by_database"].items()],
            key=lambda x: (x[1]["reads"] + x[1]["writes"]),
            reverse=True
        )[:count]
        
        return [
            {
                "address": address,
                "reads": stats["reads"],
                "writes": stats["writes"],
                "total_operations": stats["reads"] + stats["writes"],
                "last_access": stats["last_access"]
            }
            for address, stats in database_stats
        ]
    
    async def test(self) -> Dict[str, Any]:
        """
        Run tests on the secure OrbitDB manager
        
        Returns:
            Dict: Test results
        """
        print("Testing secure OrbitDB manager")
        
        try:
            test_results = {
                "success": True,
                "module": "secure_orbitdb_manager",
                "initialization": False,
                "capability_verification": False,
                "database_operations": {
                    "create": False,
                    "open": False,
                    "write": False,
                    "read": False,
                    "close": False,
                    "replicate": False,
                    "list": False
                },
                "stats_tracking": False
            }
            
            # Test initialization if not already initialized
            if not self.initialized:
                init_result = await self.init()
                test_results["initialization"] = init_result
            else:
                test_results["initialization"] = True
            
            if test_results["initialization"]:
                # Create test principals and capabilities for testing
                if not hasattr(self.auth, 'principals') or 'test-user' not in self.auth.principals:
                    await self.auth.create_principal('test-user')
                
                # Issue capabilities for testing
                admin_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["ADMIN"],
                    "with": "*"
                })
                
                create_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["CREATE"],
                    "with": "*"
                })
                
                open_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["OPEN"],
                    "with": "*"
                })
                
                write_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["WRITE"],
                    "with": "*"
                })
                
                read_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["READ"],
                    "with": "*"
                })
                
                close_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["CLOSE"],
                    "with": "*"
                })
                
                replicate_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": ORBITDB_CAPABILITIES["REPLICATE"],
                    "with": "*"
                })
                
                # Test capability verification
                try:
                    # Test with invalid token (should fail)
                    try:
                        await self.create_database('test-db', 'keyvalue', {"auth_token": 'invalid-token'})
                        test_results["capability_verification"] = False
                    except PermissionError:
                        # This should fail, so it's actually good
                        test_results["capability_verification"] = True
                    
                    if test_results["capability_verification"]:
                        # Test database operations with valid tokens
                        try:
                            # Test create database
                            create_result = await self.create_database('test-db', 'keyvalue', {
                                "auth_token": create_token["token"],
                                "user_id": 'test-user'
                            })
                            test_results["database_operations"]["create"] = create_result and create_result.get("address")
                            
                            if create_result and create_result.get("address"):
                                address = create_result["address"]
                                
                                # Test open database
                                open_result = await self.open_database(address, {
                                    "auth_token": open_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["open"] = open_result and (open_result.get("success") or open_result.get("db_instance"))
                                
                                # Test write operation
                                write_result = await self.write(address, 'put', {"key": 'test-key', "value": 'test-value'}, {
                                    "auth_token": write_token["token"],
                                    "user_id": 'test-user',
                                    "key": 'test-key'
                                })
                                test_results["database_operations"]["write"] = write_result and (write_result.get("success") or write_result.get("hash"))
                                
                                # Test read operation
                                read_result = await self.read(address, 'get', 'test-key', {
                                    "auth_token": read_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["read"] = read_result and read_result.get("success")
                                
                                # Test replication (may be mock)
                                replicate_result = await self.replicate_database(address, {
                                    "auth_token": replicate_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["replicate"] = replicate_result and replicate_result.get("success")
                                
                                # Test list databases
                                list_result = await self.list_databases({
                                    "auth_token": admin_token["token"]
                                })
                                test_results["database_operations"]["list"] = list_result and \
                                    list_result.get("success") and \
                                    list_result.get("databases") and \
                                    address in list_result["databases"]
                                
                                # Test close database
                                close_result = await self.close_database(address, {
                                    "auth_token": close_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["close"] = close_result and close_result.get("success")
                                
                                # Test stats
                                stats = await self.get_stats({"auth_token": admin_token["token"]})
                                test_results["stats_tracking"] = stats and \
                                    "access_granted" in stats and \
                                    "databases_created" in stats and \
                                    "write_operations" in stats and \
                                    "read_operations" in stats
                            
                        except Exception as e:
                            print(f"Database operations tests failed: {str(e)}")
                            
                            # Mark failed operations
                            if not test_results["database_operations"]["create"]:
                                test_results["database_operations"]["create"] = False
                            if not test_results["database_operations"]["open"]:
                                test_results["database_operations"]["open"] = False
                            if not test_results["database_operations"]["write"]:
                                test_results["database_operations"]["write"] = False
                            if not test_results["database_operations"]["read"]:
                                test_results["database_operations"]["read"] = False
                            if not test_results["database_operations"]["close"]:
                                test_results["database_operations"]["close"] = False
                            if not test_results["database_operations"]["replicate"]:
                                test_results["database_operations"]["replicate"] = False
                            if not test_results["database_operations"]["list"]:
                                test_results["database_operations"]["list"] = False
                            if not test_results["stats_tracking"]:
                                test_results["stats_tracking"] = False
                
                except Exception as e:
                    print(f"Capability verification test failed: {str(e)}")
            
            # Overall success
            test_results["success"] = test_results["initialization"] and \
                                    test_results["capability_verification"] and \
                                    all(test_results["database_operations"].values()) and \
                                    test_results["stats_tracking"]
            
            return test_results
        except Exception as e:
            print(f"Secure OrbitDB manager test failed: {str(e)}")
            return {
                "success": False,
                "module": "secure_orbitdb_manager",
                "error": str(e)
            }

# Create default instance
secure_orbitdb_manager = SecureOrbitDBManager()

__all__ = ['SecureOrbitDBManager', 'secure_orbitdb_manager', 'ORBITDB_CAPABILITIES']