"""
UCAN Authentication Integration Layer

This module serves as an integration layer for the UCAN authentication functionality
provided by the ucan_auth_py package from PyPI. It does not implement any core functionality
itself but provides standardized testing and access to the external module implementations.

The module's responsibility is to:
1. Import and provide access to UCAN auth from ucan_auth_py
2. Run comprehensive tests to ensure the auth functionality works
3. Integrate the auth module with the resource pool
4. Provide a unified interface for other components to use UCAN authentication
"""

import os
import json
import time
import logging
import secrets
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple

# Set up logging
logger = logging.getLogger(__name__)

# Try to import UCAN authentication from ucan_auth_py
HAS_UCAN_AUTH = False
try:
    # First try site-packages
    import ucan_auth_py
    from ucan_auth_py import AuthManager as UCANAuthManager
    from ucan_auth_py.core import Principal, Capability, Token
    HAS_UCAN_AUTH = True
    logger.info("UCAN Auth library loaded successfully from site-packages")
except ImportError:
    # Then try direct import from project
    try:
        import sys
        import os
        # Add ucan_auth_py parent directory to path
        ucan_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'ucan_auth_py')
        if ucan_path not in sys.path:
            sys.path.append(ucan_path)
        
        import ucan_auth_py
        from ucan_auth_py import AuthManager as UCANAuthManager
        from ucan_auth_py.core import Principal, Capability, Token
        HAS_UCAN_AUTH = True
        logger.info("UCAN Auth library loaded successfully from local directory")
    except ImportError as e:
        logger.warning(f"ucan_auth_py package not available, falling back to mock implementation: {e}")
        logger.warning("To enable UCAN support, install: pip install -e /path/to/ucan_auth_py")

# For backwards compatibility with existing code
# Try to import UCAN libraries directly (deprecated approach)
HAS_UCAN_LIBS = False
try:
    import ucans
    import ucans.core
    import ucans.crypto
    from ucans import builder, validator
    HAS_UCAN_LIBS = True
    logger.info("UCAN libraries loaded successfully (deprecated direct import)")
except ImportError:
    logger.debug("Direct UCAN libraries not available (this is normal when using ucan_auth_py)")
    pass


class MockUcanPrincipal:
    """Mock implementation for when UCAN libraries are not available"""
    
    def __init__(self, did: str, signer: Dict[str, Any] = None):
        self.did = did
        self.signer = signer or {}
        
    async def sign(self, data: bytes) -> str:
        """Mock signature generation"""
        return f"mock_signature_{int(time.time())}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        return {
            "did": self.did,
            "mock": True
        }


class MockUcanCapability:
    """Mock capability representation"""
    
    def __init__(self, capability: str, resource: str, limitations: Dict[str, Any] = None):
        self.can = capability
        self.with_resource = resource  # 'with' is reserved in Python
        self.limits = limitations or {}
        
    def __str__(self) -> str:
        return f"{self.can}/{self.with_resource}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        return {
            "can": self.can,
            "with": self.with_resource,
            "limits": self.limits
        }


class MockUcanToken:
    """Mock token representation"""
    
    def __init__(self, issuer: MockUcanPrincipal, audience: MockUcanPrincipal, 
                 capabilities: List[MockUcanCapability], expiration: float, 
                 proofs: List[str] = None):
        self.issuer = issuer
        self.audience = audience
        self.capabilities = capabilities
        self.expiration = expiration
        self.proofs = proofs or []
        self.signature = f"mock_token_signature_{int(time.time())}"
        
    def export(self) -> str:
        """Export token as string"""
        return f"mock_ucan_token_{int(time.time())}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        return {
            "issuer": self.issuer.did,
            "audience": self.audience.did,
            "capabilities": [cap.to_dict() for cap in self.capabilities],
            "expiration": self.expiration,
            "proofs": self.proofs,
            "signature": self.signature
        }


