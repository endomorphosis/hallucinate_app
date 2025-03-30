"""
Cryptographic key utilities for UCAN
"""

import base64
from dataclasses import dataclass
from typing import Dict, Optional, Tuple, Any

import nacl.signing
import nacl.encoding


@dataclass
class KeyPair:
    """Key pair for UCAN operations"""
    public_key: bytes
    private_key: Optional[bytes] = None
    
    def to_dict(self) -> Dict[str, str]:
        """Convert key pair to dictionary"""
        result = {
            "publicKey": base64.b64encode(self.public_key).decode()
        }
        if self.private_key:
            result["privateKey"] = base64.b64encode(self.private_key).decode()
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, str]) -> 'KeyPair':
        """Create key pair from dictionary"""
        public_key = base64.b64decode(data["publicKey"])
        private_key = base64.b64decode(data["privateKey"]) if "privateKey" in data else None
        return cls(public_key=public_key, private_key=private_key)
    
    def sign(self, data: bytes) -> bytes:
        """Sign data with private key"""
        if not self.private_key:
            raise ValueError("Cannot sign without a private key")
        
        signing_key = nacl.signing.SigningKey(self.private_key)
        signed = signing_key.sign(data)
        return signed.signature
    
    def verify(self, data: bytes, signature: bytes) -> bool:
        """Verify signature with public key"""
        try:
            verify_key = nacl.signing.VerifyKey(self.public_key)
            verify_key.verify(data, signature)
            return True
        except Exception:
            return False


def generate_keypair() -> KeyPair:
    """Generate a new Ed25519 key pair"""
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    
    return KeyPair(
        public_key=bytes(verify_key),
        private_key=bytes(signing_key)
    )
