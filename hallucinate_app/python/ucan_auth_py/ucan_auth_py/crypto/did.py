"""
DID (Decentralized Identifier) utilities for UCAN
"""

import base64
import logging
from typing import Dict, Optional, Tuple, Any, Union

logger = logging.getLogger(__name__)


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
        
    Raises:
        TypeError: If did is not a string
    """
    if not isinstance(did, str):
        raise TypeError(f"Expected str for did, got {type(did).__name__}")

    if not did.startswith("did:key:"):
        logger.debug("DID does not start with 'did:key:': %s", did)
        return None

    # Extract the encoded part (we're using hex in our simplified format)
    hex_key = did[8:]  # After 'did:key:'

    # Convert hex to bytes; ValueError means the key portion is not valid hex
    try:
        return bytes.fromhex(hex_key)
    except ValueError:
        logger.debug("Error decoding hex key from DID: %s", did)
        return None
