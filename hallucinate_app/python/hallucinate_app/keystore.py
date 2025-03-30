"""
Keystore Integration Layer

This module serves as an integration layer for secure storage of API keys and credentials.
It integrates with the keystore_py package from PyPI which provides encrypted storage
and secure retrieval of sensitive information with platform-specific secure storage mechanisms.

The module's responsibility is to:
1. Import and provide access to keystore functionality from keystore_py
2. Run comprehensive tests to ensure the keystore functionality works
3. Integrate the keystore module with the resource pool
4. Provide a unified interface for other components to securely store and retrieve credentials
"""

import os
import json
import time
import logging
import secrets
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple
from datetime import datetime, timezone
import hashlib

# Set up logging
logger = logging.getLogger(__name__)

# Try to import keystore from keystore_py
HAS_KEYSTORE_PY = False
try:
    import keystore_py
    from keystore_py import KeystoreManager
    HAS_KEYSTORE_PY = True
    logger.info("KeyStore library loaded successfully")
except ImportError:
    logger.warning("keystore_py package not available, falling back to local implementation")
    logger.warning("To enable full keystore support, install: pip install keystore_py")

# For backwards compatibility - import platform storage
HAS_SECURE_STORAGE = False
try:
    import keyring
    HAS_SECURE_STORAGE = True
    logger.info("Platform secure storage available (keyring)")
except ImportError:
    logger.warning("Platform secure storage not available, using file-based encryption only")
    logger.warning("To enable platform secure storage, install: pip install keyring")

# Constants
DEFAULT_ENCRYPTION_ALGO = 'aes-256-gcm'
KEYSTORE_VERSION = '1.0'
AUTH_TAG_LENGTH = 16
IV_LENGTH = 12
SALT_LENGTH = 16
KEY_ITERATIONS = 100000
DEFAULT_KEY_DIGEST = 'sha512'


