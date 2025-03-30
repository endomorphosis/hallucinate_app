"""
DID (Decentralized Identifier) utilities for UCAN
"""

import base64
from typing import Dict, Optional, Tuple, Any, Union


def create_did_from_public_key(public_key: bytes) -> str:
    """
    Create a DID:KEY identifier from a public key
    
    Args:
        public_key: Ed25519 public key bytes
        
    Returns:
        did: DID identifier string in did:key format
    """
    # For development, let's create a simple DID that we can easily decode
    # A real implementation would use multibase encoding and proper codec prefixes
    did = f"did:key:{public_key.hex()}"
    return did


def resolve_did_key(did: str) -> Optional[bytes]:
    """
    Resolve a DID:KEY to its public key
    
    Args:
        did: DID identifier string in did:key format
        
    Returns:
        public_key: Extracted public key or None if invalid
    """
    try:
        if not did.startswith("did:key:"):
            print(f"DID does not start with 'did:key:': {did}")
            return None
        
        # Extract the encoded part (we're using hex in our simplified format)
        hex_key = did[8:]  # After 'did:key:'
        
        # Convert hex to bytes
        try:
            public_key = bytes.fromhex(hex_key)
            print(f"Extracted public key of length: {len(public_key)} bytes")
            return public_key
        except Exception as e:
            print(f"Error decoding hex key: {e}")
            return None
    except Exception as e:
        print(f"Error resolving DID: {e}")
        return None
