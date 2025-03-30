"""
Cryptographic utilities for UCAN operations.

This package provides cryptographic functions needed for UCAN operations including:
- Key pair generation
- Signing
- Verification
- DID creation and resolution
"""

from .keys import generate_keypair, KeyPair
from .did import create_did_from_public_key, resolve_did_key

__all__ = [
    'generate_keypair',
    'KeyPair',
    'create_did_from_public_key',
    'resolve_did_key'
]