class Keystore:
    """
    Keystore integration layer for secure API key and credential management.
    
    This class serves as an integration layer for the keystore_py package,
    providing secure storage and retrieval of API keys and credentials.
    If the keystore_py package is not available, it falls back to a local
    implementation.
    """
    
    def __init__(self, options: Dict[str, Any] = None):
        """
        Create a new Keystore instance
        
        Args:
            options: Configuration options
                - encryption_key: Master encryption key (or env variable)
                - storage_location: Path to store encrypted keys
                - algorithm: Encryption algorithm to use
        """
        options = options or {}
        self.initialized = False
        
        # Common options for both implementations
        self.options = {
            "encryption_key": options.get("encryption_key") or os.environ.get("KEYSTORE_MASTER_KEY"),
            "storage_location": options.get("storage_location") or 
                               str(Path.home() / ".hallucinate_app" / "keystore"),
            "algorithm": options.get("algorithm") or DEFAULT_ENCRYPTION_ALGO,
            "use_platform_storage": options.get("use_platform_storage", HAS_SECURE_STORAGE),
            "use_external_implementation": options.get("use_external_implementation", HAS_KEYSTORE_PY)
        }
        
        # Check if we should use the external implementation
        if not self.options["use_external_implementation"]:
            logger.info("Using local keystore implementation")
            # Storage for keys - only ever stored in memory, never in plaintext on disk
            self.keys: Dict[str, Dict[str, Any]] = {}
            
            # Metadata about key usage and rotation
            self.metadata = {
                "version": KEYSTORE_VERSION,
                "last_updated": None,
                "last_rotation": None,
                "access_counts": {}
            }
            
            # For encryption
            self.derived_key = None
            self._salt = None
        else:
            logger.info("Using keystore_py implementation")
            # Initialize the external implementation
            self.keystore_impl = KeystoreManager(
                encryption_key=self.options["encryption_key"],
                storage_location=self.options["storage_location"],
                algorithm=self.options["algorithm"],
                use_platform_storage=self.options["use_platform_storage"]
            )
        
        logger.info(f"Keystore initialized with storage at {self.options['storage_location']}")
    
    async def init(self) -> bool:
        """
        Initialize the keystore and load any existing keys
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure master key exists
            if not self.options["encryption_key"]:
                raise ValueError("No master encryption key provided. Set KEYSTORE_MASTER_KEY "
                               "environment variable or pass encryption_key option")
            
            if self.options["use_external_implementation"]:
                # Use the external implementation
                self.initialized = await self.keystore_impl.init()
                return self.initialized
            else:
                # Use the local implementation
                # Create storage directory if needed
                os.makedirs(self.options["storage_location"], exist_ok=True)
                
                # Derive a key from the master key for encryption
                await self._derive_encryption_key()
                
                # Try to load existing keystore
                await self._load_keys()
                
                self.initialized = True
                return True
        except Exception as e:
            logger.error(f"Failed to initialize keystore: {e}")
            return False
    
    async def _derive_encryption_key(self) -> bool:
        """
        Derive encryption key from master key
        
        Returns:
            bool: True if key derivation successful
        """
        try:
            import cryptography.hazmat.primitives.kdf.pbkdf2 as pbkdf2
            from cryptography.hazmat.primitives import hashes
            
            # Either use the provided key or derive one
            if len(self.options["encryption_key"]) >= 32:
                # Use the raw key if it's long enough
                self.derived_key = self.options["encryption_key"].encode('utf-8')[:32]
            else:
                # Try to load the salt first
                self._load_salt()
                
                # Generate a salt if we don't have one
                if not self._salt:
                    self._salt = os.urandom(SALT_LENGTH)
                    
                    # Store the salt in the keystore directory
                    salt_path = os.path.join(self.options["storage_location"], ".salt")
                    with open(salt_path, 'wb') as f:
                        f.write(self._salt)
                
                # Derive a key using PBKDF2
                kdf = pbkdf2.PBKDF2HMAC(
                    algorithm=getattr(hashes, DEFAULT_KEY_DIGEST.upper())(),
                    length=32,
                    salt=self._salt,
                    iterations=KEY_ITERATIONS
                )
                self.derived_key = kdf.derive(self.options["encryption_key"].encode('utf-8'))
            
            return True
        except Exception as e:
            logger.error(f"Failed to derive encryption key: {e}")
            raise
    
    def _load_salt(self) -> bool:
        """
        Load the salt if it exists
        
        Returns:
            bool: True if salt was loaded
        """
        salt_path = os.path.join(self.options["storage_location"], ".salt")
        if os.path.exists(salt_path):
            with open(salt_path, 'rb') as f:
                self._salt = f.read()
            return True
        return False
    
    async def _load_keys(self) -> bool:
        """
        Load keys from storage
        
        Returns:
            bool: True if keys were loaded successfully
        """
        keystore_path = os.path.join(self.options["storage_location"], "keystore.enc")
        
        try:
            # Try to load salt first
            self._load_salt()
            
            # Check if keystore file exists
            if not os.path.exists(keystore_path):
                # No existing keystore, initialize with empty state
                self.keys = {}
                self.metadata = {
                    "version": KEYSTORE_VERSION,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "last_rotation": None,
                    "access_counts": {}
                }
                return True
            
            # Read and decrypt the keystore
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            
            with open(keystore_path, 'rb') as f:
                encrypted_data = f.read()
            
            # First 12 bytes are IV, next 16 bytes are auth tag, rest is ciphertext
            iv = encrypted_data[:IV_LENGTH]
            auth_tag = encrypted_data[IV_LENGTH:IV_LENGTH + AUTH_TAG_LENGTH]
            ciphertext = encrypted_data[IV_LENGTH + AUTH_TAG_LENGTH:]
            
            # Create cipher
            aesgcm = AESGCM(self.derived_key)
            
            # Decrypt (this will raise an exception if the auth tag doesn't match)
            # We have to reconstruct the format expected by AESGCM
            nonce = iv
            decrypted = aesgcm.decrypt(nonce, ciphertext + auth_tag, None)
            
            # Parse the JSON
            keystore_data = json.loads(decrypted.decode('utf-8'))
            
            # Load into memory
            self.keys = keystore_data.get("keys", {})
            self.metadata = keystore_data.get("metadata", {
                "version": KEYSTORE_VERSION,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "last_rotation": None,
                "access_counts": {}
            })
            
            return True
        except Exception as e:
            logger.error(f"Failed to load keystore: {e}")
            
            # Initialize with empty state on error
            self.keys = {}
            self.metadata = {
                "version": KEYSTORE_VERSION,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "last_rotation": None,
                "access_counts": {}
            }
            
            return False
    
    async def _save_keys(self) -> bool:
        """
        Save keys to storage
        
        Returns:
            bool: True if keys were saved successfully
        """
        keystore_path = os.path.join(self.options["storage_location"], "keystore.enc")
        
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            
            # Update metadata
            self.metadata["last_updated"] = datetime.now(timezone.utc).isoformat()
            
            # Create the keystore data object
            keystore_data = {
                "keys": self.keys,
                "metadata": self.metadata
            }
            
            # Stringify the data
            keystore_string = json.dumps(keystore_data)
            
            # Generate a random IV
            iv = os.urandom(IV_LENGTH)
            
            # Create cipher
            aesgcm = AESGCM(self.derived_key)
            
            # Encrypt the data
            # AESGCM.encrypt returns ciphertext + auth_tag
            encrypted_with_tag = aesgcm.encrypt(iv, keystore_string.encode('utf-8'), None)
            
            # Extract auth tag (last 16 bytes)
            auth_tag = encrypted_with_tag[-AUTH_TAG_LENGTH:]
            encrypted = encrypted_with_tag[:-AUTH_TAG_LENGTH]
            
            # Combine IV, auth tag and encrypted data
            encrypted_data = iv + auth_tag + encrypted
            
            # Write to disk
            with open(keystore_path, 'wb') as f:
                f.write(encrypted_data)
            
            return True
        except Exception as e:
            logger.error(f"Failed to save keystore: {e}")
            return False
    
    async def set_key(self, provider: str, key: str, options: Dict[str, Any] = None) -> bool:
        """
        Store a key in the keystore
        
        Args:
            provider: Service provider (e.g., 'openai', 'huggingface')
            key: API key to store
            options: Additional options
                - name: Optional name for the key
                - expires_at: Optional expiration date
        
        Returns:
            bool: True if key was stored successfully
        """
        if not self.initialized:
            raise ValueError("Keystore not initialized. Call init() first")
        
        options = options or {}
        
        try:
            if self.options["use_external_implementation"]:
                # Use the external implementation
                return await self.keystore_impl.set_key(provider, key, options)
            else:
                # Use the local implementation
                # If using platform storage, also store there as backup
                if self.options["use_platform_storage"]:
                    service_name = f"hallucinate_app_{provider}"
                    keyring.set_password(service_name, "apikey", key)
                
                # Create or update the key entry
                self.keys[provider] = {
                    "key": key,
                    "name": options.get("name", "default"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "expires_at": options.get("expires_at").isoformat() if options.get("expires_at") else None,
                    "last_used": None,
                    "use_count": 0
                }
                
                # Initialize access count
                if provider not in self.metadata["access_counts"]:
                    self.metadata["access_counts"][provider] = 0
                
                # Save to disk
                await self._save_keys()
                
                return True
        except Exception as e:
            logger.error(f"Failed to set key for {provider}: {e}")
            return False
    
    async def get_key(self, provider: str) -> Optional[str]:
        """
        Retrieve a key from the keystore
        
        Args:
            provider: Service provider to get key for
        
        Returns:
            str: The API key or None if not found or expired
        """
        if not self.initialized:
            raise ValueError("Keystore not initialized. Call init() first")
        
        try:
            if self.options["use_external_implementation"]:
                # Use the external implementation
                return await self.keystore_impl.get_key(provider)
            else:
                # Use the local implementation
                # Check if key exists
                if provider not in self.keys:
                    # Try platform storage as fallback
                    if self.options["use_platform_storage"]:
                        try:
                            service_name = f"hallucinate_app_{provider}"
                            key = keyring.get_password(service_name, "apikey")
                            if key:
                                # Add it to our store for future use
                                await self.set_key(provider, key)
                                return key
                        except Exception as e:
                            logger.warning(f"Failed to retrieve key from platform storage: {e}")
                    return None
                
                # Check expiration
                if self.keys[provider]["expires_at"]:
                    expires_at = datetime.fromisoformat(self.keys[provider]["expires_at"])
                    if expires_at < datetime.now(timezone.utc):
                        logger.warning(f"Key for {provider} has expired")
                        return None
                
                # Update usage stats
                self.keys[provider]["last_used"] = datetime.now(timezone.utc).isoformat()
                self.keys[provider]["use_count"] += 1
                self.metadata["access_counts"][provider] += 1
                
                # Autosave after every 10 accesses
                if self.metadata["access_counts"][provider] % 10 == 0:
                    await self._save_keys()
                
                return self.keys[provider]["key"]
        except Exception as e:
            logger.error(f"Failed to get key for {provider}: {e}")
            return None
    
    async def delete_key(self, provider: str) -> bool:
        """
        Delete a key from the keystore
        
        Args:
            provider: Service provider to delete key for
        
        Returns:
            bool: True if key was deleted successfully
        """
        if not self.initialized:
            raise ValueError("Keystore not initialized. Call init() first")
        
        try:
            if self.options["use_external_implementation"]:
                # Use the external implementation
                return await self.keystore_impl.delete_key(provider)
            else:
                # Use the local implementation
                # Check if key exists
                if provider not in self.keys:
                    return False
                
                # Delete from platform storage if used
                if self.options["use_platform_storage"]:
                    try:
                        service_name = f"hallucinate_app_{provider}"
                        keyring.delete_password(service_name, "apikey")
                    except Exception as e:
                        logger.warning(f"Failed to delete from platform storage: {e}")
                
                # Delete the key
                del self.keys[provider]
                
                # Save to disk
                await self._save_keys()
                
                return True
        except Exception as e:
            logger.error(f"Failed to delete key for {provider}: {e}")
            return False
    
    async def list_providers(self) -> List[str]:
        """
        List all providers with stored keys
        
        Returns:
            list: Array of provider names
        """
        if not self.initialized:
            raise ValueError("Keystore not initialized. Call init() first")
        
        if self.options["use_external_implementation"]:
            # Use the external implementation
            return await self.keystore_impl.list_providers()
        else:
            # Use the local implementation
            return list(self.keys.keys())
    
    async def get_key_info(self, provider: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a key without exposing the key itself
        
        Args:
            provider: Service provider to get info for
        
        Returns:
            dict: Key information or None if not found
        """
        if not self.initialized:
            raise ValueError("Keystore not initialized. Call init() first")
        
        try:
            if self.options["use_external_implementation"]:
                # Use the external implementation
                return await self.keystore_impl.get_key_info(provider)
            else:
                # Use the local implementation
                # Check if key exists
                if provider not in self.keys:
                    return None
                
                # Return key info without the actual key
                key_info = self.keys[provider].copy()
                key_info.pop("key", None)
                
                # Add additional processed information
                is_expired = False
                if key_info.get("expires_at"):
                    expires_at = datetime.fromisoformat(key_info["expires_at"])
                    is_expired = expires_at < datetime.now(timezone.utc)
                
                return {
                    "provider": provider,
                    **key_info,
                    "is_expired": is_expired
                }
        except Exception as e:
            logger.error(f"Failed to get key info for {provider}: {e}")
            return None
    
    async def rotate_key(self, provider: str, new_key: str, options: Dict[str, Any] = None) -> bool:
        """
        Rotate a key (update to a new value)
        
        Args:
            provider: Service provider to rotate key for
            new_key: New API key
            options: Additional options
        
        Returns:
            bool: True if key was rotated successfully
        """
        if not self.initialized:
            raise ValueError("Keystore not initialized. Call init() first")
        
        options = options or {}
        
        try:
            if self.options["use_external_implementation"]:
                # Use the external implementation
                return await self.keystore_impl.rotate_key(provider, new_key, options)
            else:
                # Use the local implementation
                # Check if key exists
                if provider not in self.keys:
                    return False
                
                # Get current key info
                current_key_info = self.keys[provider].copy()
                current_key_info.pop("key", None)
                
                # Rotate in platform storage if used
                if self.options["use_platform_storage"]:
                    try:
                        service_name = f"hallucinate_app_{provider}"
                        keyring.set_password(service_name, "apikey", new_key)
                    except Exception as e:
                        logger.warning(f"Failed to update platform storage: {e}")
                
                # Create updated key entry
                self.keys[provider] = {
                    "key": new_key,
                    "name": options.get("name", current_key_info.get("name", "default")),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "expires_at": options.get("expires_at", current_key_info.get("expires_at")),
                    "last_used": None,
                    "use_count": 0,
                    "rotated_from": {
                        "created_at": current_key_info.get("created_at"),
                        "rotated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
                
                # Update metadata
                self.metadata["last_rotation"] = datetime.now(timezone.utc).isoformat()
                
                # Save to disk
                await self._save_keys()
                
                return True
        except Exception as e:
            logger.error(f"Failed to rotate key for {provider}: {e}")
            return False
    
    async def test(self) -> Dict[str, Any]:
        """
        Run a self-test on the keystore
        
        Returns:
            dict: Test results
        """
        logger.info("Testing keystore module")
        
        try:
            if self.options["use_external_implementation"]:
                # Use the external implementation but add integration info
                test_results = await self.keystore_impl.test()
                test_results["integration"] = {
                    "module": "keystore",
                    "package": "keystore_py",
                    "integration_type": "wrapper",
                    "direct_implementation": False
                }
                return test_results
            else:
                # Use the local implementation
                test_results = {
                    "success": True,
                    "module": "keystore",
                    "initialization": False,
                    "key_operations": {
                        "set": False,
                        "get": False,
                        "info": False,
                        "delete": False,
                        "rotate": False
                    },
                    "persistence": False,
                    "integration": {
                        "module": "keystore",
                        "package": "keystore_py",
                        "integration_type": "mock",
                        "direct_implementation": True,
                        "note": "Using local implementation because keystore_py is not available"
                    }
                }
                
                # Test initialization if not already initialized
                if not self.initialized:
                    init_result = await self.init()
                    test_results["initialization"] = init_result
                else:
                    test_results["initialization"] = True
                
                if test_results["initialization"]:
                    # Test key operations with a test provider
                    test_provider = f"test_provider_{int(time.time())}"
                    test_key = f"test_api_key_{int(time.time())}"
                    
                    # Test setting a key
                    set_result = await self.set_key(test_provider, test_key)
                    test_results["key_operations"]["set"] = set_result
                    
                    if set_result:
                        # Test getting key info
                        info_result = await self.get_key_info(test_provider)
                        test_results["key_operations"]["info"] = info_result is not None
                        
                        # Test getting a key
                        get_result = await self.get_key(test_provider)
                        test_results["key_operations"]["get"] = get_result == test_key
                        
                        # Test rotating a key
                        rotate_key = f"rotated_key_{int(time.time())}"
                        rotate_result = await self.rotate_key(test_provider, rotate_key)
                        test_results["key_operations"]["rotate"] = rotate_result
                        
                        # Verify rotation worked
                        get_rotated_result = await self.get_key(test_provider)
                        rotation_verified = get_rotated_result == rotate_key
                        
                        # Test deleting a key
                        delete_result = await self.delete_key(test_provider)
                        test_results["key_operations"]["delete"] = delete_result
                    
                    # Test persistence by saving and reloading
                    test_provider2 = f"test_provider_persistence_{int(time.time())}"
                    test_key2 = f"test_persistence_key_{int(time.time())}"
                    
                    await self.set_key(test_provider2, test_key2)
                    await self._save_keys()
                    
                    # Create a new instance to test loading
                    temp_keystore = Keystore(self.options)
                    await temp_keystore.init()
                    
                    persisted_key = await temp_keystore.get_key(test_provider2)
                    test_results["persistence"] = persisted_key == test_key2
                    
                    # Clean up
                    await self.delete_key(test_provider2)
                
                # Update overall success
                test_results["success"] = (
                    test_results["initialization"] and 
                    all(test_results["key_operations"].values()) and
                    test_results["persistence"]
                )
                
                return test_results
        except Exception as e:
            logger.error(f"Keystore test failed: {e}")
            return {
                "success": False,
                "module": "keystore",
                "error": str(e),
                "integration": {
                    "module": "keystore",
                    "package": "keystore_py",
                    "integration_type": "failed"
                }
            }
    
    @classmethod
    async def create(cls, options: Dict[str, Any] = None) -> 'Keystore':
        """
        Factory method to create and initialize a keystore instance
        
        Args:
            options: Configuration options
        
        Returns:
            Keystore: Initialized keystore instance
        """
        # Check if we should use the external implementation
        if options is None:
            options = {}
        
        use_external = options.get("use_external_implementation", HAS_KEYSTORE_PY)
        
        # Log which implementation we're using
        if use_external and HAS_KEYSTORE_PY:
            logger.info("Using keystore_py implementation for keystore (factory method)")
        else:
            logger.info("Using local implementation for keystore (factory method)")
        
        # Create and initialize the keystore
        keystore = cls(options)
        await keystore.init()
        return keystore


# Create default instance
keystore = Keystore()

# For API compatibility with JS version
def get_keystore():
    return keystore