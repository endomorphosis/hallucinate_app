"""
Auth and Keystore Integration Module

This module serves as an integration layer for the auth_keystore_py package from PyPI.
The auth_keystore_py package provides capability-based access control for API keys,
integrating UCAN-based authentication with encrypted keystore functionality.

The module's responsibility is to:
1. Import and provide access to auth_keystore integration from auth_keystore_py
2. Run comprehensive tests to ensure the integration functionality works
3. Integrate the auth and keystore modules with the resource pool
4. Provide a unified interface for other components to use UCAN-based API key management
"""

import os
import json
import time
import logging
from typing import Dict, List, Any, Optional, Union

from .auth import auth_manager
from .keystore import keystore

# Set up logging
logger = logging.getLogger(__name__)

# Try to import auth_keystore integration from auth_keystore_py
HAS_AUTH_KEYSTORE_PY = False
try:
    import auth_keystore_py
    from auth_keystore_py import AuthKeystoreManager
    HAS_AUTH_KEYSTORE_PY = True
    logger.info("Auth-Keystore integration library loaded successfully")
except ImportError:
    logger.warning("auth_keystore_py package not available, falling back to local implementation")
    logger.warning("To enable full auth-keystore integration support, install: pip install auth_keystore_py")


class AuthKeystoreIntegration:
    """
    Auth-Keystore integration layer for secure API key management with capability-based access.
    
    This class serves as an integration layer for the auth_keystore_py package,
    providing capability-based access control for API keys. If the auth_keystore_py 
    package is not available, it falls back to a local implementation.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Create a new AuthKeystoreIntegration instance
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Get resources from the resource pool
        self.auth = self.resources.get("auth", auth_manager)
        self.keystore = self.resources.get("keystore", keystore)
        
        # Check if we should use the external implementation
        self.use_external_implementation = self.metadata.get("use_external_implementation", HAS_AUTH_KEYSTORE_PY)
        
        # Constants for capability namespaces (used by local implementation)
        self.CAPABILITIES = {
            "KEY_ACCESS": "key:access",
            "KEY_MANAGE": "key:manage",
            "KEY_ROTATE": "key:rotate",
            "KEY_LIST": "key:list"
        }
        
        if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
            # Use the external implementation
            logger.info("Using auth_keystore_py implementation")
            # Initialize the external implementation
            self.auth_keystore_impl = AuthKeystoreManager(
                auth_manager=self.auth,
                keystore=self.keystore,
                resources=self.resources,
                metadata=self.metadata
            )
        else:
            # Using local implementation
            logger.info("Using local auth-keystore integration implementation")
        
        self.initialized = False
        
        logger.info("AuthKeystoreIntegration initialized")
    
    async def init(self) -> bool:
        """
        Initialize the integration module
        
        Returns:
            bool: True if initialization successful
        """
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                self.initialized = await self.auth_keystore_impl.init()
                return self.initialized
            else:
                # Use the local implementation
                # Ensure auth manager is initialized
                if not self.auth.initialized:
                    await self.auth.init()
                
                # Ensure keystore is initialized
                if not self.keystore.initialized:
                    await self.keystore.init()
                
                self.initialized = True
                return True
        except Exception as e:
            logger.exception(f"Failed to initialize auth/keystore integration: {e}")
            return False
    
    async def get_authorized_key(self, provider: str, auth_token: str) -> Optional[str]:
        """
        Get an API key with capability verification
        
        Args:
            provider: Service provider to get key for
            auth_token: UCAN capability token
        
        Returns:
            str: API key if authorized, None if unauthorized or provider not found.
        
        Raises:
            ValueError: If the integration module is not initialized
            Exception: Re-raises any unexpected runtime error after logging it, so
                callers can distinguish a genuine authorization denial (``None``) from
                an unexpected backend failure.
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.get_authorized_key(provider, auth_token)
            else:
                # Use the local implementation
                # Verify capability token for key access
                capability_string = f"{self.CAPABILITIES['KEY_ACCESS']}:{provider}"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning(f"Unauthorized key access attempt for {provider}")
                    return None
                
                # Get the key from keystore
                return await self.keystore.get_key(provider)
        except Exception as e:
            logger.exception(f"Failed to get authorized key for {provider}: {e}")
            raise
    
    async def set_authorized_key(self, provider: str, key: str, auth_token: str, 
                                options: Dict[str, Any] = None) -> bool:
        """
        Set an API key with capability verification
        
        Args:
            provider: Service provider
            key: API key to store
            auth_token: UCAN capability token
            options: Additional options
        
        Returns:
            bool: True if key was stored successfully
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.set_authorized_key(provider, key, auth_token, options)
            else:
                # Use the local implementation
                # Verify capability token for key management
                capability_string = f"{self.CAPABILITIES['KEY_MANAGE']}:{provider}"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning(f"Unauthorized key management attempt for {provider}")
                    return False
                
                # Set the key in keystore
                return await self.keystore.set_key(provider, key, options)
        except Exception as e:
            logger.exception(f"Failed to set authorized key for {provider}: {e}")
            return False
    
    async def delete_authorized_key(self, provider: str, auth_token: str) -> bool:
        """
        Delete an API key with capability verification
        
        Args:
            provider: Service provider
            auth_token: UCAN capability token
        
        Returns:
            bool: True if key was deleted successfully
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.delete_authorized_key(provider, auth_token)
            else:
                # Use the local implementation
                # Verify capability token for key management
                capability_string = f"{self.CAPABILITIES['KEY_MANAGE']}:{provider}"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning(f"Unauthorized key deletion attempt for {provider}")
                    return False
                
                # Delete the key from keystore
                return await self.keystore.delete_key(provider)
        except Exception as e:
            logger.exception(f"Failed to delete authorized key for {provider}: {e}")
            return False
    
    async def list_authorized_providers(self, auth_token: str) -> Optional[List[str]]:
        """
        List available API key providers with capability verification
        
        Args:
            auth_token: UCAN capability token
        
        Returns:
            list: Array of provider names if authorized, None if authorization denied.
        
        Raises:
            Exception: Re-raises any unexpected runtime error after logging it, so
                callers can distinguish a genuine authorization denial (``None``) from
                an unexpected backend failure.
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.list_authorized_providers(auth_token)
            else:
                # Use the local implementation
                # Verify capability token for key listing
                capability_string = f"{self.CAPABILITIES['KEY_LIST']}:*"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning("Unauthorized key listing attempt")
                    return None
                
                # Get providers from keystore
                return await self.keystore.list_providers()
        except Exception as e:
            logger.exception(f"Failed to list authorized providers: {e}")
            raise
    
    async def get_authorized_key_info(self, provider: str, auth_token: str) -> Optional[Dict[str, Any]]:
        """
        Get API key information with capability verification
        
        Args:
            provider: Service provider
            auth_token: UCAN capability token
        
        Returns:
            dict: Key information if authorized, None if unauthorized or provider not found
        
        Raises:
            ValueError: If the integration module is not initialized
            Exception: Re-raises unexpected errors so callers can distinguish internal
                       failures from intentional None (unauthorized / not found)
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.get_authorized_key_info(provider, auth_token)
            else:
                # Use the local implementation
                # Verify capability token for key listing
                capability_string = f"{self.CAPABILITIES['KEY_LIST']}:{provider}"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning(f"Unauthorized key info access attempt for {provider}")
                    return None
                
                # Get key info from keystore
                return await self.keystore.get_key_info(provider)
        except Exception:
            logger.exception(f"Failed to get authorized key info for {provider}")
            raise
    
    async def rotate_authorized_key(self, provider: str, new_key: str, auth_token: str,
                                   options: Dict[str, Any] = None) -> bool:
        """
        Rotate an API key with capability verification
        
        Args:
            provider: Service provider
            new_key: New API key
            auth_token: UCAN capability token
            options: Additional options
        
        Returns:
            bool: True if key was rotated successfully
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.rotate_authorized_key(provider, new_key, auth_token, options)
            else:
                # Use the local implementation
                # Verify capability token for key rotation
                capability_string = f"{self.CAPABILITIES['KEY_ROTATE']}:{provider}"
                is_authorized = await self.auth.verify_capability(auth_token, capability_string)
                
                if not is_authorized:
                    logger.warning(f"Unauthorized key rotation attempt for {provider}")
                    return False
                
                # Rotate the key in keystore
                return await self.keystore.rotate_key(provider, new_key, options)
        except Exception as e:
            logger.exception(f"Failed to rotate authorized key for {provider}: {e}")
            return False
    
    async def issue_key_access_capability(self, provider_id: str, principal_id: str, 
                                        admin_auth_token: str) -> Optional[Dict[str, Any]]:
        """
        Issue API key access capability to a principal
        
        Args:
            provider_id: The provider to issue access for
            principal_id: The principal to grant access to
            admin_auth_token: Admin capability token
        
        Returns:
            dict: The issued capability token, None if not authorized

        Raises:
            ValueError: If the module has not been initialized.
            Exception: Propagates any unexpected error from the auth backend after logging it.
        """
        if not self.initialized:
            raise ValueError("Integration module not initialized. Call init() first")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation
                return await self.auth_keystore_impl.issue_key_access_capability(
                    provider_id, principal_id, admin_auth_token
                )
            else:
                # Use the local implementation
                # Verify admin has management capability for provider
                admin_capability = f"{self.CAPABILITIES['KEY_MANAGE']}:{provider_id}"
                is_authorized = await self.auth.verify_capability(admin_auth_token, admin_capability)
                
                if not is_authorized:
                    logger.warning(f"Unauthorized capability issuance attempt for {provider_id}")
                    return None
                
                # Issue key access capability to principal
                return await self.auth.issue_capability("root", principal_id, {
                    "can": self.CAPABILITIES["KEY_ACCESS"],
                    "with": provider_id
                })
        except Exception as e:
            logger.exception(f"Failed to issue key access capability for {provider_id}: {e}")
            raise
    
    async def test(self) -> Dict[str, Any]:
        """
        Run test method
        
        Returns:
            dict: Test results
        """
        logger.info("Testing auth/keystore integration module")
        
        try:
            if self.use_external_implementation and HAS_AUTH_KEYSTORE_PY:
                # Use the external implementation but add integration info
                test_results = await self.auth_keystore_impl.test()
                test_results["integration"] = {
                    "module": "auth_keystore_integration",
                    "package": "auth_keystore_py",
                    "integration_type": "wrapper",
                    "direct_implementation": False
                }
                return test_results
            else:
                # Use the local implementation
                test_results = {
                    "success": True,
                    "module": "auth_keystore_integration",
                    "initialization": False,
                    "capabilities": False,
                    "authorized_operations": {
                        "get_key": False,
                        "set_key": False,
                        "delete_key": False,
                        "list_providers": False,
                        "get_info": False,
                        "rotate_key": False,
                        "issue_capability": False
                    },
                    "integration": {
                        "module": "auth_keystore_integration",
                        "package": "auth_keystore_py",
                        "integration_type": "mock",
                        "direct_implementation": True,
                        "note": "Using local implementation because auth_keystore_py is not available"
                    }
                }
                
                # Test initialization if not already initialized
                if not self.initialized:
                    init_result = await self.init()
                    test_results["initialization"] = init_result
                else:
                    test_results["initialization"] = True
                
                if test_results["initialization"]:
                    # Create a test principal
                    await self.auth.create_principal("test-user")
                    
                    # Issue admin capabilities to test user
                    admin_token = await self.auth.issue_capability("root", "test-user", {
                        "can": self.CAPABILITIES["KEY_MANAGE"],
                        "with": "*"
                    })
                    
                    # Verify admin token is valid
                    is_admin = await self.auth.verify_capability(
                        admin_token["token"],
                        f"{self.CAPABILITIES['KEY_MANAGE']}:*"
                    )
                    
                    test_results["capabilities"] = is_admin
                    
                    if is_admin:
                        # Test setting a key
                        test_provider = f"test_provider_{int(time.time())}"
                        test_key = f"test_api_key_{int(time.time())}"
                        
                        set_result = await self.set_authorized_key(
                            test_provider,
                            test_key,
                            admin_token["token"]
                        )
                        test_results["authorized_operations"]["set_key"] = set_result
                        
                        if set_result:
                            # Issue listing capability
                            list_token = await self.auth.issue_capability("root", "test-user", {
                                "can": self.CAPABILITIES["KEY_LIST"],
                                "with": "*"
                            })
                            
                            # Test listing providers
                            providers = await self.list_authorized_providers(list_token["token"])
                            test_results["authorized_operations"]["list_providers"] = (
                                providers is not None and 
                                isinstance(providers, list) and 
                                test_provider in providers
                            )
                            
                            # Test getting key info
                            key_info = await self.get_authorized_key_info(test_provider, list_token["token"])
                            test_results["authorized_operations"]["get_info"] = (
                                key_info is not None and 
                                key_info.get("provider") == test_provider
                            )
                            
                            # Issue access capability
                            access_token = await self.auth.issue_capability("root", "test-user", {
                                "can": self.CAPABILITIES["KEY_ACCESS"],
                                "with": test_provider
                            })
                            
                            # Test getting a key
                            key = await self.get_authorized_key(test_provider, access_token["token"])
                            test_results["authorized_operations"]["get_key"] = key == test_key
                            
                            # Issue rotation capability
                            rotate_token = await self.auth.issue_capability("root", "test-user", {
                                "can": self.CAPABILITIES["KEY_ROTATE"],
                                "with": test_provider
                            })
                            
                            # Test rotating a key
                            new_key = f"rotated_key_{int(time.time())}"
                            rotate_result = await self.rotate_authorized_key(
                                test_provider,
                                new_key,
                                rotate_token["token"]
                            )
                            test_results["authorized_operations"]["rotate_key"] = rotate_result
                            
                            # Issue a key access capability to another principal
                            await self.auth.create_principal("another-user")
                            
                            issuance_result = await self.issue_key_access_capability(
                                test_provider,
                                "another-user",
                                admin_token["token"]
                            )
                            test_results["authorized_operations"]["issue_capability"] = issuance_result is not None
                            
                            # Test deleting a key
                            delete_result = await self.delete_authorized_key(
                                test_provider,
                                admin_token["token"]
                            )
                            test_results["authorized_operations"]["delete_key"] = delete_result
                
                # Overall success
                test_results["success"] = (
                    test_results["initialization"] and 
                    test_results["capabilities"] and
                    all(test_results["authorized_operations"].values())
                )
                
                return test_results
        except Exception as e:
            logger.exception(f"Auth/keystore integration test failed: {e}")
            return {
                "success": False,
                "module": "auth_keystore_integration",
                "error": str(e),
                "integration": {
                    "module": "auth_keystore_integration",
                    "package": "auth_keystore_py",
                    "integration_type": "failed"
                }
            }


# Create default instance
auth_keystore_integration = AuthKeystoreIntegration()

# For API compatibility with JS version
def get_auth_keystore_integration():
    return auth_keystore_integration
