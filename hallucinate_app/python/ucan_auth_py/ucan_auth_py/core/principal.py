"""
Principal implementation for UCAN
"""

import time
import json
from typing import Dict, List, Optional, Any, Union

from ..crypto.keys import KeyPair, generate_keypair
from ..crypto.did import create_did_from_public_key, resolve_did_key


class Principal:
    """
    Principal represents an entity that can issue or receive capabilities
    
    A principal has:
    - A DID (Decentralized Identifier)
    - A key pair for signing operations
    - Optional metadata
    """
    
    def __init__(self, did: Optional[str] = None, key_pair: Optional[KeyPair] = None, 
                 metadata: Optional[Dict[str, Any]] = None):
        """
        Initialize a principal
        
        Args:
            did: DID identifier (if None, generated from key pair)
            key_pair: Key pair for signing (if None, generated) 
            metadata: Additional metadata for this principal
        """
        self.key_pair = key_pair or generate_keypair()
        self.did = did or create_did_from_public_key(self.key_pair.public_key)
        self.metadata = metadata or {}
    
    @classmethod
    def from_public_key(cls, public_key: bytes, 
                       metadata: Optional[Dict[str, Any]] = None) -> 'Principal':
        """
        Create a principal from a public key (cannot sign)
        
        Args:
            public_key: Public key bytes
            metadata: Additional metadata
            
        Returns:
            Principal: Principal with the given public key
        """
        did = create_did_from_public_key(public_key)
        return cls(
            did=did,
            key_pair=KeyPair(public_key=public_key),
            metadata=metadata
        )
    
    @classmethod
    def from_did(cls, did: str, 
                metadata: Optional[Dict[str, Any]] = None) -> Optional['Principal']:
        """
        Create a principal from a DID (cannot sign)
        
        Args:
            did: DID identifier
            metadata: Additional metadata
            
        Returns:
            Principal: Principal with the extracted public key
        """
        public_key = resolve_did_key(did)
        if not public_key:
            return None
            
        return cls(
            did=did,
            key_pair=KeyPair(public_key=public_key),
            metadata=metadata
        )
    
    async def sign(self, data: Union[bytes, str]) -> bytes:
        """
        Sign data with this principal's private key
        
        Args:
            data: Data to sign
            
        Returns:
            bytes: Signature
        """
        if not self.key_pair.private_key:
            raise ValueError("Cannot sign: no private key available")
            
        # Convert string to bytes if needed
        if isinstance(data, str):
            data = data.encode('utf-8')
            
        return self.key_pair.sign(data)
    
    def can_sign(self) -> bool:
        """
        Check if this principal can sign data
        
        Returns:
            bool: True if this principal has a private key
        """
        return self.key_pair.private_key is not None
    
    def verify(self, data: Union[bytes, str], signature: bytes) -> bool:
        """
        Verify a signature against this principal's public key
        
        Args:
            data: Data that was signed
            signature: Signature to verify
            
        Returns:
            bool: True if the signature is valid
        """
        # Convert string to bytes if needed
        if isinstance(data, str):
            data = data.encode('utf-8')
            
        return self.key_pair.verify(data, signature)
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize principal to dictionary
        
        Returns:
            dict: Principal data
        """
        result = {
            "did": self.did,
            "publicKey": self.key_pair.to_dict()["publicKey"],
        }
        
        if self.metadata:
            result["metadata"] = self.metadata
            
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Principal':
        """
        Create principal from dictionary
        
        Args:
            data: Dictionary with principal data
            
        Returns:
            Principal: Created principal
        """
        did = data.get("did")
        public_key = data.get("publicKey")
        metadata = data.get("metadata")
        
        # Create key pair
        if public_key:
            import base64
            key_pair = KeyPair(
                public_key=base64.b64decode(public_key),
                private_key=None  # No private key in serialized form for security
            )
        else:
            # Generate key pair if no public key
            key_pair = generate_keypair()
            
        return cls(
            did=did,
            key_pair=key_pair,
            metadata=metadata
        )