class AuthManager:
    """
    AuthManager serves as an integration layer for the ucan_auth_py package.
    
    This class provides UCAN-based authentication and capability verification
    by forwarding calls to the ucan_auth_py implementation (when available) or
    falling back to a mock implementation if the package is not installed.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the auth manager
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.options = {
            "storage_location": self.metadata.get("storage_location", 
                                os.path.join(str(Path.home()), '.hallucinate_app', 'auth')),
            "use_mock_implementation": self.metadata.get("use_mock_implementation", not HAS_UCAN_AUTH)
        }
        
        # Initialize the core implementation
        if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
            # Use the actual ucan_auth_py implementation
            self.auth_impl = UCANAuthManager(
                storage_location=self.options["storage_location"],
                resources=self.resources,
                metadata=self.metadata
            )
            logger.info("Using ucan_auth_py implementation for UCAN authentication")
        else:
            # We'll use the mock implementation
            # Keep this for backward compatibility and testing purposes
            logger.info("Using mock implementation for UCAN authentication")
            # Store for principals, tokens, and delegations
            self.principals: Dict[str, Any] = {}
            self.tokens: Dict[str, Any] = {}
            self.delegations: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
        
        # Track initialization
        self.initialized = False
        
        logger.info(f"AuthManager initialized with storage at {self.options['storage_location']}")
    
    async def init(self) -> bool:
        """
        Initialize the auth manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Initialize the ucan_auth_py implementation
                self.initialized = await self.auth_impl.init()
                return self.initialized
            else:
                # Use the mock implementation
                # Create storage directory if needed
                os.makedirs(self.options["storage_location"], exist_ok=True)
                
                # Load existing keys and tokens
                await self._load_state()
                
                # Initialize root principal if none exists
                if len(self.principals) == 0:
                    await self.create_root_principal()
                
                self.initialized = True
                return True
        except Exception as e:
            logger.error(f"Failed to initialize auth manager: {e}")
            return False
    
    async def _load_state(self) -> bool:
        """
        Load stored state (principals, tokens, delegations) for mock implementation
        
        Returns:
            bool: True if loading successful
        """
        try:
            # Only used by the mock implementation
            # Load principals
            principals_path = os.path.join(self.options["storage_location"], "principals.json")
            if os.path.exists(principals_path):
                with open(principals_path, 'r') as f:
                    principals_data = json.load(f)
                
                for id, data in principals_data.items():
                    # Recreate principals from stored data
                    self.principals[id] = MockUcanPrincipal(data.get("did", f"did:key:{id}"))
            
            # Load tokens
            tokens_path = os.path.join(self.options["storage_location"], "tokens.json")
            if os.path.exists(tokens_path):
                with open(tokens_path, 'r') as f:
                    self.tokens = json.load(f)
            
            # Load delegations
            delegations_path = os.path.join(self.options["storage_location"], "delegations.json")
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
        Save current state to storage for mock implementation
        
        Returns:
            bool: True if saving successful
        """
        try:
            # Only used by the mock implementation
            # Save principals (serialize as needed)
            principals_data = {}
            for id, principal in self.principals.items():
                # Convert principals to serializable form
                if hasattr(principal, 'to_dict'):
                    principals_data[id] = principal.to_dict()
                else:
                    principals_data[id] = {
                        "did": getattr(principal, "did", f"did:key:{id}"),
                        "mock": True
                    }
            
            principals_path = os.path.join(self.options["storage_location"], "principals.json")
            with open(principals_path, 'w') as f:
                json.dump(principals_data, f, indent=2)
            
            # Save tokens
            tokens_path = os.path.join(self.options["storage_location"], "tokens.json")
            with open(tokens_path, 'w') as f:
                json.dump(self.tokens, f, indent=2)
            
            # Save delegations
            delegations_path = os.path.join(self.options["storage_location"], "delegations.json")
            with open(delegations_path, 'w') as f:
                json.dump(self.delegations, f, indent=2)
            
            return True
        except Exception as e:
            logger.error(f"Failed to save auth state: {e}")
            return False
    
    async def create_root_principal(self) -> Any:
        """
        Create a root principal for this application
        
        Returns:
            Principal: The created principal
        """
        try:
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.create_root_principal()
            else:
                # Use the mock implementation
                # Generate a mock DID
                did = f"did:key:mock_{secrets.token_hex(16)}"
                signer = {
                    "id": secrets.token_hex(32),
                    "sign": lambda data: f"mock_signature_{int(time.time())}"
                }
                
                self.principals["root"] = MockUcanPrincipal(did, signer)
                
                # Save state
                await self._save_state()
                
                return self.principals["root"]
        except Exception as e:
            logger.error(f"Failed to create root principal: {e}")
            raise
    
    async def create_principal(self, id: str) -> Any:
        """
        Create a new principal
        
        Args:
            id (str): Identifier for the principal
        
        Returns:
            Principal: The created principal
        """
        try:
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.create_principal(id)
            else:
                # Use the mock implementation
                if id in self.principals:
                    return self.principals[id]
                
                # Generate a mock DID
                did = f"did:key:{id}_{secrets.token_hex(16)}"
                signer = {
                    "id": secrets.token_hex(32),
                    "sign": lambda data: f"mock_signature_{int(time.time())}"
                }
                
                self.principals[id] = MockUcanPrincipal(did, signer)
                
                # Save state
                await self._save_state()
                
                return self.principals[id]
        except Exception as e:
            logger.error(f"Failed to create principal {id}: {e}")
            raise
    
    async def issue_capability(self, issuer_id: str, audience_id: str, 
                              capability: Dict[str, Any], 
                              options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Issue a capability token
        
        Args:
            issuer_id (str): Principal ID of the issuer
            audience_id (str): Principal ID of the audience
            capability (dict): Capability details (can, with, limits)
            options (dict, optional): Additional options (expiration, proofs)
        
        Returns:
            dict: The created token
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.issue_capability(
                    issuer_id, audience_id, capability, options
                )
            else:
                # Use the mock implementation
                options = options or {}
                
                # Ensure principals exist
                if issuer_id not in self.principals:
                    raise ValueError(f"Issuer principal {issuer_id} not found")
                
                if audience_id not in self.principals:
                    raise ValueError(f"Audience principal {audience_id} not found")
                
                # Get the principals
                issuer = self.principals[issuer_id]
                audience = self.principals[audience_id]
                
                # Create a mock capability
                mock_capability = MockUcanCapability(
                    capability.get("can"),
                    capability.get("with"),
                    capability.get("limits")
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
                
                # Create a mock token
                token = MockUcanToken(
                    issuer,
                    audience,
                    [mock_capability],
                    expiration,
                    options.get("proofs", [])
                )
                
                # Store the token
                token_id = f"{issuer_id}->{audience_id}:{capability['can']}/{capability['with']}"
                self.tokens[token_id] = {
                    "issuer": issuer_id,
                    "audience": audience_id,
                    "capability": {
                        "can": capability["can"],
                        "with": capability["with"],
                        "limits": capability.get("limits", {})
                    },
                    "expiration": expiration,
                    "token": token.export()
                }
                
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
                
                return self.tokens[token_id]
        except Exception as e:
            logger.error(f"Failed to issue capability: {e}")
            raise
    
    async def get_capability_token(self, capability_string: str, 
                                  options: Dict[str, Any] = None) -> str:
        """
        Get a capability token for a specific action
        
        Args:
            capability_string (str): The capability string (e.g., 'model:load')
            options (dict, optional): Additional options
        
        Returns:
            str: The capability token
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.get_capability_token(capability_string, options)
            else:
                # Use the mock implementation
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
                    "expiration": options.get("expiration")
                })
                
                return token["token"]
        except Exception as e:
            logger.error(f"Failed to get capability token for {capability_string}: {e}")
            raise
    
    def get_self_signed_token(self, capability: str) -> str:
        """
        Get a self-signed token with specified capability for internal operations
        
        Args:
            capability (str): Capability to include in the token
            
        Returns:
            str: The generated token
        """
        try:
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return self.auth_impl.get_self_signed_token(capability)
            else:
                # Use the mock implementation
                # Generate a mock token
                token = f"self-signed-mock-{capability}-{int(time.time())}"
                return token
        except Exception as e:
            logger.error(f"Failed to generate self-signed token: {e}")
            return f"emergency-token-{capability}"
    
    async def verify_capability(self, token: str, capability_string: str) -> bool:
        """
        Verify a capability token
        
        Args:
            token (str): The capability token
            capability_string (str): The required capability string
        
        Returns:
            bool: True if token is valid and has required capability
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.verify_capability(token, capability_string)
            else:
                # Use the mock implementation
                # For mock implementation, just check if token exists and is valid
                token_entry = None
                for t in self.tokens.values():
                    if t["token"] == token:
                        token_entry = t
                        break
                
                if not token_entry:
                    return False
                
                # Check expiration
                if token_entry["expiration"] <= time.time():
                    return False
                
                # Parse capability string
                parts = capability_string.split(":", 1)
                capability = parts[0]
                resource = parts[1] if len(parts) > 1 else None
                
                # Check if token has required capability
                return (token_entry["capability"]["can"] == capability and 
                        (not resource or token_entry["capability"]["with"] == resource))
        except Exception as e:
            logger.error(f"Failed to verify capability token for {capability_string}: {e}")
            return False
    
    async def revoke_capability(self, token_id: str) -> bool:
        """
        Revoke a capability token
        
        Args:
            token_id (str): The token ID to revoke
        
        Returns:
            bool: True if token was revoked
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.revoke_capability(token_id)
            else:
                # Use the mock implementation
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
            issuer_id (str): The principal ID of the issuer
        
        Returns:
            dict: Delegations issued by the principal
        """
        try:
            if not self.initialized:
                raise ValueError("AuthManager not initialized. Call init() first")
            
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation
                return await self.auth_impl.get_delegations(issuer_id)
            else:
                # Use the mock implementation
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
            if not self.options["use_mock_implementation"] and HAS_UCAN_AUTH:
                # Use the actual implementation but add integration info
                test_results = await self.auth_impl.test()
                test_results["integration"] = {
                    "module": "auth",
                    "package": "ucan_auth_py",
                    "integration_type": "wrapper",
                    "direct_implementation": False
                }
                return test_results
            else:
                # Use the mock implementation
                test_results = {
                    "success": True,
                    "module": "auth",
                    "initialization": False,
                    "principal_creation": False,
                    "capability_issuance": False,
                    "capability_verification": False,
                    "capability_revocation": False,
                    "capability": {
                        "ucan_available": not self.options["use_mock_implementation"]
                    },
                    "integration": {
                        "module": "auth",
                        "package": "ucan_auth_py",
                        "integration_type": "mock",
                        "direct_implementation": True,
                        "note": "Using mock implementation because ucan_auth_py is not available"
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
                "integration": {
                    "module": "auth",
                    "package": "ucan_auth_py",
                    "integration_type": "failed"
                }
            }


# Create default instance
auth_manager = AuthManager()

# For API compatibility with JS version
def get_auth_manager():
    return auth_manager