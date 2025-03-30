"""
UCAN Authentication Manager
"""

import os
import json
import time
import logging
import secrets
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple

from .core.principal import Principal
from .core.capability import Capability
from .core.token import Token

# Set up logging
logger = logging.getLogger(__name__)


class AuthManager:
    """
    AuthManager handles UCAN-based authentication and capability management
    
    This class provides:
    - Principal creation and management
    - Capability issuance and verification
    - Token management
    - Delegation chain verification
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None,
                storage_location: Optional[str] = None):
        """
        Initialize the auth manager
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
            storage_location: Path for storing principals and tokens
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.storage_location = storage_location or self.metadata.get("storage_location", 
                                os.path.join(str(Path.home()), '.hallucinate_app', 'auth'))
        
        # Data stores
        self.principals: Dict[str, Principal] = {}
        self.tokens: Dict[str, Dict[str, Any]] = {}
        self.delegations: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
        
        # Track initialization
        self.initialized = False
        
        logger.info(f"AuthManager initialized with storage at {self.storage_location}")
    
    async def init(self) -> bool:
        """
        Initialize the auth manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Create storage directory if needed
            os.makedirs(self.storage_location, exist_ok=True)
            
            # Load existing keys and tokens
            await self._load_state()
            
            # Initialize root principal if none exists
            if "root" not in self.principals:
                await self.create_root_principal()
            
            self.initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize auth manager: {e}")
            return False
    
    async def _load_state(self) -> bool:
        """
        Load stored state (principals, tokens, delegations)
        
        Returns:
            bool: True if loading successful
        """
        try:
            # Load principals
            principals_path = os.path.join(self.storage_location, "principals.json")
            if os.path.exists(principals_path):
                with open(principals_path, 'r') as f:
                    principals_data = json.load(f)
                
                for id, data in principals_data.items():
                    try:
                        self.principals[id] = Principal.from_dict(data)
                    except Exception as e:
                        logger.warning(f"Failed to load principal {id}: {e}")
            
            # Load tokens
            tokens_path = os.path.join(self.storage_location, "tokens.json")
            if os.path.exists(tokens_path):
                with open(tokens_path, 'r') as f:
                    self.tokens = json.load(f)
            
            # Load delegations
            delegations_path = os.path.join(self.storage_location, "delegations.json")
            if os.path.exists(delegations_path):
                with open(delegations_path, 'r') as f:
                    self.delegations = json.load(f)
            
            return True
        except Exception as e:
            logger.error(f"Failed to load auth state: {e}")
            # Initialize with empty state
            self.principals = {}
            self.tokens = {}
            self.delegations = {}
            return False
    
    async def _save_state(self) -> bool:
        """
        Save current state to storage
        
        Returns:
            bool: True if saving successful
        """
        try:
            # Save principals
            principals_data = {}
            for id, principal in self.principals.items():
                try:
                    principals_data[id] = principal.to_dict()
                except Exception as e:
                    logger.warning(f"Failed to serialize principal {id}: {e}")
            
            principals_path = os.path.join(self.storage_location, "principals.json")
            with open(principals_path, 'w') as f:
                json.dump(principals_data, f, indent=2)
            
            # Save tokens
            tokens_path = os.path.join(self.storage_location, "tokens.json")
            with open(tokens_path, 'w') as f:
                json.dump(self.tokens, f, indent=2)
            
            # Save delegations
            delegations_path = os.path.join(self.storage_location, "delegations.json")
            with open(delegations_path, 'w') as f:
                json.dump(self.delegations, f, indent=2)
            
            return True
        except Exception as e:
            logger.error(f"Failed to save auth state: {e}")
            return False
    
    async def create_root_principal(self) -> Principal:
        """
        Create a root principal for this application
        
        Returns:
            Principal: The created principal
        """
        try:
            # Generate a new principal with a key pair
            principal = Principal(metadata={"type": "root", "created_at": time.time()})
            
            # Store the principal
            self.principals["root"] = principal
            
            # Save state
            await self._save_state()
            
            return principal
        except Exception as e:
            logger.error(f"Failed to create root principal: {e}")
            raise
    
    async def create_principal(self, id: str) -> Principal:
        """
        Create a new principal
        
        Args:
            id: Identifier for the principal
        
        Returns:
            Principal: The created principal
        """
        try:
            if id in self.principals:
                return self.principals[id]
            
            # Generate a new principal with a key pair
            principal = Principal(metadata={"id": id, "created_at": time.time()})
            
            # Store the principal
            self.principals[id] = principal
            
            # Save state
            await self._save_state()
            
            return principal
        except Exception as e:
            logger.error(f"Failed to create principal {id}: {e}")
            raise
    
    async def issue_capability(self, issuer_id: str, audience_id: str, 
                              capability: Dict[str, Any], 
                              options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Issue a capability token
        
        Args:
            issuer_id: Principal ID of the issuer
            audience_id: Principal ID of the audience
            capability: Capability details (can, with, limits)
            options: Additional options (expiration, proofs)
        
        Returns:
            dict: The created token
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            options = options or {}
            
            # Ensure principals exist
            if issuer_id not in self.principals:
                raise ValueError(f"Issuer principal {issuer_id} not found")
            
            if audience_id not in self.principals:
                raise ValueError(f"Audience principal {audience_id} not found")
            
            # Get the principals
            issuer = self.principals[issuer_id]
            audience = self.principals[audience_id]
            
            # Create capability object
            cap_obj = Capability(
                action=capability.get("can"),
                resource=capability.get("with"),
                limitations=capability.get("limits")
            )
            
            # Set expiration time
            expiration = options.get("expiration")
            if not expiration:
                # Default: 1 day from now
                expiration = time.time() + 86400
            elif isinstance(expiration, str):
                # Parse ISO string
                from datetime import datetime
                expiration = datetime.fromisoformat(expiration.replace('Z', '+00:00')).timestamp()
            
            # Create token
            token = Token(
                issuer=issuer,
                audience=audience,
                capabilities=[cap_obj],
                expiration=expiration,
                proofs=options.get("proofs"),
                not_before=options.get("not_before"),
                facts=options.get("facts"),
                nonce=options.get("nonce") or secrets.token_hex(8)
            )
            
            # Export token
            token_str = await token.export()
            
            # Store the token
            token_id = f"{issuer_id}->{audience_id}:{capability['can']}/{capability['with']}_{int(time.time())}"            
            token_data = {
                "issuer": issuer_id,
                "audience": audience_id,
                "capability": {
                    "can": capability["can"],
                    "with": capability["with"],
                    "limits": capability.get("limits", {})
                },
                "expiration": expiration,
                "token": token_str
            }
            
            self.tokens[token_id] = token_data
            
            # Update delegations
            if issuer_id not in self.delegations:
                self.delegations[issuer_id] = {}
            if audience_id not in self.delegations[issuer_id]:
                self.delegations[issuer_id][audience_id] = []
            
            self.delegations[issuer_id][audience_id].append({
                "token_id": token_id,
                "capability": {
                    "can": capability["can"],
                    "with": capability["with"],
                    "limits": capability.get("limits", {})
                },
                "expiration": expiration,
                "issued_at": time.time()
            })
            
            # Save state
            await self._save_state()
            
            return token_data
        except Exception as e:
            logger.error(f"Failed to issue capability: {e}")
            raise
    
    async def get_capability_token(self, capability_string: str, 
                                  options: Dict[str, Any] = None) -> str:
        """
        Get a capability token for a specific action
        
        Args:
            capability_string: The capability string (e.g., 'model:load')
            options: Additional options
        
        Returns:
            str: The capability token
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            options = options or {}
            
            # Parse capability string
            parts = capability_string.split(":", 1)
            capability = parts[0]
            resource = parts[1] if len(parts) > 1 else "*"
            
            # Look for existing token
            valid_tokens = []
            current_time = time.time()
            
            for token_id, token in self.tokens.items():
                if (token["capability"]["can"] == capability and
                    (resource == "*" or token["capability"]["with"] == resource) and
                    token["expiration"] > current_time):
                    valid_tokens.append(token)
            
            if valid_tokens:
                # Return the first valid token
                return valid_tokens[0]["token"]
            
            # No valid token found, create a new one
            # For simplicity, we'll issue from root to 'app' principal
            if "app" not in self.principals:
                await self.create_principal("app")
            
            token = await self.issue_capability("root", "app", {
                "can": capability,
                "with": resource,
                "limits": options.get("limits", {})
            }, {
                "expiration": options.get("expiration"),
                "facts": options.get("facts"),
                "not_before": options.get("not_before")
            })
            
            return token["token"]
        except Exception as e:
            logger.error(f"Failed to get capability token for {capability_string}: {e}")
            raise
    
    def get_self_signed_token(self, capability: str) -> str:
        """
        Get a self-signed token with specified capability for internal operations
        
        Args:
            capability: Capability to include in the token
            
        Returns:
            str: The generated token
        """
        try:
            # Generate a self-signed token (simplified for internal operations)
            # This is a special case where we don't use the full UCAN protocol
            token = f"self-signed-{capability}-{secrets.token_hex(8)}-{int(time.time())}"
            return token
        except Exception as e:
            logger.error(f"Failed to generate self-signed token: {e}")
            return f"emergency-token-{capability}"
    
    async def verify_capability(self, token_str: str, capability_string: str) -> bool:
        """
        Verify a capability token
        
        Args:
            token_str: The capability token
            capability_string: The required capability string
        
        Returns:
            bool: True if token is valid and has required capability
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            # Parse capability string
            parts = capability_string.split(":", 1)
            action = parts[0]
            resource = parts[1] if len(parts) > 1 else "*"
            
            # Create capability object
            required_capability = Capability(action=action, resource=resource)
            
            # Import and verify token
            token = await Token.import_token(token_str)
            if not token:
                return False
                
            # Check if token has required capability
            return await token.has_capability(required_capability)
        except Exception as e:
            logger.error(f"Failed to verify capability token for {capability_string}: {e}")
            return False
    
    async def revoke_capability(self, token_id: str) -> bool:
        """
        Revoke a capability token
        
        Args:
            token_id: The token ID to revoke
        
        Returns:
            bool: True if token was revoked
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            if token_id not in self.tokens:
                return False
            
            # Get token details before removing
            token = self.tokens[token_id]
            issuer = token["issuer"]
            audience = token["audience"]
            
            # Remove the token
            del self.tokens[token_id]
            
            # Update delegations
            if issuer in self.delegations and audience in self.delegations[issuer]:
                self.delegations[issuer][audience] = [
                    d for d in self.delegations[issuer][audience] 
                    if d.get("token_id") != token_id
                ]
                
                # Clean up empty arrays
                if not self.delegations[issuer][audience]:
                    del self.delegations[issuer][audience]
                
                if not self.delegations[issuer]:
                    del self.delegations[issuer]
            
            # Save state
            await self._save_state()
            
            return True
        except Exception as e:
            logger.error(f"Failed to revoke capability token {token_id}: {e}")
            return False
    
    async def get_delegations(self, issuer_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all delegations issued by a principal
        
        Args:
            issuer_id: The principal ID of the issuer
        
        Returns:
            dict: Delegations issued by the principal
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            return self.delegations.get(issuer_id, {})
        except Exception as e:
            logger.error(f"Failed to get delegations for {issuer_id}: {e}")
            return {}
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            dict: Test results
        """
        logger.info("Testing auth module")
        
        try:
            test_results = {
                "success": True,
                "module": "auth",
                "initialization": False,
                "principal_creation": False,
                "capability_issuance": False,
                "capability_verification": False,
                "capability_revocation": False,
                "capability": {
                    "ucan_available": True
                },
                "implementation": {
                    "module": "ucan_auth_py",
                    "type": "direct",
                    "version": __import__("ucan_auth_py").__version__
                }
            }
            
            # Test initialization
            if not self.initialized:
                init_result = await self.init()
                test_results["initialization"] = init_result
            else:
                test_results["initialization"] = True
            
            if test_results["initialization"]:
                # Test principal creation
                test_principal_id = f"test-principal-{int(time.time())}"
                principal = await self.create_principal(test_principal_id)
                test_results["principal_creation"] = bool(principal) and hasattr(principal, "did")
                
                if test_results["principal_creation"]:
                    # Test capability issuance
                    test_capability = {
                        "can": "test",
                        "with": f"resource-{int(time.time())}"
                    }
                    
                    token = await self.issue_capability("root", test_principal_id, test_capability)
                    test_results["capability_issuance"] = bool(token) and "token" in token
                    
                    if test_results["capability_issuance"]:
                        # Test capability verification
                        verify_result = await self.verify_capability(
                            token["token"],
                            f"{test_capability['can']}:{test_capability['with']}"
                        )
                        test_results["capability_verification"] = verify_result is True
                        
                        # Test capability revocation
                        token_id = None
                        for tid, t in self.tokens.items():
                            if t["token"] == token["token"]:
                                token_id = tid
                                break
                        
                        if token_id:
                            revoke_result = await self.revoke_capability(token_id)
                            test_results["capability_revocation"] = revoke_result is True
            
            # Overall success
            test_results["success"] = (
                test_results["initialization"] and 
                test_results["principal_creation"] and
                test_results["capability_issuance"] and
                test_results["capability_verification"] and
                test_results["capability_revocation"]
            )
            
            return test_results
        except Exception as e:
            logger.error(f"Auth test failed: {e}")
            return {
                "success": False,
                "module": "auth",
                "error": str(e),
                "implementation": {
                    "module": "ucan_auth_py",
                    "type": "failed"
                }
            }
