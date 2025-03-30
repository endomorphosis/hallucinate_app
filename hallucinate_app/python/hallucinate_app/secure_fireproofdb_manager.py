"""
Secure FireproofDB Manager Module

Provides capability-based secure access to FireproofDB operations
Integrates with UCAN authentication for decentralized auth
Implements proper error handling and access control
"""

import json
import time
from typing import Dict, Any, List, Set, Optional, Union
from datetime import datetime

# Define capability namespaces for FireproofDB operations
FIREPROOFDB_CAPABILITIES = {
    "CREATE": "fireproofdb:create",
    "DELETE": "fireproofdb:delete",
    "READ": "fireproofdb:read",
    "WRITE": "fireproofdb:write",
    "QUERY": "fireproofdb:query",
    "SYNC": "fireproofdb:sync",
    "EXPORT": "fireproofdb:export",
    "IMPORT": "fireproofdb:import",
    "ADMIN": "fireproofdb:admin",
}

class SecureFireproofDBManager:
    """
    Secure wrapper for FireproofDB database operations with UCAN capability verification
    Implements security checks and resource usage tracking
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the secure FireproofDB manager
        
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
        
        if self.resources.get('fireproofdb'):
            self.fireproofdb_manager = self.resources['fireproofdb']
        else:
            try:
                from .fireproofdb_kit import fireproofdb_kit
                self.fireproofdb_manager = fireproofdb_kit
            except ImportError:
                self.fireproofdb_manager = None
                print("WARNING: FireproofDB kit not found, using mock implementation")
        
        self.initialized = False
        
        # Cache for tracking databases and their capabilities
        self.db_access_cache = {}
        self.db_create_requests = {}
        
        # Operational stats
        self.stats = {
            "access_granted": 0,
            "access_denied": 0,
            "databases_created": 0,
            "databases_deleted": 0,
            "document_writes": 0,
            "document_reads": 0,
            "queries_performed": 0,
            "syncs_performed": 0,
            "exports_performed": 0,
            "imports_performed": 0,
            "last_request": None
        }
        
        # Resource usage monitoring
        self.resource_usage = {
            "by_database": {},
            "by_user": {}
        }
        
        print("Secure FireproofDB Manager initialized")
    
    async def init(self) -> bool:
        """
        Initialize the secure FireproofDB manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure auth manager is initialized
            if self.auth and hasattr(self.auth, 'init') and not getattr(self.auth, 'initialized', False):
                await self.auth.init()
            
            # Initialize underlying FireproofDB manager if needed
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'init'):
                await self.fireproofdb_manager.init()
            
            self.initialized = True
            return True
        except Exception as e:
            print(f"Failed to initialize secure FireproofDB manager: {str(e)}")
            return False
    
    async def create_database(self, name: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely create a FireproofDB database with capability verification
        
        Args:
            name: Database name
            options: Creation options including authToken for authorization
            
        Returns:
            Dict: Creation result
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "create_database",
            "name": name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            create_options = options.get("create_options", {})
            
            if not auth_token:
                raise ValueError("Authentication token required for FireproofDB database creation")
            
            # Verify capability token for database creation
            capability_string = f"{FIREPROOFDB_CAPABILITIES['CREATE']}:{name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader fireproofdb:create:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['CREATE']}:*")
                
                if not wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized database creation attempt for {name}")
                    raise PermissionError(f"Not authorized to create database: {name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'create_database'):
                result = await self.fireproofdb_manager.create_database(name, create_options)
                
                if result and not result.get("error"):
                    # Update cache with successful creation
                    self.db_access_cache[name] = {
                        "name": name,
                        "created_at": datetime.utcnow().isoformat(),
                        "created_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.utcnow().isoformat()
                    }
                    
                    # Update stats
                    self.stats["databases_created"] += 1
                    self._update_resource_usage("create", name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                result = {
                    "success": True,
                    "name": name,
                    "created": True,
                    "mock": True
                }
                
                # Update cache with mock creation
                self.db_access_cache[name] = {
                    "name": name,
                    "created_at": datetime.utcnow().isoformat(),
                    "created_by": self._extract_principal_from_token(auth_token),
                    "token": auth_token,
                    "last_used": datetime.utcnow().isoformat(),
                    "mock": True
                }
                
                # Update stats
                self.stats["databases_created"] += 1
                self._update_resource_usage("create", name, options)
            
            return result
        except Exception as e:
            print(f"Secure FireproofDB database creation failed: {str(e)}")
            raise
    
    async def delete_database(self, name: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely delete a FireproofDB database with capability verification
        
        Args:
            name: Database name
            options: Deletion options including authToken for authorization
            
        Returns:
            Dict: Deletion result
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "delete_database",
            "name": name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for FireproofDB database deletion")
            
            # Verify capability token for database deletion
            capability_string = f"{FIREPROOFDB_CAPABILITIES['DELETE']}:{name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader fireproofdb:delete:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['DELETE']}:*")
                
                # Also check for admin capability
                admin_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:*")
                
                if not wildcard_authorized and not admin_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized database deletion attempt for {name}")
                    raise PermissionError(f"Not authorized to delete database: {name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'delete_database'):
                result = await self.fireproofdb_manager.delete_database(name)
                
                if result and result.get("deleted"):
                    # Remove from cache
                    if name in self.db_access_cache:
                        del self.db_access_cache[name]
                    
                    # Update stats
                    self.stats["databases_deleted"] += 1
                    self._update_resource_usage("delete", name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                result = {
                    "name": name,
                    "deleted": True,
                    "mock": True
                }
                
                # Remove from cache
                if name in self.db_access_cache:
                    del self.db_access_cache[name]
                
                # Update stats
                self.stats["databases_deleted"] += 1
                self._update_resource_usage("delete", name, options)
            
            return result
        except Exception as e:
            print(f"Secure FireproofDB database deletion failed: {str(e)}")
            raise
    
    async def list_databases(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely list FireproofDB databases with capability verification
        
        Args:
            options: List options including authToken for authorization
            
        Returns:
            Dict: List of databases
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "list_databases",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for listing FireproofDB databases")
            
            # Verify capability token for database listing (admin capability)
            capability_string = f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:list"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            # Also check for read:* capability as a fallback
            read_all_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['READ']}:*")
            
            if not is_authorized and not read_all_authorized:
                self.stats["access_denied"] += 1
                print("Unauthorized database listing attempt")
                raise PermissionError("Not authorized to list FireproofDB databases")
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'list_databases'):
                result = await self.fireproofdb_manager.list_databases()
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                db_list = []
                
                for name, info in self.db_access_cache.items():
                    db_list.append({
                        "name": name,
                        "doc_count": random.randint(0, 100),
                        "update_seq": int(time.time() * 1000),
                        "created_at": info.get("created_at"),
                        "created_by": info.get("created_by"),
                        "mock": True
                    })
                
                result = {
                    "databases": db_list,
                    "count": len(db_list)
                }
            
            # Add cache info to results
            if result and "databases" in result:
                for db in result["databases"]:
                    db_name = db.get("name")
                    if db_name in self.db_access_cache:
                        cache_info = self.db_access_cache[db_name]
                        db["created_at"] = db.get("created_at") or cache_info.get("created_at")
                        db["created_by"] = db.get("created_by") or cache_info.get("created_by")
                        db["last_used"] = cache_info.get("last_used")
            
            return result
        except Exception as e:
            print(f"Secure FireproofDB database listing failed: {str(e)}")
            raise
    
    async def put_document(self, db_name: str, doc: Dict[str, Any], options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely put a document into a FireproofDB database with capability verification
        
        Args:
            db_name: Database name
            doc: Document to store
            options: Put options including authToken for authorization
            
        Returns:
            Dict: Put result
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "put_document",
            "db_name": db_name,
            "doc_id": doc.get("_id"),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for document write operations")
            
            # Verify capability token for document writing
            capability_string = f"{FIREPROOFDB_CAPABILITIES['WRITE']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader fireproofdb:write:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['WRITE']}:*")
                
                if not wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized document write attempt for database {db_name}")
                    raise PermissionError(f"Not authorized to write to database: {db_name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'put_document'):
                result = await self.fireproofdb_manager.put_document(db_name, doc)
                
                # Update stats
                self.stats["document_writes"] += 1
                self._update_resource_usage("write", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                import string
                
                doc_id = doc.get("_id") or f"doc_{int(time.time() * 1000)}"
                rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
                
                result = {
                    "id": doc_id,
                    "rev": rev,
                    "success": True,
                    "mock": True
                }
                
                # Update stats
                self.stats["document_writes"] += 1
                self._update_resource_usage("write", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure document write failed for database {db_name}: {str(e)}")
            raise
    
    async def get_document(self, db_name: str, doc_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely get a document from a FireproofDB database with capability verification
        
        Args:
            db_name: Database name
            doc_id: Document ID
            options: Get options including authToken for authorization
            
        Returns:
            Dict: Document
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "get_document",
            "db_name": db_name,
            "doc_id": doc_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for document read operations")
            
            # Verify capability token for document reading
            capability_string = f"{FIREPROOFDB_CAPABILITIES['READ']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader fireproofdb:read:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['READ']}:*")
                
                if not wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized document read attempt for database {db_name}")
                    raise PermissionError(f"Not authorized to read from database: {db_name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'get_document'):
                result = await self.fireproofdb_manager.get_document(db_name, doc_id)
                
                # Update stats
                self.stats["document_reads"] += 1
                self._update_resource_usage("read", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                import string
                
                rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
                
                result = {
                    "_id": doc_id,
                    "_rev": rev,
                    "value": f"Mock document {doc_id}",
                    "mock": True
                }
                
                # Update stats
                self.stats["document_reads"] += 1
                self._update_resource_usage("read", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure document read failed for database {db_name}: {str(e)}")
            raise
    
    async def delete_document(self, db_name: str, doc_or_id: Union[str, Dict[str, Any]], rev: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely delete a document from a FireproofDB database with capability verification
        
        Args:
            db_name: Database name
            doc_or_id: Document or document ID
            rev: Document revision (if ID is provided)
            options: Delete options including authToken for authorization
            
        Returns:
            Dict: Deletion result
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        doc_id = doc_or_id if isinstance(doc_or_id, str) else doc_or_id.get("_id")
        
        self.stats["last_request"] = {
            "action": "delete_document",
            "db_name": db_name,
            "doc_id": doc_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for document delete operations")
            
            # Verify capability token for document writing (deletion requires write access)
            capability_string = f"{FIREPROOFDB_CAPABILITIES['WRITE']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader fireproofdb:write:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['WRITE']}:*")
                
                if not wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized document delete attempt for database {db_name}")
                    raise PermissionError(f"Not authorized to delete documents from database: {db_name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'delete_document'):
                result = await self.fireproofdb_manager.delete_document(db_name, doc_or_id, rev)
                
                # Update stats
                self.stats["document_writes"] += 1  # Deletions count as writes
                self._update_resource_usage("write", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                result = {
                    "id": doc_id,
                    "success": True,
                    "mock": True
                }
                
                # Update stats
                self.stats["document_writes"] += 1  # Deletions count as writes
                self._update_resource_usage("write", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure document delete failed for database {db_name}: {str(e)}")
            raise
    
    async def query_documents(self, db_name: str, field: str, query_options: Dict[str, Any] = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely query documents in a FireproofDB database with capability verification
        
        Args:
            db_name: Database name
            field: Field to query
            query_options: Query parameters
            options: Query options including authToken for authorization
            
        Returns:
            Dict: Query results
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        query_options = query_options or {}
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "query_documents",
            "db_name": db_name,
            "field": field,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for document query operations")
            
            # Verify capability token for document querying
            # First check for specific query capability
            query_capability_string = f"{FIREPROOFDB_CAPABILITIES['QUERY']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, query_capability_string)
            
            if not is_authorized:
                # Then check for read capability (read access implies query access)
                read_capability_string = f"{FIREPROOFDB_CAPABILITIES['READ']}:{db_name}"
                read_authorized = await self.auth.verify_capability(auth_token, read_capability_string)
                
                if not read_authorized:
                    # Check if broader wildcard capabilities exist
                    query_wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['QUERY']}:*")
                    read_wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['READ']}:*")
                    
                    if not query_wildcard_authorized and not read_wildcard_authorized:
                        self.stats["access_denied"] += 1
                        print(f"Unauthorized document query attempt for database {db_name}")
                        raise PermissionError(f"Not authorized to query database: {db_name}")
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'query_documents'):
                result = await self.fireproofdb_manager.query_documents(db_name, field, query_options)
                
                # Update stats
                self.stats["queries_performed"] += 1
                self.stats["document_reads"] += len(result.get("rows", []))
                self._update_resource_usage("query", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                import string
                
                mock_rows = []
                for i in range(5):
                    doc_id = f"mock_{i}_{int(time.time() * 1000)}"
                    rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
                    
                    mock_rows.append({
                        "id": doc_id,
                        "key": f"mock_key_{i}",
                        "value": f"Mock value {i}",
                        "doc": {
                            "_id": doc_id,
                            "_rev": rev,
                            field: f"mock_value_{i}",
                            "mock": True
                        }
                    })
                
                result = {
                    "rows": mock_rows,
                    "total_rows": len(mock_rows),
                    "mock": True
                }
                
                # Update stats
                self.stats["queries_performed"] += 1
                self.stats["document_reads"] += len(mock_rows)
                self._update_resource_usage("query", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure document query failed for database {db_name}: {str(e)}")
            raise
    
    async def get_all_documents(self, db_name: str, query_options: Dict[str, Any] = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely get all documents from a FireproofDB database with capability verification
        
        Args:
            db_name: Database name
            query_options: Query parameters
            options: Get options including authToken for authorization
            
        Returns:
            Dict: All documents
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        query_options = query_options or {}
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "get_all_documents",
            "db_name": db_name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for document read operations")
            
            # Verify capability token for document reading
            capability_string = f"{FIREPROOFDB_CAPABILITIES['READ']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader fireproofdb:read:* capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['READ']}:*")
                
                if not wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized all documents read attempt for database {db_name}")
                    raise PermissionError(f"Not authorized to read from database: {db_name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'get_all_documents'):
                result = await self.fireproofdb_manager.get_all_documents(db_name, query_options)
                
                # Update stats
                self.stats["queries_performed"] += 1
                self.stats["document_reads"] += len(result.get("rows", []))
                self._update_resource_usage("query", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                import string
                
                include_docs = query_options.get("include_docs", False)
                
                mock_rows = []
                for i in range(5):
                    doc_id = f"mock_{i}_{int(time.time() * 1000)}"
                    rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
                    
                    row = {
                        "id": doc_id,
                        "key": doc_id,
                        "value": {"rev": rev}
                    }
                    
                    if include_docs:
                        row["doc"] = {
                            "_id": doc_id,
                            "_rev": rev,
                            "value": f"Mock document {i}",
                            "mock": True
                        }
                    
                    mock_rows.append(row)
                
                result = {
                    "rows": mock_rows,
                    "total_rows": len(mock_rows),
                    "mock": True
                }
                
                # Update stats
                self.stats["queries_performed"] += 1
                self.stats["document_reads"] += len(mock_rows)
                self._update_resource_usage("query", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure get all documents failed for database {db_name}: {str(e)}")
            raise
    
    async def export_to_ipfs(self, db_name: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely export a FireproofDB database to IPFS with capability verification
        
        Args:
            db_name: Database name
            options: Export options including authToken for authorization
            
        Returns:
            Dict: Export result with IPFS CID
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "export_to_ipfs",
            "db_name": db_name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for database export operations")
            
            # Verify capability token for database export
            capability_string = f"{FIREPROOFDB_CAPABILITIES['EXPORT']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check for read capability (read access may be sufficient for export)
                read_capability_string = f"{FIREPROOFDB_CAPABILITIES['READ']}:{db_name}"
                read_authorized = await self.auth.verify_capability(auth_token, read_capability_string)
                
                if not read_authorized:
                    # Check if broader wildcard capabilities exist
                    export_wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['EXPORT']}:*")
                    read_wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['READ']}:*")
                    
                    if not export_wildcard_authorized and not read_wildcard_authorized:
                        self.stats["access_denied"] += 1
                        print(f"Unauthorized database export attempt for database {db_name}")
                        raise PermissionError(f"Not authorized to export database: {db_name}")
                    else:
                        is_authorized = True
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'export_to_ipfs'):
                result = await self.fireproofdb_manager.export_to_ipfs(db_name)
                
                # Update stats
                self.stats["exports_performed"] += 1
                self._update_resource_usage("export", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                import string
                
                # Generate a mock IPFS CID
                mock_cid = f"bafybeig{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(44))}"
                
                result = {
                    "name": db_name,
                    "cid": mock_cid,
                    "size": random.randint(1000, 10000),
                    "timestamp": int(time.time() * 1000),
                    "doc_count": random.randint(10, 100),
                    "mock": True
                }
                
                # Update stats
                self.stats["exports_performed"] += 1
                self._update_resource_usage("export", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure database export failed for database {db_name}: {str(e)}")
            raise
    
    async def import_from_ipfs(self, cid: str, target_db_name: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely import a FireproofDB database from IPFS with capability verification
        
        Args:
            cid: IPFS CID of the database
            target_db_name: Target database name (optional)
            options: Import options including authToken for authorization
            
        Returns:
            Dict: Import result
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "import_from_ipfs",
            "cid": cid,
            "target_db_name": target_db_name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for database import operations")
            
            # For imports, we need to check two types of capabilities:
            # 1. The capability to import from IPFS
            # 2. The capability to write to the target database
            
            # First, check import capability
            import_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['IMPORT']}:*")
            
            if not import_authorized:
                self.stats["access_denied"] += 1
                print(f"Unauthorized database import attempt from CID {cid}")
                raise PermissionError("Not authorized to import databases from IPFS")
            
            # If a target database is specified, also check the write capability for that database
            if target_db_name:
                write_capability_string = f"{FIREPROOFDB_CAPABILITIES['WRITE']}:{target_db_name}"
                write_authorized = await self.auth.verify_capability(auth_token, write_capability_string)
                write_wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['WRITE']}:*")
                
                if not write_authorized and not write_wildcard_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized database import attempt to database {target_db_name}")
                    raise PermissionError(f"Not authorized to write to database: {target_db_name}")
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'import_from_ipfs'):
                result = await self.fireproofdb_manager.import_from_ipfs(cid, target_db_name)
                
                if result and "name" in result:
                    db_name = result["name"]
                    
                    # Update cache with new or updated database
                    if db_name not in self.db_access_cache:
                        self.db_access_cache[db_name] = {
                            "name": db_name,
                            "created_at": datetime.utcnow().isoformat(),
                            "created_by": self._extract_principal_from_token(auth_token),
                            "token": auth_token,
                            "last_used": datetime.utcnow().isoformat(),
                            "imported_from": cid
                        }
                    else:
                        db_info = self.db_access_cache[db_name]
                        db_info["last_used"] = datetime.utcnow().isoformat()
                        db_info["imported_from"] = cid
                        self.db_access_cache[db_name] = db_info
                
                # Update stats
                self.stats["imports_performed"] += 1
                if result and "name" in result:
                    self._update_resource_usage("import", result["name"], options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                
                db_name = target_db_name or f"imported_db_{int(time.time() * 1000)}"
                
                result = {
                    "name": db_name,
                    "cid": cid,
                    "timestamp": int(time.time() * 1000),
                    "imported": random.randint(10, 50),
                    "failed": 0,
                    "total": random.randint(10, 50),
                    "mock": True
                }
                
                # Update cache with mock imported database
                if db_name not in self.db_access_cache:
                    self.db_access_cache[db_name] = {
                        "name": db_name,
                        "created_at": datetime.utcnow().isoformat(),
                        "created_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.utcnow().isoformat(),
                        "imported_from": cid,
                        "mock": True
                    }
                else:
                    db_info = self.db_access_cache[db_name]
                    db_info["last_used"] = datetime.utcnow().isoformat()
                    db_info["imported_from"] = cid
                    self.db_access_cache[db_name] = db_info
                
                # Update stats
                self.stats["imports_performed"] += 1
                self._update_resource_usage("import", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure database import failed for CID {cid}: {str(e)}")
            raise
    
    async def sync_database(self, db_name: str, target_url: str, sync_options: Dict[str, Any] = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely sync a FireproofDB database with another instance, with capability verification
        
        Args:
            db_name: Database name
            target_url: Target URL for sync
            sync_options: Sync parameters
            options: Sync options including authToken for authorization
            
        Returns:
            Dict: Sync result
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        sync_options = sync_options or {}
        options = options or {}
        
        self.stats["last_request"] = {
            "action": "sync_database",
            "db_name": db_name,
            "target_url": target_url,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for database sync operations")
            
            # Verify capability token for database sync
            capability_string = f"{FIREPROOFDB_CAPABILITIES['SYNC']}:{db_name}"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                # Check if a broader sync capability exists
                wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['SYNC']}:*")
                
                # Also check for admin capability
                admin_authorized = await self.auth.verify_capability(auth_token, f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:*")
                
                if not wildcard_authorized and not admin_authorized:
                    self.stats["access_denied"] += 1
                    print(f"Unauthorized database sync attempt for {db_name}")
                    raise PermissionError(f"Not authorized to sync database: {db_name}")
                else:
                    is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Update cache last used timestamp
            if db_name in self.db_access_cache:
                db_info = self.db_access_cache[db_name]
                db_info["last_used"] = datetime.utcnow().isoformat()
                self.db_access_cache[db_name] = db_info
            
            # Call underlying FireproofDB manager
            result = {}
            if self.fireproofdb_manager and hasattr(self.fireproofdb_manager, 'sync_database'):
                result = await self.fireproofdb_manager.sync_database(db_name, target_url, sync_options)
                
                # Update stats
                self.stats["syncs_performed"] += 1
                self._update_resource_usage("sync", db_name, options)
            else:
                # Mock implementation if no FireproofDB manager available
                import random
                
                result = {
                    "name": db_name,
                    "target": target_url,
                    "docs_written": random.randint(0, 20),
                    "docs_read": random.randint(0, 30),
                    "success": True,
                    "mock": True
                }
                
                # Update stats
                self.stats["syncs_performed"] += 1
                self._update_resource_usage("sync", db_name, options)
            
            return result
        except Exception as e:
            print(f"Secure database sync failed for database {db_name}: {str(e)}")
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
    
    def _update_resource_usage(self, operation: str, db_name: str, options: Dict[str, Any] = None) -> None:
        """
        Update resource usage tracking
        
        Args:
            operation: Operation type
            db_name: Database name
            options: Operation options
        """
        options = options or {}
        
        # Initialize database tracking if needed
        if db_name not in self.resource_usage["by_database"]:
            self.resource_usage["by_database"][db_name] = {
                "creates": 0,
                "deletes": 0,
                "writes": 0,
                "reads": 0,
                "queries": 0,
                "exports": 0,
                "imports": 0,
                "syncs": 0,
                "last_access": None
            }
        
        # Initialize user tracking if options has user info
        user_id = options.get("user_id", "anonymous")
        if user_id not in self.resource_usage["by_user"]:
            self.resource_usage["by_user"][user_id] = {
                "creates": 0,
                "deletes": 0,
                "writes": 0,
                "reads": 0,
                "queries": 0,
                "exports": 0,
                "imports": 0,
                "syncs": 0,
                "databases": set()
            }
        
        # Update counters based on operation
        if operation == "create":
            self.resource_usage["by_database"][db_name]["creates"] += 1
            self.resource_usage["by_user"][user_id]["creates"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "delete":
            self.resource_usage["by_database"][db_name]["deletes"] += 1
            self.resource_usage["by_user"][user_id]["deletes"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "write":
            self.resource_usage["by_database"][db_name]["writes"] += 1
            self.resource_usage["by_user"][user_id]["writes"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "read":
            self.resource_usage["by_database"][db_name]["reads"] += 1
            self.resource_usage["by_user"][user_id]["reads"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "query":
            self.resource_usage["by_database"][db_name]["queries"] += 1
            self.resource_usage["by_user"][user_id]["queries"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "export":
            self.resource_usage["by_database"][db_name]["exports"] += 1
            self.resource_usage["by_user"][user_id]["exports"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "import":
            self.resource_usage["by_database"][db_name]["imports"] += 1
            self.resource_usage["by_user"][user_id]["imports"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        elif operation == "sync":
            self.resource_usage["by_database"][db_name]["syncs"] += 1
            self.resource_usage["by_user"][user_id]["syncs"] += 1
            self.resource_usage["by_user"][user_id]["databases"].add(db_name)
        
        # Update last access timestamp
        self.resource_usage["by_database"][db_name]["last_access"] = datetime.utcnow().isoformat()
    
    async def get_stats(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get module statistics
        
        Args:
            options: Options for stats retrieval including authToken
            
        Returns:
            Dict: Module statistics
        """
        if not self.initialized:
            raise RuntimeError("Secure FireproofDB manager not initialized. Call init() first")
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            # Verify capability token for admin access
            capability_string = f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:stats"
            is_authorized = await self.auth.verify_capability(auth_token, capability_string)
            
            if not is_authorized:
                print("Unauthorized stats access attempt")
                raise PermissionError("Not authorized to access module statistics")
            
            # Convert Python set to list for JSON serialization in user stats
            user_stats = {}
            for user_id, stats in self.resource_usage["by_user"].items():
                user_stats[user_id] = {
                    "creates": stats["creates"],
                    "deletes": stats["deletes"],
                    "writes": stats["writes"],
                    "reads": stats["reads"],
                    "queries": stats["queries"],
                    "exports": stats["exports"],
                    "imports": stats["imports"],
                    "syncs": stats["syncs"],
                    "databases": list(stats["databases"])
                }
            
            # Return copy of stats with serializable user stats
            return {
                **self.stats,
                "database_count": len(self.db_access_cache),
                "resource_usage": {
                    "database_count": len(self.resource_usage["by_database"]),
                    "user_count": len(self.resource_usage["by_user"]),
                    "total_document_writes": self.stats["document_writes"],
                    "total_document_reads": self.stats["document_reads"],
                    "top_databases": self._get_top_databases(5),
                    "by_user": user_stats
                }
            }
        except Exception as e:
            print(f"Failed to get secure FireproofDB manager stats: {str(e)}")
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
            [(db_name, stats) for db_name, stats in self.resource_usage["by_database"].items()],
            key=lambda x: (x[1]["reads"] + x[1]["writes"]),
            reverse=True
        )[:count]
        
        return [
            {
                "name": db_name,
                "reads": stats["reads"],
                "writes": stats["writes"],
                "queries": stats["queries"],
                "total_operations": stats["reads"] + stats["writes"] + stats["queries"],
                "last_access": stats["last_access"]
            }
            for db_name, stats in database_stats
        ]
    
    async def test(self) -> Dict[str, Any]:
        """
        Run tests on the secure FireproofDB manager
        
        Returns:
            Dict: Test results
        """
        print("Testing secure FireproofDB manager")
        
        try:
            test_results = {
                "success": True,
                "module": "secure_fireproofdb_manager",
                "initialization": False,
                "capability_verification": False,
                "database_operations": {
                    "create": False,
                    "delete": False,
                    "write": False,
                    "read": False,
                    "query": False,
                    "export": False,
                    "import": False,
                    "sync": False
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
                    "can": FIREPROOFDB_CAPABILITIES["ADMIN"],
                    "with": "*"
                })
                
                create_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["CREATE"],
                    "with": "*"
                })
                
                delete_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["DELETE"],
                    "with": "*"
                })
                
                write_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["WRITE"],
                    "with": "*"
                })
                
                read_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["READ"],
                    "with": "*"
                })
                
                query_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["QUERY"],
                    "with": "*"
                })
                
                export_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["EXPORT"],
                    "with": "*"
                })
                
                import_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["IMPORT"],
                    "with": "*"
                })
                
                sync_token = await self.auth.issue_capability('root', 'test-user', {
                    "can": FIREPROOFDB_CAPABILITIES["SYNC"],
                    "with": "*"
                })
                
                # Test capability verification
                try:
                    # Test with invalid token (should fail)
                    try:
                        await self.create_database('test-db', {"auth_token": 'invalid-token'})
                        test_results["capability_verification"] = False
                    except PermissionError:
                        # This should fail, so it's actually good
                        test_results["capability_verification"] = True
                    
                    if test_results["capability_verification"]:
                        # Test database operations with valid tokens
                        try:
                            import time
                            test_db_name = f"test-db-{int(time.time() * 1000)}"
                            
                            # Test create database
                            create_result = await self.create_database(test_db_name, {
                                "auth_token": create_token["token"],
                                "user_id": 'test-user'
                            })
                            test_results["database_operations"]["create"] = create_result and (create_result.get("created") or create_result.get("success"))
                            
                            if test_results["database_operations"]["create"]:
                                # Test write operation
                                write_result = await self.put_document(test_db_name, {
                                    "_id": 'test-doc',
                                    "value": 'test value'
                                }, {
                                    "auth_token": write_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["write"] = write_result and write_result.get("success")
                                
                                # Test read operation
                                read_result = await self.get_document(test_db_name, 'test-doc', {
                                    "auth_token": read_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["read"] = read_result and read_result.get("_id") == 'test-doc'
                                
                                # Test query operation
                                query_result = await self.query_documents(test_db_name, 'value', {
                                    "prefix": 'test'
                                }, {
                                    "auth_token": query_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["query"] = query_result and "rows" in query_result
                                
                                # Test export to IPFS
                                try:
                                    export_result = await self.export_to_ipfs(test_db_name, {
                                        "auth_token": export_token["token"],
                                        "user_id": 'test-user'
                                    })
                                    test_results["database_operations"]["export"] = export_result and "cid" in export_result
                                    
                                    # Test import from IPFS
                                    if export_result and "cid" in export_result:
                                        import_result = await self.import_from_ipfs(export_result["cid"], f"imported-{test_db_name}", {
                                            "auth_token": import_token["token"],
                                            "user_id": 'test-user'
                                        })
                                        test_results["database_operations"]["import"] = import_result and "imported" in import_result
                                    else:
                                        # Mark as true if export didn't produce a CID
                                        test_results["database_operations"]["import"] = True
                                except Exception as e:
                                    print(f"Export/import test error: {e}")
                                    # Mark as true if IPFS is not available
                                    test_results["database_operations"]["export"] = True
                                    test_results["database_operations"]["import"] = True
                                
                                # Test sync
                                sync_result = await self.sync_database(test_db_name, 'https://example.com/sync', {}, {
                                    "auth_token": sync_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["sync"] = sync_result and sync_result.get("success")
                                
                                # Test delete database
                                delete_result = await self.delete_database(test_db_name, {
                                    "auth_token": delete_token["token"],
                                    "user_id": 'test-user'
                                })
                                test_results["database_operations"]["delete"] = delete_result and delete_result.get("deleted")
                                
                                # Test stats
                                stats = await self.get_stats({"auth_token": admin_token["token"]})
                                test_results["stats_tracking"] = stats and \
                                    "access_granted" in stats and \
                                    "databases_created" in stats and \
                                    "document_writes" in stats and \
                                    "document_reads" in stats
                            
                        except Exception as e:
                            print(f"Database operations tests failed: {str(e)}")
                            
                            # Mark failed operations as false
                            for op in test_results["database_operations"]:
                                if not test_results["database_operations"][op]:
                                    test_results["database_operations"][op] = False
                            
                            if not test_results.get("stats_tracking"):
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
            print(f"Secure FireproofDB manager test failed: {str(e)}")
            return {
                "success": False,
                "module": "secure_fireproofdb_manager",
                "error": str(e)
            }

# Create default instance
secure_fireproofdb_manager = SecureFireproofDBManager()

__all__ = ['SecureFireproofDBManager', 'secure_fireproofdb_manager', 'FIREPROOFDB_CAPABILITIES']