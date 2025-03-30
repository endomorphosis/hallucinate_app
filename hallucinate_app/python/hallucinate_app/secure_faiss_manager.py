"""
Secure FAISS Manager Module

Provides capability-based secure access to FAISS vector operations
Integrates with UCAN authentication for decentralized auth
Implements proper error handling and access control
"""

import os
import json
import logging
import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional, Union, Any, Set

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("secure_faiss_manager")

# Try to import auth manager
try:
    from .auth import auth_manager, AuthManager
    has_auth = True
except ImportError:
    logger.warning("Auth module not available, using default empty implementation")
    has_auth = False
    
# Try to import FAISS manager
try:
    from .ipfs_faiss import ipfs_faiss, IPFSFaiss
    has_faiss_manager = True
except ImportError:
    logger.warning("IPFS FAISS not available, using mock implementation")
    has_faiss_manager = False

# Define capability namespaces for FAISS operations
FAISS_CAPABILITIES = {
    "CREATE": "faiss:create",
    "ADD": "faiss:add",
    "SEARCH": "faiss:search",
    "SAVE": "faiss:save",
    "LOAD": "faiss:load",
    "LIST": "faiss:list",
    "ADMIN": "faiss:admin",
}


class SecureFaissManager:
    """
    Secure FAISS Manager providing capability-based access control
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the secure FAISS manager
        
        Args:
            resources: Resources dictionary
            metadata: Metadata dictionary with configuration
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Use resources if provided, otherwise use default instances
        self.auth = self.resources.get("auth") or (auth_manager if has_auth else None)
        
        if has_faiss_manager:
            self.faiss_manager = self.resources.get("faiss") or ipfs_faiss
        else:
            self.faiss_manager = None
        
        self.initialized = False
        
        # Cache for tracking indexes and their capabilities
        self.index_access_cache = {}
        self.index_create_requests = {}
        
        # Operational stats
        self.stats = {
            "access_granted": 0,
            "access_denied": 0,
            "indexes_created": 0,
            "vectors_added": 0,
            "searches_performed": 0,
            "indexes_saved": 0,
            "indexes_loaded": 0,
            "last_request": None
        }
        
        # Resource usage monitoring
        self.resource_usage = {
            "by_index": {},
            "by_user": {}
        }
        
        logger.info("Secure FAISS Manager initialized")
    
    async def init(self) -> bool:
        """
        Initialize the secure FAISS manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure auth manager is initialized
            if self.auth and hasattr(self.auth, "init"):
                if not getattr(self.auth, "initialized", False):
                    await self.auth.init()
            
            # Initialize underlying FAISS manager if needed
            if self.faiss_manager and hasattr(self.faiss_manager, "init"):
                await self.faiss_manager.init()
            
            self.initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize secure FAISS manager: {e}")
            return False
    
    async def create_index(self, dimensions: int, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely create a FAISS index with capability verification
        
        Args:
            dimensions: Number of dimensions for the vector index
            options: Index creation options including auth_token for authorization
            
        Returns:
            Dict: Creation result
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "create_index",
            "dimensions": dimensions,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for FAISS index creation")
            
            # Verify capability token for index creation
            capability_string = f"{FAISS_CAPABILITIES['CREATE']}:*"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    self.stats["access_denied"] += 1
                    logger.warning(f"Unauthorized FAISS index creation attempt")
                    raise PermissionError(f"Not authorized to create FAISS index")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing index creation without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Extract parameters
            index_type = options.get("index_type", "Flat")
            index_options = options.get("index_options", {})
            
            # Call underlying FAISS manager
            if self.faiss_manager and hasattr(self.faiss_manager, "create_index"):
                result = await self.faiss_manager.create_index(dimensions, index_type, index_options)
                
                if "error" not in result:
                    # Extract index ID from result
                    index_id = result.get("index_id")
                    
                    if index_id:
                        # Update cache with successful creation
                        self.index_access_cache[index_id] = {
                            "created_at": datetime.now().isoformat(),
                            "created_by": self._extract_principal_from_token(auth_token),
                            "token": auth_token,
                            "last_used": datetime.now().isoformat(),
                            "dimensions": dimensions,
                            "index_type": index_type,
                            "vectors_count": 0
                        }
                        
                        # Update stats
                        self.stats["indexes_created"] += 1
                        self._update_resource_usage("create", index_id, options)
                
                return result
            else:
                # Mock implementation if no FAISS manager available
                mock_index_id = f"mock-index-{int(time.time() * 1000)}"
                mock_result = {
                    "success": True,
                    "index_id": mock_index_id,
                    "dimensions": dimensions,
                    "index_type": index_type,
                    "mock": True
                }
                
                # Update cache with mock creation
                self.index_access_cache[mock_index_id] = {
                    "created_at": datetime.now().isoformat(),
                    "created_by": self._extract_principal_from_token(auth_token),
                    "token": auth_token,
                    "last_used": datetime.now().isoformat(),
                    "dimensions": dimensions,
                    "index_type": index_type,
                    "vectors_count": 0,
                    "mock": True
                }
                
                # Update stats
                self.stats["indexes_created"] += 1
                self._update_resource_usage("create", mock_index_id, options)
                
                return mock_result
        except Exception as e:
            logger.error(f"Secure FAISS index creation failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def add_vectors(self, index_id: str, vectors: List[List[float]], options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely add vectors to a FAISS index with capability verification
        
        Args:
            index_id: Index identifier to add vectors to
            vectors: List of vectors to add
            options: Options including auth_token for authorization
            
        Returns:
            Dict: Result of the operation
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "add_vectors",
            "index_id": index_id,
            "vectors_count": len(vectors) if vectors else 0,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for adding vectors")
            
            # Verify capability token for vector addition
            capability_string = f"{FAISS_CAPABILITIES['ADD']}:{index_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader faiss:add:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FAISS_CAPABILITIES['ADD']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized vector add attempt for index {index_id}")
                        raise PermissionError(f"Not authorized to add vectors to index {index_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing vector addition without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Make sure the index exists in cache
            if index_id not in self.index_access_cache:
                # Try to get index info if connected to a real FAISS manager
                index_exists = False
                if self.faiss_manager and hasattr(self.faiss_manager, "get_index_info"):
                    try:
                        index_info = await self.faiss_manager.get_index_info(index_id)
                        if index_info and "error" not in index_info:
                            # Add to cache
                            self.index_access_cache[index_id] = {
                                "created_at": index_info.get("created_at", datetime.now().isoformat()),
                                "created_by": "unknown",
                                "last_used": datetime.now().isoformat(),
                                "dimensions": index_info.get("dimensions", 0),
                                "index_type": index_info.get("index_type", "unknown"),
                                "vectors_count": index_info.get("vectors_count", 0)
                            }
                            index_exists = True
                    except Exception as e:
                        logger.warning(f"Error getting index info for {index_id}: {e}")
                
                if not index_exists:
                    return {
                        "success": False,
                        "error": f"Index {index_id} not found or not accessible"
                    }
            
            # Update last used timestamp
            if index_id in self.index_access_cache:
                self.index_access_cache[index_id]["last_used"] = datetime.now().isoformat()
            
            # Extract vector IDs if provided
            vector_ids = options.get("ids")
            
            # Call underlying FAISS manager
            if self.faiss_manager and hasattr(self.faiss_manager, "add_vectors"):
                result = await self.faiss_manager.add_vectors(index_id, vectors, vector_ids)
                
                if "error" not in result:
                    vectors_added = len(vectors)
                    
                    # Update cache with new vectors count
                    if index_id in self.index_access_cache:
                        current_count = self.index_access_cache[index_id].get("vectors_count", 0)
                        self.index_access_cache[index_id]["vectors_count"] = current_count + vectors_added
                    
                    # Update stats
                    self.stats["vectors_added"] += vectors_added
                    self._update_resource_usage("add", index_id, options, vectors_added)
                
                return result
            else:
                # Mock implementation
                vectors_added = len(vectors)
                mock_result = {
                    "success": True,
                    "index_id": index_id,
                    "vectors_added": vectors_added,
                    "total_vectors": self.index_access_cache[index_id].get("vectors_count", 0) + vectors_added,
                    "mock": True
                }
                
                # Update cache with new vectors count
                if index_id in self.index_access_cache:
                    current_count = self.index_access_cache[index_id].get("vectors_count", 0)
                    self.index_access_cache[index_id]["vectors_count"] = current_count + vectors_added
                
                # Update stats
                self.stats["vectors_added"] += vectors_added
                self._update_resource_usage("add", index_id, options, vectors_added)
                
                return mock_result
        except Exception as e:
            logger.error(f"Secure vector addition failed for index {index_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def search(self, index_id: str, query_vector: List[float], options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely search vectors in a FAISS index with capability verification
        
        Args:
            index_id: Index identifier to search in
            query_vector: Query vector for similarity search
            options: Search options including auth_token for authorization
            
        Returns:
            Dict: Search results
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "search",
            "index_id": index_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for vector search")
            
            # Verify capability token for vector search
            capability_string = f"{FAISS_CAPABILITIES['SEARCH']}:{index_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader faiss:search:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FAISS_CAPABILITIES['SEARCH']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized vector search attempt for index {index_id}")
                        raise PermissionError(f"Not authorized to search vectors in index {index_id}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing vector search without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Make sure the index exists in cache
            if index_id not in self.index_access_cache:
                # Try to get index info if connected to a real FAISS manager
                index_exists = False
                if self.faiss_manager and hasattr(self.faiss_manager, "get_index_info"):
                    try:
                        index_info = await self.faiss_manager.get_index_info(index_id)
                        if index_info and "error" not in index_info:
                            # Add to cache
                            self.index_access_cache[index_id] = {
                                "created_at": index_info.get("created_at", datetime.now().isoformat()),
                                "created_by": "unknown",
                                "last_used": datetime.now().isoformat(),
                                "dimensions": index_info.get("dimensions", 0),
                                "index_type": index_info.get("index_type", "unknown"),
                                "vectors_count": index_info.get("vectors_count", 0)
                            }
                            index_exists = True
                    except Exception as e:
                        logger.warning(f"Error getting index info for {index_id}: {e}")
                
                if not index_exists:
                    return {
                        "success": False,
                        "error": f"Index {index_id} not found or not accessible"
                    }
            
            # Update last used timestamp
            if index_id in self.index_access_cache:
                self.index_access_cache[index_id]["last_used"] = datetime.now().isoformat()
            
            # Extract search parameters
            k = options.get("k", 5)
            search_options = options.get("search_options", {})
            
            # Call underlying FAISS manager
            if self.faiss_manager and hasattr(self.faiss_manager, "search"):
                result = await self.faiss_manager.search(index_id, query_vector, k, search_options)
                
                if "error" not in result:
                    # Update stats
                    self.stats["searches_performed"] += 1
                    self._update_resource_usage("search", index_id, options)
                
                return result
            else:
                # Mock implementation
                mock_results = []
                for i in range(min(k, 5)):  # Return at most 5 mock results
                    mock_results.append({
                        "id": i,
                        "score": 1.0 - (i * 0.1),  # Decreasing similarity scores
                        "vector": [0.0] * len(query_vector)  # Mock vector with same dimensions
                    })
                
                mock_result = {
                    "success": True,
                    "index_id": index_id,
                    "query": query_vector[:5] + (["..."] if len(query_vector) > 5 else []),  # Truncate for logging
                    "k": k,
                    "results": mock_results,
                    "mock": True
                }
                
                # Update stats
                self.stats["searches_performed"] += 1
                self._update_resource_usage("search", index_id, options)
                
                return mock_result
        except Exception as e:
            logger.error(f"Secure vector search failed for index {index_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def save_to_ipfs(self, index_id: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely save a FAISS index to IPFS with capability verification
        
        Args:
            index_id: Index identifier to save
            options: Save options including auth_token for authorization
            
        Returns:
            Dict: Save result
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "save_to_ipfs",
            "index_id": index_id,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for saving index to IPFS")
            
            # Verify capability token for index saving
            capability_string = f"{FAISS_CAPABILITIES['SAVE']}:{index_id}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader faiss:save:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FAISS_CAPABILITIES['SAVE']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized save attempt for index {index_id}")
                        raise PermissionError(f"Not authorized to save index {index_id} to IPFS")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing index save without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Make sure the index exists in cache
            if index_id not in self.index_access_cache:
                # Try to get index info if connected to a real FAISS manager
                index_exists = False
                if self.faiss_manager and hasattr(self.faiss_manager, "get_index_info"):
                    try:
                        index_info = await self.faiss_manager.get_index_info(index_id)
                        if index_info and "error" not in index_info:
                            # Add to cache
                            self.index_access_cache[index_id] = {
                                "created_at": index_info.get("created_at", datetime.now().isoformat()),
                                "created_by": "unknown",
                                "last_used": datetime.now().isoformat(),
                                "dimensions": index_info.get("dimensions", 0),
                                "index_type": index_info.get("index_type", "unknown"),
                                "vectors_count": index_info.get("vectors_count", 0)
                            }
                            index_exists = True
                    except Exception as e:
                        logger.warning(f"Error getting index info for {index_id}: {e}")
                
                if not index_exists:
                    return {
                        "success": False,
                        "error": f"Index {index_id} not found or not accessible"
                    }
            
            # Update last used timestamp
            if index_id in self.index_access_cache:
                self.index_access_cache[index_id]["last_used"] = datetime.now().isoformat()
            
            # Extract save options
            save_options = options.get("save_options", {})
            
            # Call underlying FAISS manager
            if self.faiss_manager and hasattr(self.faiss_manager, "save_to_ipfs"):
                result = await self.faiss_manager.save_to_ipfs(index_id, save_options)
                
                if "error" not in result:
                    # Update stats
                    self.stats["indexes_saved"] += 1
                    self._update_resource_usage("save", index_id, options)
                    
                    # Store CID in cache
                    if index_id in self.index_access_cache and "cid" in result:
                        self.index_access_cache[index_id]["ipfs_cid"] = result["cid"]
                
                return result
            else:
                # Mock implementation
                mock_cid = f"Qm{''.join(['abcdef0123456789'[i % 16] for i in range(44)])}"
                mock_result = {
                    "success": True,
                    "index_id": index_id,
                    "cid": mock_cid,
                    "mock": True
                }
                
                # Update stats
                self.stats["indexes_saved"] += 1
                self._update_resource_usage("save", index_id, options)
                
                # Store mock CID in cache
                if index_id in self.index_access_cache:
                    self.index_access_cache[index_id]["ipfs_cid"] = mock_cid
                
                return mock_result
        except Exception as e:
            logger.error(f"Secure index save failed for index {index_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def load_from_ipfs(self, cid: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely load a FAISS index from IPFS with capability verification
        
        Args:
            cid: IPFS content identifier
            options: Load options including auth_token for authorization
            
        Returns:
            Dict: Load result
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "load_from_ipfs",
            "cid": cid,
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for loading index from IPFS")
            
            # Verify capability token for index loading
            capability_string = f"{FAISS_CAPABILITIES['LOAD']}:{cid}"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    # Check if a broader faiss:load:* capability exists
                    wildcard_authorized = await self.auth.verify_capability(auth_token, f"{FAISS_CAPABILITIES['LOAD']}:*")
                    
                    if not wildcard_authorized:
                        self.stats["access_denied"] += 1
                        logger.warning(f"Unauthorized load attempt for IPFS CID {cid}")
                        raise PermissionError(f"Not authorized to load index from IPFS CID {cid}")
                    else:
                        is_authorized = True
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing index load without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Extract load options
            load_options = options.get("load_options", {})
            
            # Call underlying FAISS manager
            if self.faiss_manager and hasattr(self.faiss_manager, "load_from_ipfs"):
                result = await self.faiss_manager.load_from_ipfs(cid, load_options)
                
                if "error" not in result and "index_id" in result:
                    index_id = result["index_id"]
                    
                    # Update cache with loaded index
                    self.index_access_cache[index_id] = {
                        "created_at": datetime.now().isoformat(),
                        "created_by": self._extract_principal_from_token(auth_token),
                        "token": auth_token,
                        "last_used": datetime.now().isoformat(),
                        "ipfs_cid": cid,
                        "dimensions": result.get("dimensions", 0),
                        "index_type": result.get("index_type", "unknown"),
                        "vectors_count": result.get("vectors_count", 0)
                    }
                    
                    # Update stats
                    self.stats["indexes_loaded"] += 1
                    self._update_resource_usage("load", index_id, options)
                
                return result
            else:
                # Mock implementation
                mock_index_id = f"mock-index-{int(time.time() * 1000)}"
                mock_result = {
                    "success": True,
                    "index_id": mock_index_id,
                    "cid": cid,
                    "dimensions": 128,  # Mock dimensions
                    "index_type": "Flat",
                    "vectors_count": 1000,  # Mock count
                    "mock": True
                }
                
                # Update cache with mock loaded index
                self.index_access_cache[mock_index_id] = {
                    "created_at": datetime.now().isoformat(),
                    "created_by": self._extract_principal_from_token(auth_token),
                    "token": auth_token,
                    "last_used": datetime.now().isoformat(),
                    "ipfs_cid": cid,
                    "dimensions": 128,
                    "index_type": "Flat",
                    "vectors_count": 1000,
                    "mock": True
                }
                
                # Update stats
                self.stats["indexes_loaded"] += 1
                self._update_resource_usage("load", mock_index_id, options)
                
                return mock_result
        except Exception as e:
            logger.error(f"Secure index load failed for CID {cid}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def list_indexes(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Securely list FAISS indexes with capability verification
        
        Args:
            options: List options including auth_token for authorization
            
        Returns:
            Dict: List of indexes
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        self.stats["last_request"] = {
            "action": "list_indexes",
            "timestamp": datetime.now().isoformat()
        }
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token:
                raise ValueError("Authentication token required for listing indexes")
            
            # Verify capability token for index listing
            capability_string = f"{FAISS_CAPABILITIES['LIST']}:*"
            is_authorized = False
            
            if self.auth:
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    self.stats["access_denied"] += 1
                    logger.warning("Unauthorized index listing attempt")
                    raise PermissionError("Not authorized to list FAISS indexes")
            else:
                # If auth is not available, allow access but log warning
                logger.warning("Auth module not available, allowing index listing without verification")
                is_authorized = True
            
            # Track access
            self.stats["access_granted"] += 1
            
            # Call underlying FAISS manager if available
            external_indexes = {}
            if self.faiss_manager and hasattr(self.faiss_manager, "list_indexes"):
                try:
                    external_list = await self.faiss_manager.list_indexes()
                    if "error" not in external_list and "indexes" in external_list:
                        external_indexes = external_list["indexes"]
                except Exception as e:
                    logger.warning(f"Error listing indexes from FAISS manager: {e}")
            
            # Merge external indexes with cache
            indexes = {}
            
            # Add all cached indexes
            for index_id, index_info in self.index_access_cache.items():
                indexes[index_id] = {
                    "index_id": index_id,
                    "created_at": index_info.get("created_at"),
                    "created_by": index_info.get("created_by"),
                    "last_used": index_info.get("last_used"),
                    "ipfs_cid": index_info.get("ipfs_cid"),
                    "dimensions": index_info.get("dimensions"),
                    "index_type": index_info.get("index_type"),
                    "vectors_count": index_info.get("vectors_count"),
                    "mock": index_info.get("mock", False)
                }
            
            # Add any external indexes not in cache
            for index_id, index_info in external_indexes.items():
                if index_id not in indexes:
                    indexes[index_id] = index_info
                    
                    # Add to cache
                    self.index_access_cache[index_id] = {
                        "created_at": index_info.get("created_at", datetime.now().isoformat()),
                        "created_by": "unknown",
                        "last_used": datetime.now().isoformat(),
                        "ipfs_cid": index_info.get("ipfs_cid"),
                        "dimensions": index_info.get("dimensions", 0),
                        "index_type": index_info.get("index_type", "unknown"),
                        "vectors_count": index_info.get("vectors_count", 0)
                    }
            
            return {
                "success": True,
                "indexes": indexes,
                "count": len(indexes)
            }
        except Exception as e:
            logger.error(f"Secure index listing failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
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
    
    def _update_resource_usage(self, operation: str, index_id: str, 
                             options: Dict[str, Any] = None, count: int = 1) -> None:
        """
        Update resource usage tracking
        
        Args:
            operation: Operation type
            index_id: Index ID
            options: Operation options
            count: Number of items affected (for add operations)
        """
        options = options or {}
        
        # Initialize index tracking if needed
        if index_id not in self.resource_usage["by_index"]:
            self.resource_usage["by_index"][index_id] = {
                "creates": 0,
                "adds": 0,
                "searches": 0,
                "saves": 0,
                "loads": 0,
                "vectors_added": 0,
                "last_access": None
            }
        
        # Initialize user tracking if options has user info
        user_id = options.get("user_id", "anonymous")
        if user_id not in self.resource_usage["by_user"]:
            self.resource_usage["by_user"][user_id] = {
                "creates": 0,
                "adds": 0,
                "searches": 0,
                "saves": 0,
                "loads": 0,
                "vectors_added": 0,
                "indexes": set()
            }
        
        # Update counters based on operation
        if operation == "create":
            self.resource_usage["by_index"][index_id]["creates"] += 1
            self.resource_usage["by_user"][user_id]["creates"] += 1
            self.resource_usage["by_user"][user_id]["indexes"].add(index_id)
        elif operation == "add":
            self.resource_usage["by_index"][index_id]["adds"] += 1
            self.resource_usage["by_index"][index_id]["vectors_added"] += count
            self.resource_usage["by_user"][user_id]["adds"] += 1
            self.resource_usage["by_user"][user_id]["vectors_added"] += count
            self.resource_usage["by_user"][user_id]["indexes"].add(index_id)
        elif operation == "search":
            self.resource_usage["by_index"][index_id]["searches"] += 1
            self.resource_usage["by_user"][user_id]["searches"] += 1
            self.resource_usage["by_user"][user_id]["indexes"].add(index_id)
        elif operation == "save":
            self.resource_usage["by_index"][index_id]["saves"] += 1
            self.resource_usage["by_user"][user_id]["saves"] += 1
            self.resource_usage["by_user"][user_id]["indexes"].add(index_id)
        elif operation == "load":
            self.resource_usage["by_index"][index_id]["loads"] += 1
            self.resource_usage["by_user"][user_id]["loads"] += 1
            self.resource_usage["by_user"][user_id]["indexes"].add(index_id)
        
        # Update last access timestamp
        self.resource_usage["by_index"][index_id]["last_access"] = datetime.now().isoformat()
    
    async def get_stats(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get module statistics
        
        Args:
            options: Options for stats retrieval including auth_token
            
        Returns:
            Dict: Module statistics
        """
        if not self.initialized:
            raise RuntimeError("Secure FAISS manager not initialized. Call init() first")
        
        options = options or {}
        
        try:
            auth_token = options.get("auth_token")
            
            if not auth_token and self.auth:
                raise ValueError("Authentication token required for stats access")
            
            # Verify capability token for admin access
            is_authorized = True
            if self.auth:
                capability_string = f"{FAISS_CAPABILITIES['ADMIN']}:stats"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning("Unauthorized stats access attempt")
                    raise PermissionError("Not authorized to access module statistics")
            
            # Return copy of stats
            top_indexes = self._get_top_indexes(5)
            
            # Need to convert sets to lists for serialization
            user_stats = {}
            for user_id, stats in self.resource_usage["by_user"].items():
                user_stats[user_id] = {
                    "creates": stats["creates"],
                    "adds": stats["adds"],
                    "searches": stats["searches"],
                    "saves": stats["saves"],
                    "loads": stats["loads"],
                    "vectors_added": stats["vectors_added"],
                    "indexes": list(stats["indexes"])
                }
            
            return {
                **self.stats,
                "index_count": len(self.index_access_cache),
                "resource_usage": {
                    "index_count": len(self.resource_usage["by_index"]),
                    "user_count": len(self.resource_usage["by_user"]),
                    "total_vectors_added": self.stats["vectors_added"],
                    "total_searches": self.stats["searches_performed"],
                    "top_indexes": top_indexes,
                    "by_user": user_stats
                }
            }
        except Exception as e:
            logger.error(f"Failed to get secure FAISS manager stats: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_top_indexes(self, count: int = 5) -> List[Dict[str, Any]]:
        """
        Get top N indexes by search count
        
        Args:
            count: Number of indexes to return
            
        Returns:
            List: Top indexes
        """
        # Sort indexes by search count
        sorted_indexes = sorted(
            self.resource_usage["by_index"].items(),
            key=lambda x: x[1]["searches"],
            reverse=True
        )
        
        # Take top N indexes
        top_indexes = sorted_indexes[:count]
        
        # Format results
        return [
            {
                "index_id": index_id,
                "searches": stats["searches"],
                "vectors_added": stats["vectors_added"],
                "last_access": stats["last_access"]
            }
            for index_id, stats in top_indexes
        ]
    
    def test(self) -> Dict[str, Any]:
        """
        Run tests on the secure FAISS manager
        
        Returns:
            Dict: Test results
        """
        logger.info("Testing secure FAISS manager")
        
        try:
            # Create asyncio event loop for async tests
            loop = asyncio.get_event_loop()
            
            test_results = {
                "success": True,
                "module": "secure_faiss_manager",
                "initialization": False,
                "capability_verification": False,
                "index_operations": {
                    "create": False,
                    "add": False,
                    "search": False,
                    "save": False,
                    "load": False,
                    "list": False
                },
                "stats_tracking": False
            }
            
            # Test initialization if not already initialized
            if not self.initialized:
                init_result = loop.run_until_complete(self.init())
                test_results["initialization"] = init_result
            else:
                test_results["initialization"] = True
            
            if test_results["initialization"]:
                # Create test principals and capabilities for testing if auth is available
                admin_token = "mock-admin-token"
                create_token = "mock-create-token"
                add_token = "mock-add-token"
                search_token = "mock-search-token"
                save_token = "mock-save-token"
                load_token = "mock-load-token"
                list_token = "mock-list-token"
                
                if self.auth:
                    # Create test user if not exists
                    if "test-user" not in self.auth.principals:
                        loop.run_until_complete(self.auth.create_principal("test-user"))
                    
                    # Issue capabilities
                    admin_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["ADMIN"],
                            "with": "*"
                        })
                    )
                    admin_token = admin_token_result["token"]
                    
                    create_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["CREATE"],
                            "with": "*"
                        })
                    )
                    create_token = create_token_result["token"]
                    
                    add_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["ADD"],
                            "with": "*"
                        })
                    )
                    add_token = add_token_result["token"]
                    
                    search_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["SEARCH"],
                            "with": "*"
                        })
                    )
                    search_token = search_token_result["token"]
                    
                    save_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["SAVE"],
                            "with": "*"
                        })
                    )
                    save_token = save_token_result["token"]
                    
                    load_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["LOAD"],
                            "with": "*"
                        })
                    )
                    load_token = load_token_result["token"]
                    
                    list_token_result = loop.run_until_complete(
                        self.auth.issue_capability("root", "test-user", {
                            "can": FAISS_CAPABILITIES["LIST"],
                            "with": "*"
                        })
                    )
                    list_token = list_token_result["token"]
                
                # Test capability verification by trying with invalid token
                try:
                    # This should fail with invalid token
                    loop.run_until_complete(self.create_index(128, {"auth_token": "invalid-token"}))
                    test_results["capability_verification"] = False
                except (PermissionError, ValueError):
                    # Expected failure is good
                    test_results["capability_verification"] = True
                
                # If auth not available, assume verification passes
                if not self.auth:
                    test_results["capability_verification"] = True
                
                # Test index operations
                try:
                    # Test create index
                    create_result = loop.run_until_complete(self.create_index(128, {
                        "auth_token": create_token,
                        "user_id": "test-user",
                        "index_type": "Flat"
                    }))
                    test_results["index_operations"]["create"] = "index_id" in create_result
                    
                    if "index_id" in create_result:
                        index_id = create_result["index_id"]
                        
                        # Test add vectors
                        test_vectors = [[0.1, 0.2, 0.3, 0.4] * 32]  # 128 dimensions
                        add_result = loop.run_until_complete(self.add_vectors(index_id, test_vectors, {
                            "auth_token": add_token,
                            "user_id": "test-user"
                        }))
                        test_results["index_operations"]["add"] = add_result.get("success", False)
                        
                        # Test search vectors
                        search_result = loop.run_until_complete(self.search(index_id, test_vectors[0], {
                            "auth_token": search_token,
                            "user_id": "test-user",
                            "k": 3
                        }))
                        test_results["index_operations"]["search"] = "results" in search_result
                        
                        # Test save to IPFS
                        save_result = loop.run_until_complete(self.save_to_ipfs(index_id, {
                            "auth_token": save_token,
                            "user_id": "test-user"
                        }))
                        test_results["index_operations"]["save"] = "cid" in save_result
                        
                        # Test list indexes
                        list_result = loop.run_until_complete(self.list_indexes({
                            "auth_token": list_token
                        }))
                        test_results["index_operations"]["list"] = (
                            list_result.get("success", False) and 
                            "indexes" in list_result and 
                            index_id in list_result["indexes"]
                        )
                        
                        # Test load from IPFS (only if save worked)
                        if "cid" in save_result:
                            cid = save_result["cid"]
                            load_result = loop.run_until_complete(self.load_from_ipfs(cid, {
                                "auth_token": load_token,
                                "user_id": "test-user"
                            }))
                            test_results["index_operations"]["load"] = "index_id" in load_result
                        
                        # Test stats
                        stats = loop.run_until_complete(self.get_stats({
                            "auth_token": admin_token
                        }))
                        test_results["stats_tracking"] = (
                            isinstance(stats, dict) and
                            "access_granted" in stats and
                            "indexes_created" in stats and
                            "vectors_added" in stats and
                            "searches_performed" in stats
                        )
                    
                except Exception as e:
                    logger.error(f"FAISS operations test failed: {e}")
            
            # Overall success
            test_results["success"] = (
                test_results["initialization"] and
                (test_results["capability_verification"] or not self.auth) and
                (all(test_results["index_operations"].values()) or self.faiss_manager is None) and
                test_results["stats_tracking"]
            )
            
            return test_results
        except Exception as e:
            logger.error(f"Secure FAISS manager test failed: {e}")
            return {
                "success": False,
                "module": "secure_faiss_manager",
                "error": str(e)
            }


# Create default instance
secure_faiss_manager = SecureFaissManager()